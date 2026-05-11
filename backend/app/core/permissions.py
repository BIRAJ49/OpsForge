from collections import defaultdict, deque
from datetime import UTC, datetime, timedelta
from typing import Callable

from fastapi import Depends, Header, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_token
from app.models.project import Project
from app.models.user import User, UserRole

bearer_scheme = HTTPBearer(auto_error=False)
_rate_store: dict[str, deque[datetime]] = defaultdict(deque)


def rate_limit(name: str, limit: int, window_seconds: int) -> Callable:
    def dependency(request: Request) -> None:
        key = f"{name}:{request.client.host if request.client else 'unknown'}"
        now = datetime.now(UTC)
        bucket = _rate_store[key]
        while bucket and bucket[0] < now - timedelta(seconds=window_seconds):
            bucket.popleft()
        if len(bucket) >= limit:
            raise HTTPException(status_code=429, detail="Rate limit exceeded")
        bucket.append(now)

    return dependency


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(status_code=401, detail="Missing bearer token")
    payload = decode_token(credentials.credentials)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token")
    user = db.get(User, int(payload["sub"]))
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Inactive or missing user")
    if not user.is_verified:
        raise HTTPException(status_code=403, detail="Email verification required")
    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin role required")
    return current_user


def project_for_user(project_id: int, db: Session, user: User) -> Project:
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if user.role != UserRole.ADMIN and project.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Permission denied")
    return project


def request_meta(request: Request) -> tuple[str | None, str | None]:
    return (request.client.host if request.client else None, request.headers.get("user-agent"))
