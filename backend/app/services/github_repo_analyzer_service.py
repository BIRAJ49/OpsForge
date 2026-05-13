import re
import shutil
import subprocess
import tempfile
import os
from pathlib import Path

from fastapi import HTTPException

from app.core.config import settings


GITHUB_RE = re.compile(r"^https://github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)(?:\.git)?/?$")


def _clone_env(temp_dir: Path, token: str | None) -> dict | None:
    if not token:
        return None
    askpass = temp_dir / "git-askpass.sh"
    askpass.write_text(
        "#!/bin/sh\n"
        "case \"$1\" in\n"
        "  *Username*) echo x-access-token ;;\n"
        "  *Password*) echo \"$GITHUB_TOKEN\" ;;\n"
        "  *) echo \"$GITHUB_TOKEN\" ;;\n"
        "esac\n",
    )
    askpass.chmod(0o700)
    env = os.environ.copy()
    env["GIT_ASKPASS"] = str(askpass)
    env["GITHUB_TOKEN"] = token
    env["GIT_TERMINAL_PROMPT"] = "0"
    return env


def clone_github_repo(repo_url: str, branch_name: str = "main", token: str | None = None) -> Path:
    if not settings.ALLOW_GITHUB_IMPORT:
        raise HTTPException(status_code=403, detail="GitHub import is disabled")
    if not GITHUB_RE.match(repo_url):
        raise HTTPException(status_code=400, detail="GitHub repo URL is invalid")
    if not shutil.which("git"):
        raise HTTPException(status_code=503, detail="Git is not installed in the backend runtime")
    upload_root = Path(settings.UPLOAD_TEMP_DIR)
    upload_root.mkdir(parents=True, exist_ok=True)
    temp_dir = Path(tempfile.mkdtemp(prefix="analysis-", dir=upload_root))
    target = temp_dir / "repo"
    cmd = ["git", "clone", "--depth", "1", "--branch", branch_name or "main", repo_url, str(target)]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=90, check=False, env=_clone_env(temp_dir, token))
    if result.returncode != 0:
        shutil.rmtree(temp_dir, ignore_errors=True)
        detail = "GitHub repo not accessible. Connect GitHub first for private repositories and verify the branch name."
        raise HTTPException(status_code=400, detail=detail)
    return target
