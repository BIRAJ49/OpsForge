import re
import shutil
import tempfile
from pathlib import Path
from urllib.parse import quote

import httpx
from fastapi import HTTPException

from app.core.config import settings
from app.services.upload_service import extract_zip_archive


GITHUB_RE = re.compile(
    r"^https://github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)(?:\.git)?/?$"
)
GITHUB_API_ROOT = "https://api.github.com"


def _github_headers(token: str | None) -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _validated_branch(branch_name: str | None) -> str:
    raw_branch = branch_name or ""
    branch = raw_branch.strip()
    if not branch:
        return ""
    parts = branch.split("/")
    forbidden = " ~^:?*[\\"
    invalid = (
        branch != raw_branch
        or len(branch.encode("utf-8")) > 255
        or branch.startswith(("-", ".", "/"))
        or branch.endswith((".", "/"))
        or ".." in branch
        or "@{" in branch
        or "//" in branch
        or branch == "@"
        or any(character in branch for character in forbidden)
        or any(ord(character) < 32 or ord(character) == 127 for character in branch)
        or any(part.startswith(".") or part.endswith(".lock") for part in parts)
    )
    if invalid:
        raise HTTPException(status_code=400, detail="GitHub branch name is invalid")
    return branch


def _archive_url(owner: str, repo: str, branch: str = "") -> str:
    url = f"{GITHUB_API_ROOT}/repos/{quote(owner, safe='')}/{quote(repo, safe='')}/zipball"
    return f"{url}/{quote(branch, safe='')}" if branch else url


def _download_archive(url: str, destination: Path, token: str | None) -> int:
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    try:
        with httpx.stream(
            "GET",
            url,
            headers=_github_headers(token),
            follow_redirects=True,
            timeout=90,
        ) as response:
            if response.status_code == 404:
                return response.status_code
            if response.status_code in {401, 403}:
                raise HTTPException(
                    status_code=400,
                    detail="GitHub repo not accessible. Reconnect GitHub and confirm the OAuth app has repository access.",
                )
            if response.status_code >= 400:
                raise HTTPException(
                    status_code=502,
                    detail="GitHub could not provide the repository archive",
                )
            content_length = response.headers.get("content-length", "")
            declared_size = int(content_length) if content_length.isdecimal() else 0
            if declared_size > max_bytes:
                raise HTTPException(
                    status_code=413, detail="GitHub repository archive is too large"
                )
            total = 0
            with destination.open("wb") as archive:
                for chunk in response.iter_bytes(1024 * 1024):
                    total += len(chunk)
                    if total > max_bytes:
                        raise HTTPException(
                            status_code=413,
                            detail="GitHub repository archive is too large",
                        )
                    archive.write(chunk)
            return response.status_code
    except HTTPException:
        raise
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502, detail="GitHub repository download failed"
        ) from exc


def _archive_root(extract_dir: Path) -> Path:
    children = list(extract_dir.iterdir())
    if len(children) != 1 or not children[0].is_dir():
        raise HTTPException(
            status_code=400, detail="GitHub returned an invalid repository archive"
        )
    return children[0]


def clone_github_repo(
    repo_url: str, branch_name: str | None = None, token: str | None = None
) -> Path:
    if not settings.ALLOW_GITHUB_IMPORT:
        raise HTTPException(status_code=403, detail="GitHub import is disabled")
    match = GITHUB_RE.fullmatch(repo_url)
    if not match:
        raise HTTPException(status_code=400, detail="GitHub repo URL is invalid")
    owner, repo = match.groups()
    repo = repo.removesuffix(".git")
    if owner in {".", ".."} or repo in {"", ".", ".."}:
        raise HTTPException(status_code=400, detail="GitHub repo URL is invalid")
    branch = _validated_branch(branch_name)
    upload_root = Path(settings.UPLOAD_TEMP_DIR)
    upload_root.mkdir(parents=True, exist_ok=True)
    temp_dir = Path(tempfile.mkdtemp(prefix="analysis-", dir=upload_root))
    archive_path = temp_dir / "source.zip"
    try:
        status = _download_archive(
            _archive_url(owner, repo, branch), archive_path, token
        )
        if status == 404 and branch:
            status = _download_archive(_archive_url(owner, repo), archive_path, token)
        if status == 404:
            raise HTTPException(
                status_code=400,
                detail="GitHub repo not accessible. Reconnect GitHub and confirm the OAuth app has repository access.",
            )
        extract_dir, _ = extract_zip_archive(archive_path, temp_dir)
        return _archive_root(extract_dir)
    except Exception:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise
