from datetime import UTC, datetime

import httpx

from app.core.config import settings
from app.models.project import Project


def app_name(project: Project) -> str:
    return settings.ARGOCD_APP_FORMAT.replace("{project-name}", project.name).replace("{environment}", project.environment.value)


def configured() -> bool:
    return bool(settings.ARGOCD_SERVER and settings.ARGOCD_TOKEN)


async def status(project: Project) -> dict:
    name = app_name(project)
    base = {
        "sync_status": "not_connected",
        "health_status": "unknown",
        "current_revision": None,
        "target_revision": settings.GITHUB_DEFAULT_BRANCH,
        "app_name": name,
        "namespace": project.namespace,
        "last_sync_time": None,
        "message": "Argo CD token/server are not configured",
        "auto_sync": settings.ARGOCD_AUTO_SYNC,
        "prune": settings.ARGOCD_PRUNE,
        "self_heal": settings.ARGOCD_SELF_HEAL,
    }
    if not configured():
        return base
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(f"{settings.ARGOCD_SERVER}/api/v1/applications/{name}", headers={"Authorization": f"Bearer {settings.ARGOCD_TOKEN}"})
    if resp.status_code != 200:
        base["sync_status"] = "pending"
        base["message"] = "Argo CD application is not available yet"
        return base
    data = resp.json()
    return {
        **base,
        "sync_status": data.get("status", {}).get("sync", {}).get("status", "unknown"),
        "health_status": data.get("status", {}).get("health", {}).get("status", "unknown"),
        "current_revision": data.get("status", {}).get("sync", {}).get("revision"),
        "last_sync_time": data.get("status", {}).get("operationState", {}).get("finishedAt"),
        "message": "Argo CD status loaded",
    }


async def sync(project: Project) -> dict:
    if not configured():
        return {"status": "requires_token", "message": "Argo CD server/token are not configured", "app_name": app_name(project)}
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(f"{settings.ARGOCD_SERVER}/api/v1/applications/{app_name(project)}/sync", headers={"Authorization": f"Bearer {settings.ARGOCD_TOKEN}"})
    return {"status": "pending" if resp.status_code in (200, 202) else "error", "app_name": app_name(project), "message": "Sync requested" if resp.status_code in (200, 202) else resp.text[:500]}


async def refresh(project: Project) -> dict:
    if not configured():
        return {"status": "requires_token", "message": "Argo CD server/token are not configured", "app_name": app_name(project)}
    return {"status": "pending", "app_name": app_name(project), "message": "Refresh adapter ready for configured Argo CD"}


def history(project: Project) -> list[dict]:
    return [
        {"revision": "main", "deployed_at": datetime.now(UTC).isoformat(), "status": "pending", "message": "History requires Argo CD connection"},
    ]
