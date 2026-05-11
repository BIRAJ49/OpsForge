from functools import lru_cache
from typing import Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    APP_NAME: str = "OpsForge"
    APP_ENV: str = "development"
    APP_DEBUG: bool = True
    API_PREFIX: str = "/api"

    DATABASE_URL: str = "postgresql://opsforge:opsforge@localhost:5432/opsforge"

    JWT_SECRET_KEY: str = "change-this-secret"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    CORS_ORIGINS: str = "http://localhost:5173"

    ADMIN_EMAIL: str = "birajadhikari49@gmail.com"
    ADMIN_PASSWORD: str = "change-this-admin-password"
    ADMIN_NAME: str = "Biraj Admin"

    EMAIL_PROVIDER: Literal["console", "smtp", "resend"] = "console"
    SMTP_HOST: str | None = None
    SMTP_PORT: int | None = None
    SMTP_USERNAME: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_FROM_EMAIL: str = "birajadhikari49@gmail.com"
    RESEND_API_KEY: str | None = None

    GITHUB_CLIENT_MODE: str = "token"
    GITHUB_TOKEN: str | None = None
    GITHUB_USERNAME: str = "BIRAJ49"
    GITHUB_DEFAULT_BRANCH: str = "main"
    GITHUB_PROJECT_REPO_FORMAT: str = "opsforge-{project-name}"
    GITHUB_GITOPS_REPO: str = "opsforge-gitops"
    GITHUB_OAUTH_CLIENT_ID: str | None = None
    GITHUB_OAUTH_CLIENT_SECRET: str | None = None
    GITHUB_OAUTH_REDIRECT_URI: str = "http://localhost:8000/api/integrations/github/oauth/callback"
    FRONTEND_URL: str = "http://localhost:5173"

    GHCR_REGISTRY: str = "ghcr.io"
    GHCR_USERNAME: str = "BIRAJ49"
    GHCR_TOKEN: str | None = None
    GHCR_IMAGE_FORMAT: str = "ghcr.io/BIRAJ49/{project-name}:{tag}"

    KUBERNETES_MODE: str = "kubeconfig"
    KUBECONFIG_PATH: str | None = None
    KUBERNETES_CONTEXT: str = "opsforge-k3d"
    KUBERNETES_LOCAL_CLUSTER: str = "opsforge"
    KUBERNETES_DEFAULT_NAMESPACE: str = "opsforge"
    KUBERNETES_PRODUCTION_NAMESPACE: str = "opsforge-prod"
    KUBERNETES_PRODUCTION_TYPE: str = "k3s-ec2"

    ARGOCD_SERVER: str | None = None
    ARGOCD_TOKEN: str | None = None
    ARGOCD_USERNAME: str | None = None
    ARGOCD_PASSWORD: str | None = None
    ARGOCD_NAMESPACE: str = "argocd"
    ARGOCD_APP_FORMAT: str = "{project-name}-{environment}"
    ARGOCD_AUTO_SYNC: bool = True
    ARGOCD_PRUNE: bool = True
    ARGOCD_SELF_HEAL: bool = True

    AI_PROVIDER: str = "rule_based"
    AI_ENABLED: bool = False
    PROJECT_ANALYZER_MODE: str = "rule_based"
    MAX_UPLOAD_SIZE_MB: int = 50
    MAX_UPLOAD_FILE_SIZE_MB: int = 100
    UPLOAD_TEMP_DIR: str = "/tmp/opsforge-uploads"
    DELETE_UPLOAD_AFTER_ANALYSIS: bool = True
    ALLOW_GITHUB_IMPORT: bool = True
    ALLOW_ZIP_UPLOAD: bool = True
    MONITORING_MODE: str = "mock"

    TRIVY_ENABLED: bool = True
    TRIVY_PATH: str = "trivy"

    REDIS_URL: str = "redis://localhost:6379/0"

    @field_validator("CORS_ORIGINS")
    @classmethod
    def validate_cors(cls, value: str) -> str:
        return value or "http://localhost:5173"

    @field_validator("SMTP_PORT", mode="before")
    @classmethod
    def blank_int_to_none(cls, value):
        return None if value == "" else value

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @model_validator(mode="after")
    def validate_production_secrets(self):
        if self.APP_ENV.lower() == "production":
            weak_values = {
                "JWT_SECRET_KEY": self.JWT_SECRET_KEY,
                "ADMIN_PASSWORD": self.ADMIN_PASSWORD,
            }
            for name, value in weak_values.items():
                if value.startswith("change-this") or len(value) < 16:
                    raise ValueError(f"{name} must be set to a strong environment value in production")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
