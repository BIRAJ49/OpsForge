from app.core.config import settings
from app.models.project import Project


def project_images(project: Project) -> list[dict]:
    tags = ["latest", "dev", "staging", "prod"]
    return [
        {
            "image": settings.GHCR_IMAGE_FORMAT.replace("{project-name}", project.name).replace("{tag}", tag),
            "tag": tag,
            "registry": settings.GHCR_REGISTRY,
            "status": "available_if_pushed_by_github_actions",
        }
        for tag in tags
    ]
