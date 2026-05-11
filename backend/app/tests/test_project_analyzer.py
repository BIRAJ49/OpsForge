import io
import zipfile
from pathlib import Path

from sqlalchemy import select

from app.core.database import SessionLocal
from app.models.user import User
from app.core.security import create_access_token, hash_password
from app.models.user import UserRole
from app.services.secret_scanner_service import masked_env_vars, scan_text_for_secrets
from app.services.stack_detector_service import detect_project


def _zip_bytes(files: dict[str, str]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for path, content in files.items():
            archive.writestr(path, content)
    buffer.seek(0)
    return buffer.read()


def _verified_user_token(client, email="analyzer@example.com"):
    with SessionLocal() as db:
        user = User(name="Analyzer User", email=email, password_hash=hash_password("password-123"), role=UserRole.USER, is_verified=True, is_active=True)
        db.add(user)
        db.flush()
        token = create_access_token(str(user.id), user.role.value)
        db.commit()
        return token


def _sample_project_zip() -> bytes:
    return _zip_bytes(
        {
            "frontend/package.json": '{"dependencies":{"@vitejs/plugin-react":"latest","vite":"latest","react":"latest"},"scripts":{"build":"vite build"}}',
            "frontend/vite.config.js": "export default {}",
            "backend/requirements.txt": "fastapi\nuvicorn\nsqlalchemy\npsycopg2-binary\nredis\n",
            "backend/app/main.py": "from fastapi import FastAPI\napp = FastAPI()\nDATABASE_URL='postgresql://user:pass@db/app'\nREDIS_URL='redis://redis:6379/0'\n",
            "backend/.env": "DATABASE_URL=postgresql://user:password@localhost/app\nJWT_SECRET_KEY=super-secret\n",
        }
    )


def test_zip_upload_success_analysis_and_generation(client):
    token = _verified_user_token(client)
    response = client.post(
        "/api/projects/upload",
        headers={"Authorization": f"Bearer {token}"},
        data={"project_name": "Analyzer App", "environment": "dev", "deployment_type": "gitops", "upload_type": "zip"},
        files={"file": ("app.zip", _sample_project_zip(), "application/zip")},
    )
    assert response.status_code == 201
    data = response.json()["data"]
    analysis = data["analysis"]
    assert analysis["detected_project_type"] == "fullstack"
    assert "React" in analysis["detected_stack"]
    assert "FastAPI" in analysis["detected_stack"]
    assert "PostgreSQL" in analysis["detected_databases"]
    assert "Redis" in analysis["detected_cache"]
    assert analysis["detected_env_vars"]["DATABASE_URL"] == "********"

    project_id = data["project"]["id"]
    generated = client.post(f"/api/projects/{project_id}/generate-from-analysis", headers={"Authorization": f"Bearer {token}"})
    assert generated.status_code == 200
    paths = {item["file_path"] for item in generated.json()["data"]}
    assert "docker-compose.yml" in paths
    assert ".github/workflows/ci-cd.yml" in paths
    assert "argocd/application.yaml" in paths
    assert "docs/risk-report.md" in paths


def test_invalid_zip_rejection(client):
    token = _verified_user_token(client, "invalidzip@example.com")
    response = client.post(
        "/api/projects/upload",
        headers={"Authorization": f"Bearer {token}"},
        data={"project_name": "Bad Zip", "environment": "dev", "deployment_type": "docker", "upload_type": "zip"},
        files={"file": ("bad.zip", b"not a zip", "application/zip")},
    )
    assert response.status_code == 400
    assert response.json()["error_code"] == "INVALID_UPLOAD"


def test_path_traversal_zip_rejection(client):
    token = _verified_user_token(client, "traversal@example.com")
    response = client.post(
        "/api/projects/upload",
        headers={"Authorization": f"Bearer {token}"},
        data={"project_name": "Traversal", "environment": "dev", "deployment_type": "docker", "upload_type": "zip"},
        files={"file": ("bad.zip", _zip_bytes({"../evil.txt": "x"}), "application/zip")},
    )
    assert response.status_code == 400
    assert "traversal" in response.json()["message"].lower()


def test_large_file_rejection(client, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "MAX_UPLOAD_SIZE_MB", 1)
    token = _verified_user_token(client, "large@example.com")
    response = client.post(
        "/api/projects/upload",
        headers={"Authorization": f"Bearer {token}"},
        data={"project_name": "Large Zip", "environment": "dev", "deployment_type": "docker", "upload_type": "zip"},
        files={"file": ("large.zip", b"x" * (1024 * 1024 + 1), "application/zip")},
    )
    assert response.status_code == 413


def test_stack_detector_rule_coverage(tmp_path: Path):
    (tmp_path / "frontend").mkdir()
    (tmp_path / "backend").mkdir()
    (tmp_path / "frontend" / "package.json").write_text('{"dependencies":{"vite":"latest","react":"latest","pg":"latest","redis":"latest"}}')
    (tmp_path / "frontend" / "package-lock.json").write_text("{}")
    (tmp_path / "backend" / "requirements.txt").write_text("fastapi\nsqlalchemy\npsycopg2\nredis\n")
    (tmp_path / "backend" / "main.py").write_text("from fastapi import FastAPI\n")
    result = detect_project(tmp_path)
    assert "React" in result["detected_stack"]
    assert "FastAPI" in result["detected_stack"]
    assert "PostgreSQL" in result["detected_databases"]
    assert "Redis" in result["detected_cache"]
    assert result["detected_ports"]["frontend"] == 5173
    assert result["detected_ports"]["backend"] == 8000


def test_secret_masking():
    masked, warnings = scan_text_for_secrets("AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF\nDATABASE_URL=postgresql://user:pass@db/app", ".env")
    env, env_warnings = masked_env_vars("DATABASE_URL=postgresql://user:pass@db/app\nSAFE_FLAG=true", ".env")
    assert "********" in masked
    assert warnings
    assert env["DATABASE_URL"] == "********"
    assert env["SAFE_FLAG"] == "********"
    assert env_warnings


def test_analysis_ownership_and_admin_access(client, admin_token):
    owner_token = _verified_user_token(client, "owner-analysis@example.com")
    other_token = _verified_user_token(client, "other-analysis@example.com")
    created = client.post(
        "/api/projects/upload",
        headers={"Authorization": f"Bearer {owner_token}"},
        data={"project_name": "Owned Analysis", "environment": "dev", "deployment_type": "gitops", "upload_type": "zip"},
        files={"file": ("app.zip", _sample_project_zip(), "application/zip")},
    ).json()["data"]
    project_id = created["project"]["id"]

    denied = client.get(f"/api/projects/{project_id}/analysis", headers={"Authorization": f"Bearer {other_token}"})
    assert denied.status_code == 403

    allowed = client.get(f"/api/projects/{project_id}/analysis", headers={"Authorization": f"Bearer {admin_token}"})
    assert allowed.status_code == 200
