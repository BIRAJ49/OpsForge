from datetime import UTC, datetime

import httpx
import yaml
from kubernetes import client, config
from kubernetes.client import ApiException

from app.core.config import settings
from app.models.project import Project
from app.services.namespace_service import user_app_namespace


def app_name(project: Project) -> str:
    environment = getattr(project.environment, "value", project.environment)
    return settings.ARGOCD_APP_FORMAT.replace("{project-name}", project.name).replace("{environment}", environment)


def _api_error_message(exc: ApiException) -> str:
    if exc.status == 403:
        return "OpsForge is missing RBAC permission to read Argo CD Application resources."
    if exc.status == 404:
        return "Argo CD Application CRD or selected application was not found."
    return exc.reason or str(exc)


def configured() -> bool:
    return bool(settings.ARGOCD_SERVER and settings.ARGOCD_TOKEN)


def _load_kubernetes_config() -> bool:
    try:
        if settings.KUBERNETES_MODE == "incluster":
            config.load_incluster_config()
        elif settings.KUBECONFIG_PATH:
            config.load_kube_config(config_file=settings.KUBECONFIG_PATH, context=settings.KUBERNETES_CONTEXT)
        else:
            config.load_kube_config(context=settings.KUBERNETES_CONTEXT)
        return True
    except Exception:
        return False


def _custom_api():
    if not _load_kubernetes_config():
        return None
    return client.CustomObjectsApi()


def _application_from_crd(data: dict) -> dict:
    metadata = data.get("metadata", {})
    spec = data.get("spec", {})
    status_data = data.get("status", {})
    sync_status = status_data.get("sync", {})
    health_status = status_data.get("health", {})
    source = spec.get("source", {})
    destination = spec.get("destination", {})
    operation = status_data.get("operationState", {})
    automated = spec.get("syncPolicy", {}).get("automated") or {}
    return {
        "app_name": metadata.get("name"),
        "namespace": metadata.get("namespace"),
        "project": spec.get("project"),
        "repo_url": source.get("repoURL"),
        "path": source.get("path"),
        "target_revision": source.get("targetRevision") or settings.GITHUB_DEFAULT_BRANCH,
        "destination_namespace": destination.get("namespace"),
        "sync_status": sync_status.get("status", "unknown"),
        "health_status": health_status.get("status", "unknown"),
        "current_revision": sync_status.get("revision"),
        "last_sync_time": operation.get("finishedAt") or operation.get("startedAt"),
        "operation_phase": operation.get("phase"),
        "auto_sync": bool(automated),
        "prune": bool(automated.get("prune")),
        "self_heal": bool(automated.get("selfHeal")),
        "message": health_status.get("message") or "Argo CD application loaded from Kubernetes",
        "history": status_data.get("history") or [],
    }


def _base_status(project: Project, message: str = "Argo CD token/server are not configured") -> dict:
    name = app_name(project)
    namespace = _destination_namespace(project)
    return {
        "sync_status": "not_connected",
        "health_status": "unknown",
        "current_revision": None,
        "target_revision": settings.GITHUB_DEFAULT_BRANCH,
        "app_name": name,
        "namespace": namespace,
        "destination_namespace": namespace,
        "repo_url": project.gitops_repo_url,
        "path": None,
        "last_sync_time": None,
        "operation_phase": None,
        "message": message,
        "auto_sync": settings.ARGOCD_AUTO_SYNC,
        "prune": settings.ARGOCD_PRUNE,
        "self_heal": settings.ARGOCD_SELF_HEAL,
        "history": [],
    }


def _repo_url_for_project(project: Project) -> str:
    repo = settings.GITHUB_PROJECT_REPO_FORMAT.replace("{project-name}", project.name)
    return project.github_repo_url or f"https://github.com/{settings.GITHUB_USERNAME}/{repo}"


def _destination_namespace(project: Project) -> str:
    return user_app_namespace(getattr(project.environment, "value", project.environment), project.namespace)


def application_manifest(project: Project, path: str = "k8s") -> dict:
    name = app_name(project)
    return {
        "apiVersion": "argoproj.io/v1alpha1",
        "kind": "Application",
        "metadata": {
            "name": name,
            "namespace": settings.ARGOCD_NAMESPACE,
            "labels": {
                "app.kubernetes.io/managed-by": "opsforge",
                "opsforge.io/project-id": str(project.id),
            },
        },
        "spec": {
            "project": "default",
            "source": {
                "repoURL": _repo_url_for_project(project),
                "targetRevision": settings.GITHUB_DEFAULT_BRANCH,
                "path": path,
            },
            "destination": {
                "server": "https://kubernetes.default.svc",
                "namespace": _destination_namespace(project),
            },
            "syncPolicy": {
                "automated": {
                    "prune": settings.ARGOCD_PRUNE,
                    "selfHeal": settings.ARGOCD_SELF_HEAL,
                }
            },
        },
    }


def _get_application_from_kubernetes(name: str) -> dict | None:
    api = _custom_api()
    if not api:
        return None
    try:
        data = api.get_namespaced_custom_object(
            group="argoproj.io",
            version="v1alpha1",
            namespace=settings.ARGOCD_NAMESPACE,
            plural="applications",
            name=name,
        )
        return _application_from_crd(data)
    except ApiException as exc:
        if exc.status == 404:
            return None
        return {
            "app_name": name,
            "namespace": settings.ARGOCD_NAMESPACE,
            "sync_status": "not_connected",
            "health_status": "unknown",
            "message": _api_error_message(exc),
        }


