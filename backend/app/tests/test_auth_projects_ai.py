from sqlalchemy import select

from app.core.database import SessionLocal
from app.models.user import User


def test_registration_email_verification_login_refresh(client, monkeypatch):
    monkeypatch.setattr("app.services.email_service.generate_code", lambda: "123456")
    register = client.post("/api/auth/register", json={"name": "Dev User", "email": "dev@example.com", "password": "password-123"})
    assert register.status_code == 201

    blocked_login = client.post("/api/auth/login", json={"email": "dev@example.com", "password": "password-123"})
    assert blocked_login.status_code == 403

    verify = client.post("/api/auth/verify-email", json={"email": "dev@example.com", "code": "123456"})
    assert verify.status_code == 200

    login = client.post("/api/auth/login", json={"email": "dev@example.com", "password": "password-123"})
    assert login.status_code == 200
    refresh_token = login.json()["data"]["refresh_token"]

    refresh = client.post("/api/auth/refresh", json={"refresh_token": refresh_token})
    assert refresh.status_code == 200


def _verified_user_token(client):
    client.post("/api/auth/register", json={"name": "Owner One", "email": "owner@example.com", "password": "password-123"})
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == "owner@example.com"))
        user.is_verified = True
        db.commit()
    login = client.post("/api/auth/login", json={"email": "owner@example.com", "password": "password-123"})
    return login.json()["data"]["access_token"]


def test_project_creation_file_generation_and_ownership(client):
    owner_token = _verified_user_token(client)
    create = client.post(
        "/api/projects",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"name": "Payments API", "app_type": "fullstack", "deployment_type": "gitops", "environment": "dev"},
    )
    assert create.status_code == 201
    project_id = create.json()["data"]["id"]

    generate = client.post(f"/api/projects/{project_id}/generate", headers={"Authorization": f"Bearer {owner_token}"})
    assert generate.status_code == 200
    assert len(generate.json()["data"]) >= 30

    other_token = None
    client.post("/api/auth/register", json={"name": "Other User", "email": "other@example.com", "password": "password-123"})
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == "other@example.com"))
        user.is_verified = True
        db.commit()
    other_login = client.post("/api/auth/login", json={"email": "other@example.com", "password": "password-123"})
    other_token = other_login.json()["data"]["access_token"]

    forbidden = client.get(f"/api/projects/{project_id}", headers={"Authorization": f"Bearer {other_token}"})
    assert forbidden.status_code == 403


def test_admin_only_route_protection(client, admin_token):
    user_token = _verified_user_token(client)
    denied = client.get("/api/admin/users", headers={"Authorization": f"Bearer {user_token}"})
    assert denied.status_code == 403

    allowed = client.get("/api/admin/users", headers={"Authorization": f"Bearer {admin_token}"})
    assert allowed.status_code == 200


def test_rule_based_incident_analysis(client):
    token = _verified_user_token(client)
    project = client.post(
        "/api/projects",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Backend API", "app_type": "backend", "deployment_type": "kubernetes", "environment": "dev"},
    ).json()["data"]
    incident = client.post(
        "/api/incidents",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "project_id": project["id"],
            "title": "Backend pod CrashLoopBackOff",
            "severity": "high",
            "affected_service": "backend",
            "source": "kubernetes",
            "evidence": "CrashLoopBackOff readiness probe failed",
        },
    ).json()["data"]
    analysis = client.post(f"/api/incidents/{incident['id']}/analyze", headers={"Authorization": f"Bearer {token}"})
    assert analysis.status_code == 200
    assert "crashing" in analysis.json()["data"]["root_cause"].lower()
