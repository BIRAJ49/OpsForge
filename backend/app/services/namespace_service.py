from app.core.config import settings


PLATFORM_NAMESPACE = "opsforge-system"


def user_app_namespace(environment: str | None = None, stored_namespace: str | None = None) -> str:
    env = (environment or "").lower()
    if env == "prod":
        return settings.KUBERNETES_PRODUCTION_NAMESPACE
    if stored_namespace and stored_namespace != PLATFORM_NAMESPACE:
        return stored_namespace
    return settings.KUBERNETES_DEFAULT_NAMESPACE if settings.KUBERNETES_DEFAULT_NAMESPACE != PLATFORM_NAMESPACE else "opsforge"
