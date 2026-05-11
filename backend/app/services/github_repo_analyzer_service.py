import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from fastapi import HTTPException

from app.core.config import settings


GITHUB_RE = re.compile(r"^https://github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)(?:\.git)?/?$")


def clone_github_repo(repo_url: str, branch_name: str = "main") -> Path:
    if not settings.ALLOW_GITHUB_IMPORT:
        raise HTTPException(status_code=403, detail="GitHub import is disabled")
    if not GITHUB_RE.match(repo_url):
        raise HTTPException(status_code=400, detail="GitHub repo URL is invalid")
    upload_root = Path(settings.UPLOAD_TEMP_DIR)
    upload_root.mkdir(parents=True, exist_ok=True)
    temp_dir = Path(tempfile.mkdtemp(prefix="analysis-", dir=upload_root))
    target = temp_dir / "repo"
    cmd = ["git", "clone", "--depth", "1", "--branch", branch_name or "main", repo_url, str(target)]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=90, check=False)
    if result.returncode != 0:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail="GitHub repo not accessible")
    return target
