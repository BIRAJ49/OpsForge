import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.generated_file import GeneratedFile
from app.models.project import Project


def repo_name(project: Project) -> str:
    return settings.GITHUB_PROJECT_REPO_FORMAT.replace("{project-name}", project.name)


def repo_owner(github_username: str | None = None) -> str:
    return github_username or settings.GITHUB_USERNAME


def image_name(project: Project, tag: str = "latest") -> str:
    return settings.GHCR_IMAGE_FORMAT.replace("{project-name}", project.name).replace("{tag}", tag)


def github_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}


def _requires_user_connection() -> dict:
    return {
        "status": "requires_connection",
        "message": "GitHub is not connected for this account. Connect GitHub, then retry this action.",
        "action_url": "/app/connect-github",
    }


async def create_repo(db: Session, project: Project, token: str | None, github_username: str | None = None) -> dict:
    if not token:
        return _requires_user_connection()
    name = repo_name(project)
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post("https://api.github.com/user/repos", headers=github_headers(token), json={"name": name, "private": False, "auto_init": True})
    if resp.status_code not in (200, 201, 422):
        return {"status": "error", "message": "GitHub API repo creation failed", "details": resp.text[:500]}
    owner = repo_owner(github_username)
    project.github_repo_url = f"https://github.com/{owner}/{name}"
    return {"status": "configured", "repo": name, "url": project.github_repo_url}


async def push_files(db: Session, project: Project, files: list[GeneratedFile], token: str | None, github_username: str | None = None) -> dict:
    if not token:
        return _requires_user_connection()
    repo = repo_name(project)
    owner = repo_owner(github_username)
    async with httpx.AsyncClient(timeout=30) as client:
        read_ref_url = f"https://api.github.com/repos/{owner}/{repo}/git/ref/heads/{settings.GITHUB_DEFAULT_BRANCH}"
        update_ref_url = f"https://api.github.com/repos/{owner}/{repo}/git/refs/heads/{settings.GITHUB_DEFAULT_BRANCH}"
        last_update_error = ""
        last_commit_sha = ""
        for attempt in range(3):
            ref_resp = await client.get(read_ref_url, headers=github_headers(token))
            if ref_resp.status_code != 200:
                return {"status": "error", "repo": repo, "message": "Could not read repository branch", "details": ref_resp.text[:500]}

            base_commit_sha = ref_resp.json()["object"]["sha"]
            commit_resp = await client.get(
                f"https://api.github.com/repos/{owner}/{repo}/git/commits/{base_commit_sha}",
                headers=github_headers(token),
            )
            if commit_resp.status_code != 200:
                return {"status": "error", "repo": repo, "message": "Could not read repository commit", "details": commit_resp.text[:500]}

            base_tree_sha = commit_resp.json()["tree"]["sha"]
            tree_items = []
            for file in files:
                blob_resp = await client.post(
                    f"https://api.github.com/repos/{owner}/{repo}/git/blobs",
                    headers=github_headers(token),
                    json={"content": file.content, "encoding": "utf-8"},
                )
                if blob_resp.status_code not in (200, 201):
                    return {"status": "error", "repo": repo, "message": f"Could not prepare {file.file_path}", "details": blob_resp.text[:500]}
                tree_items.append({"path": file.file_path, "mode": "100644", "type": "blob", "sha": blob_resp.json()["sha"]})

            tree_resp = await client.post(
                f"https://api.github.com/repos/{owner}/{repo}/git/trees",
                headers=github_headers(token),
                json={"base_tree": base_tree_sha, "tree": tree_items},
            )
            if tree_resp.status_code not in (200, 201):
                return {"status": "error", "repo": repo, "message": "Could not create repository file tree", "details": tree_resp.text[:500]}

            new_commit_resp = await client.post(
                f"https://api.github.com/repos/{owner}/{repo}/git/commits",
                headers=github_headers(token),
                json={"message": "OpsForge: add generated DevOps files", "tree": tree_resp.json()["sha"], "parents": [base_commit_sha]},
            )
            if new_commit_resp.status_code not in (200, 201):
                return {"status": "error", "repo": repo, "message": "Could not create repository commit", "details": new_commit_resp.text[:500]}

            update_resp = await client.patch(
                update_ref_url,
                headers=github_headers(token),
                json={"sha": new_commit_resp.json()["sha"], "force": False},
            )
            if update_resp.status_code == 200:
                return {"status": "configured", "repo": repo, "files_pushed": len(files), "files_total": len(files)}
            last_update_error = update_resp.text[:500]
            last_commit_sha = new_commit_resp.json()["sha"]

        if last_commit_sha:
            force_resp = await client.patch(
                update_ref_url,
                headers=github_headers(token),
                json={"sha": last_commit_sha, "force": True},
            )
            if force_resp.status_code == 200:
                return {"status": "configured", "repo": repo, "files_pushed": len(files), "files_total": len(files)}
            last_update_error = force_resp.text[:500] or last_update_error

    return {"status": "error", "repo": repo, "message": f"Could not update repository branch: {last_update_error}" if last_update_error else "Could not update repository branch"}


async def create_gitops_repo(token: str | None, github_username: str | None = None) -> dict:
    if not token:
        return _requires_user_connection()
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post("https://api.github.com/user/repos", headers=github_headers(token), json={"name": settings.GITHUB_GITOPS_REPO, "private": False, "auto_init": True})
    if resp.status_code not in (200, 201, 422):
        return {"status": "error", "message": "GitOps repo creation failed", "details": resp.text[:500]}
    owner = repo_owner(github_username)
    return {"status": "configured", "repo": settings.GITHUB_GITOPS_REPO, "url": f"https://github.com/{owner}/{settings.GITHUB_GITOPS_REPO}"}


async def update_gitops_image(project: Project, image_tag: str, token: str | None = None) -> dict:
    if not token:
        return {**_requires_user_connection(), "image": image_name(project, image_tag)}
    return {"status": "pending", "message": "GitOps image update endpoint prepared; commit adapter can be enabled with repo layout details", "image": image_name(project, image_tag)}
