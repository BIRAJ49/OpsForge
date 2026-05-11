from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.integration import Integration
from app.models.user import User
from app.utils.masking import mask_dict, mask_secret


def upsert_platform_integration(db: Session, provider: str, secret: str | None, config: dict | None, user: User) -> Integration:
    integration = db.scalar(select(Integration).where(Integration.provider == provider, Integration.scope == "platform", Integration.owner_id.is_(None)))
    if not integration:
        integration = Integration(provider=provider, scope="platform")
        db.add(integration)
    integration.secret_value = secret
    integration.config = config or {}
    integration.status = "configured" if secret or config else "not_connected"
    db.flush()
    return integration


def get_status(db: Session, provider: str) -> dict:
    integration = db.scalar(select(Integration).where(Integration.provider == provider, Integration.scope == "platform", Integration.owner_id.is_(None)))
    if not integration:
        return {"provider": provider, "status": "not_connected", "token": None, "config": {}}
    config = mask_dict(integration.config or {})
    return {"provider": provider, "status": integration.status, "token": mask_secret(integration.secret_value), "config": config}


def upsert_user_integration(db: Session, provider: str, secret: str | None, config: dict | None, user: User) -> Integration:
    integration = db.scalar(select(Integration).where(Integration.provider == provider, Integration.scope == "user", Integration.owner_id == user.id))
    if not integration:
        integration = Integration(provider=provider, scope="user", owner_id=user.id)
        db.add(integration)
    if secret:
        integration.secret_value = secret
    integration.config = config or integration.config or {}
    integration.status = "configured" if integration.secret_value or integration.config else "not_connected"
    db.flush()
    return integration


def get_user_status(db: Session, provider: str, user: User) -> dict:
    integration = db.scalar(select(Integration).where(Integration.provider == provider, Integration.scope == "user", Integration.owner_id == user.id))
    if not integration:
        return {"provider": provider, "scope": "user", "status": "not_connected", "token": None, "config": {}}
    return {
        "provider": provider,
        "scope": "user",
        "status": integration.status,
        "token": mask_secret(integration.secret_value),
        "config": mask_dict(integration.config or {}),
    }


def get_user_secret(db: Session, provider: str, user: User) -> str | None:
    integration = db.scalar(select(Integration).where(Integration.provider == provider, Integration.scope == "user", Integration.owner_id == user.id))
    if integration and integration.status == "configured" and integration.secret_value:
        return integration.secret_value
    return None


def get_user_config_value(db: Session, provider: str, user: User, key: str) -> str | None:
    integration = db.scalar(select(Integration).where(Integration.provider == provider, Integration.scope == "user", Integration.owner_id == user.id))
    if integration and integration.status == "configured" and integration.config:
        value = integration.config.get(key)
        return str(value) if value else None
    return None


def delete_user_integration(db: Session, provider: str, user: User) -> bool:
    integration = db.scalar(select(Integration).where(Integration.provider == provider, Integration.scope == "user", Integration.owner_id == user.id))
    if not integration:
        return False
    db.delete(integration)
    db.flush()
    return True


def list_integrations(db: Session) -> list[dict]:
    providers = ["github", "ghcr", "argocd", "kubernetes"]
    return [get_status(db, provider) for provider in providers]
