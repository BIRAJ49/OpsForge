import base64
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from fastapi import HTTPException

from app.core.config import settings


GITHUB_RE = re.compile(r"^https://github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)(?:\.git)?/?$")


def _clone_env(token: str | None) -> dict[str, str] | None:
    env = os.environ.copy()
    env["GIT_TERMINAL_PROMPT"] = "0"
    if token:
        basic_token = base64.b64encode(f"x-access-token:{token}".encode("utf-8")).decode("ascii")
        env["GIT_CONFIG_COUNT"] = "1"
        env["GIT_CONFIG_KEY_0"] = "http.https://github.com/.extraheader"
        env["GIT_CONFIG_VALUE_0"] = f"AUTHORIZATION: Basic {basic_token}"
    return env


def clone_github_repo(repo_url: str, branch_name: str = "main", token: str | None = None) -> Path:
    if not settings.ALLOW_GITHUB_IMPORT:
        raise HTTPException(status_code=403, detail="GitHub import is disabled")
    match = GITHUB_RE.match(repo_url)
    if not match:
        raise HTTPException(status_code=400, detail="GitHub repo URL is invalid")
    if not shutil.which("git"):
        raise HTTPException(status_code=503, detail="Git is not installed in the backend runtime")
    owner, repo = match.groups()
    clone_url = f"https://github.com/{owner}/{repo}.git"
    branch = branch_name or "main"
    upload_root = Path(settings.UPLOAD_TEMP_DIR)
    upload_root.mkdir(parents=True, exist_ok=True)
    temp_dir = Path(tempfile.mkdtemp(prefix="analysis-", dir=upload_root))
    target = temp_dir / "repo"
    cmd = ["git", "clone", "--depth", "1", "--branch", branch, clone_url, str(target)]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=90, check=False, env=_clone_env(token))
    if result.returncode != 0:
        shutil.rmtree(temp_dir, ignore_errors=True)
        stderr = (result.stderr or "").lower()
        if "remote branch" in stderr and "not found" in stderr:
            detail = f"Branch '{branch}' was not found in this GitHub repository."
        elif any(part in stderr for part in ("authentication failed", "repository not found", "403", "could not read username")):
            detail = "GitHub repo not accessible. Reconnect GitHub, confirm the OAuth app has repository access, and verify the branch name."
        else:
            detail = "Could not clone the GitHub repository. Verify the repository URL and branch, then retry."
        raise HTTPException(status_code=400, detail=detail)
    return target
