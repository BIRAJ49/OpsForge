from app.core.config import settings


class KubernetesService:
    def __init__(self) -> None:
        self.namespace = settings.KUBERNETES_DEFAULT_NAMESPACE

    def _not_connected(self, resource: str) -> dict:
        return {
            "status": "not_connected",
            "resource": resource,
            "message": "Kubeconfig is not configured or cluster is not reachable",
            "context": settings.KUBERNETES_CONTEXT,
            "namespace": self.namespace,
        }

    def namespaces(self) -> dict:
        return {"status": "mock_or_configurable", "items": [settings.KUBERNETES_DEFAULT_NAMESPACE, settings.KUBERNETES_PRODUCTION_NAMESPACE]}

    def list_resource(self, resource: str) -> dict:
        if resource == "secrets":
            return {"status": "mock", "items": [{"name": "backend-secret", "namespace": self.namespace, "keys": ["DATABASE_URL", "JWT_SECRET_KEY"], "values": "masked"}]}
        return {"status": "mock", "items": [{"name": f"opsforge-{resource}-sample", "namespace": self.namespace, "status": "Running"}]}

    def pod_logs(self, pod_name: str) -> dict:
        return {"pod_name": pod_name, "logs": ["2026-05-06T13:00:00Z INFO service started", "2026-05-06T13:01:00Z WARN readiness probe delayed"]}

    def pod_events(self, pod_name: str) -> dict:
        return {"pod_name": pod_name, "events": [{"reason": "Started", "message": "Started container app"}, {"reason": "Pulled", "message": "Container image pulled"}]}


kubernetes_service = KubernetesService()
