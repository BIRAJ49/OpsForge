from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.permissions import get_current_user, require_admin, request_meta
from app.core.response import success_response
from app.models.user import User
from app.schemas.integration import IntegrationConnect
from app.services.audit_service import record_audit
from app.services.integration_service import delete_user_integration, get_status, get_user_status, list_integrations, upsert_platform_integration, upsert_user_integration

router = APIRouter(prefix="/integrations", tags=["integrations"])


def _github_oauth_state(user_id: int) -> str:
    payload = {
        "sub": str(user_id),
        "type": "github_oauth_state",
        "exp": datetime.now(UTC) + timedelta(minutes=10),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def _decode_github_oauth_state(state: str) -> int:
    try:
        payload = jwt.decode(state, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError as exc:
        raise HTTPException(status_code=400, detail="Invalid GitHub OAuth state") from exc
    if payload.get("type") != "github_oauth_state":
        raise HTTPException(status_code=400, detail="Invalid GitHub OAuth state")
    return int(payload["sub"])


@router.get("")
def list_all(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return success_response("Integrations loaded", list_integrations(db))


def _connect(provider: str, payload: IntegrationConnect, request: Request, db: Session, admin):
    secret = payload.token or payload.password
    config = payload.model_dump(exclude={"token", "password"}, exclude_none=True)
    integration = upsert_platform_integration(db, provider, secret, config, admin)
    ip, ua = request_meta(request)
    record_audit(db, user_id=admin.id, action="Integration update", resource_type="integration", resource_id=provider, ip_address=ip, user_agent=ua)
    if provider == "github":
        record_audit(db, user_id=admin.id, action="GitHub integration connection", resource_type="integration", resource_id=provider, ip_address=ip, user_agent=ua)
    db.commit()
    return success_response(f"{provider} integration updated", get_status(db, provider))


@router.post("/github/connect")
def github_connect(payload: IntegrationConnect, request: Request, db: Session = Depends(get_db), admin=Depends(require_admin)):
    return _connect("github", payload, request, db, admin)


@router.get("/github/status")
def github_status(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    user_status = get_user_status(db, "github", current_user)
    if user_status["status"] == "configured":
        return success_response("GitHub status loaded", user_status)
    return success_response("GitHub status loaded", get_status(db, "github"))


@router.post("/github/user/connect")
def github_user_connect(payload: IntegrationConnect, request: Request, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    secret = payload.token or payload.password
    config = payload.model_dump(exclude={"token", "password"}, exclude_none=True)
    upsert_user_integration(db, "github", secret, config, current_user)
    ip, ua = request_meta(request)
    record_audit(db, user_id=current_user.id, action="User GitHub integration connection", resource_type="integration", resource_id="github", ip_address=ip, user_agent=ua)
    db.commit()
    return success_response("GitHub account connected", get_user_status(db, "github", current_user))


@router.post("/github/oauth/start")
def github_oauth_start(current_user=Depends(get_current_user)):
    if not settings.GITHUB_OAUTH_CLIENT_ID:
        raise HTTPException(status_code=400, detail="GitHub OAuth client ID is not configured")
    query = urlencode(
        {
            "client_id": settings.GITHUB_OAUTH_CLIENT_ID,
            "redirect_uri": settings.GITHUB_OAUTH_REDIRECT_URI,
            "scope": "repo workflow write:packages read:packages",
            "state": _github_oauth_state(current_user.id),
            "allow_signup": "true",
        }
    )
    return success_response("GitHub OAuth URL created", {"auth_url": f"https://github.com/login/oauth/authorize?{query}"})


@router.delete("/github/user")
def github_user_disconnect(request: Request, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    deleted = delete_user_integration(db, "github", current_user)
    ip, ua = request_meta(request)
    record_audit(db, user_id=current_user.id, action="User GitHub integration disconnected", resource_type="integration", resource_id="github", ip_address=ip, user_agent=ua, status="success" if deleted else "not_connected")
    db.commit()
    return success_response("GitHub account disconnected" if deleted else "GitHub account was not connected", get_user_status(db, "github", current_user))


@router.get("/github/oauth/callback")
async def github_oauth_callback(code: str, state: str, request: Request, db: Session = Depends(get_db)):
    if not settings.GITHUB_OAUTH_CLIENT_ID or not settings.GITHUB_OAUTH_CLIENT_SECRET:
        raise HTTPException(status_code=400, detail="GitHub OAuth is not configured")
    user_id = _decode_github_oauth_state(state)
    async with httpx.AsyncClient(timeout=30) as client:
        token_response = await client.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": settings.GITHUB_OAUTH_CLIENT_ID,
                "client_secret": settings.GITHUB_OAUTH_CLIENT_SECRET,
                "code": code,
                "redirect_uri": settings.GITHUB_OAUTH_REDIRECT_URI,
            },
        )
    token_data = token_response.json()
    access_token = token_data.get("access_token")
    if not access_token:
        return RedirectResponse(f"{settings.FRONTEND_URL}/app/connect-github?github=failed")
    login = None
    async with httpx.AsyncClient(timeout=30) as client:
        user_response = await client.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github+json"},
        )
        if user_response.status_code == 200:
            login = user_response.json().get("login")
    user = db.get(User, user_id)
    if not user:
        return RedirectResponse(f"{settings.FRONTEND_URL}/login?github=failed")
    upsert_user_integration(db, "github", access_token, {"method": "oauth", "login": login}, user)
    ip, ua = request_meta(request)
    record_audit(db, user_id=user.id, action="User GitHub OAuth connection", resource_type="integration", resource_id="github", ip_address=ip, user_agent=ua)
    db.commit()
    return RedirectResponse(f"{settings.FRONTEND_URL}/app/connect-github?github=connected")


@router.post("/ghcr/connect")
def ghcr_connect(payload: IntegrationConnect, request: Request, db: Session = Depends(get_db), admin=Depends(require_admin)):
    return _connect("ghcr", payload, request, db, admin)


@router.get("/ghcr/status")
def ghcr_status(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    user_status = get_user_status(db, "ghcr", current_user)
    if user_status["status"] == "configured":
        return success_response("GHCR status loaded", user_status)
    return success_response("GHCR status loaded", get_status(db, "ghcr"))


@router.post("/argocd/connect")
def argocd_connect(payload: IntegrationConnect, request: Request, db: Session = Depends(get_db), admin=Depends(require_admin)):
    return _connect("argocd", payload, request, db, admin)


@router.get("/argocd/status")
def argocd_status(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return success_response("Argo CD status loaded", get_status(db, "argocd"))


@router.post("/kubernetes/connect")
def kubernetes_connect(payload: IntegrationConnect, request: Request, db: Session = Depends(get_db), admin=Depends(require_admin)):
    return _connect("kubernetes", payload, request, db, admin)


@router.get("/kubernetes/status")
def kubernetes_status(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return success_response("Kubernetes status loaded", get_status(db, "kubernetes"))