def list_applications_from_kubernetes() -> list[dict]:
    api = _custom_api()
    if not api:
        return []
    data = api.list_namespaced_custom_object(
        group="argoproj.io",
        version="v1alpha1",
        namespace=settings.ARGOCD_NAMESPACE,
        plural="applications",
    )
    apps = [_application_from_crd(item) for item in data.get("items", [])]
    return sorted(apps, key=lambda app: app.get("app_name") or "")


def create_or_update_application(project: Project, path: str = "k8s") -> dict:
    name = app_name(project)
    manifest = application_manifest(project, path)
    api = _custom_api()
    if not api:
        return {"status": "requires_cluster", "app_name": name, "message": "Kubernetes cluster access is not configured"}
    try:
        api.create_namespaced_custom_object(
            group="argoproj.io",
            version="v1alpha1",
            namespace=settings.ARGOCD_NAMESPACE,
            plural="applications",
            body=manifest,
        )
        status_value = "created"
    except ApiException as exc:
        if exc.status != 409:
            return {"status": "error", "app_name": name, "message": _api_error_message(exc)}
        api.patch_namespaced_custom_object(
            group="argoproj.io",
            version="v1alpha1",
            namespace=settings.ARGOCD_NAMESPACE,
            plural="applications",
            name=name,
            body=manifest,
        )
        status_value = "updated"
    return {
        "status": status_value,
        "app_name": name,
        "repo_url": manifest["spec"]["source"]["repoURL"],
        "path": manifest["spec"]["source"]["path"],
        "namespace": manifest["spec"]["destination"]["namespace"],
        "manifest": yaml.safe_dump(manifest, sort_keys=False),
        "message": f"Argo CD application {name} {status_value}",
    }


async def list_applications() -> dict:
    if configured():
        try:
            async with httpx.AsyncClient(timeout=20, verify=False) as client:
                resp = await client.get(
                    f"{settings.ARGOCD_SERVER}/api/v1/applications",
                    headers={"Authorization": f"Bearer {settings.ARGOCD_TOKEN}"},
                )
            if resp.status_code == 200:
                items = resp.json().get("items", [])
                return {"mode": "argocd_api", "items": [_application_from_crd(item) for item in items], "error": None}
        except Exception as exc:
            fallback_error = str(exc)
        else:
            fallback_error = resp.text[:500]
    else:
        fallback_error = None
    try:
        return {"mode": "kubernetes_crd", "items": list_applications_from_kubernetes(), "error": fallback_error}
    except Exception as exc:
        return {"mode": "not_connected", "items": [], "error": str(exc)}


async def status(project: Project) -> dict:
    name = app_name(project)
    base = _base_status(project)
    if configured():
        async with httpx.AsyncClient(timeout=20, verify=False) as client:
            resp = await client.get(f"{settings.ARGOCD_SERVER}/api/v1/applications/{name}", headers={"Authorization": f"Bearer {settings.ARGOCD_TOKEN}"})
        if resp.status_code == 200:
            return {**base, **_application_from_crd(resp.json()), "message": "Argo CD status loaded from API"}
    try:
        app = _get_application_from_kubernetes(name)
    except Exception as exc:
        return {**base, "message": str(exc)}
    if app:
        if app.get("sync_status") == "not_connected":
            return {**base, **app}
        return {**base, **app, "message": "Argo CD status loaded from Kubernetes"}
    base["sync_status"] = "pending"
    base["message"] = "Argo CD application is not available yet"
    return base


async def sync(project: Project) -> dict:
    if not configured():
        return {"status": "requires_token", "message": "Argo CD server/token are not configured", "app_name": app_name(project)}
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(f"{settings.ARGOCD_SERVER}/api/v1/applications/{app_name(project)}/sync", headers={"Authorization": f"Bearer {settings.ARGOCD_TOKEN}"})
    return {"status": "pending" if resp.status_code in (200, 202) else "error", "app_name": app_name(project), "message": "Sync requested" if resp.status_code in (200, 202) else resp.text[:500]}


async def refresh(project: Project) -> dict:
    name = app_name(project)
    if configured():
        return {"status": "pending", "app_name": name, "message": "Refresh adapter ready for configured Argo CD"}
    api = _custom_api()
    if not api:
        return {"status": "requires_cluster", "message": "Kubernetes cluster access is not configured", "app_name": name}
    try:
        api.patch_namespaced_custom_object(
            group="argoproj.io",
            version="v1alpha1",
            namespace=settings.ARGOCD_NAMESPACE,
            plural="applications",
            name=name,
            body={"metadata": {"annotations": {"argocd.argoproj.io/refresh": "hard"}}},
        )
    except ApiException as exc:
        if exc.status == 404:
            return {
                "status": "not_found",
                "app_name": name,
                "message": f"Argo CD application {name} does not exist yet. Push/apply the generated argocd/application.yaml first.",
            }
        return {"status": "error", "app_name": name, "message": _api_error_message(exc)}
    return {"status": "pending", "app_name": name, "message": "Argo CD refresh requested through Kubernetes"}


def history(project: Project) -> list[dict]:
    try:
        app = _get_application_from_kubernetes(app_name(project))
    except Exception:
        app = None
    if app and app.get("history"):
        return [
            {
                "revision": item.get("revision") or item.get("deployStartedAt") or "unknown",
                "deployed_at": item.get("deployedAt") or item.get("deployStartedAt"),
                "status": "deployed",
                "message": item.get("source", {}).get("path") or "Argo CD deployment history",
            }
            for item in app["history"]
        ]
    return [{"revision": "main", "deployed_at": datetime.now(UTC).isoformat(), "status": "pending", "message": "No Argo CD history found"}]
