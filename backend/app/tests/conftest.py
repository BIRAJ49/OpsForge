import os
import tempfile

os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.gettempdir()}/opsforge-test.db"
os.environ["JWT_SECRET_KEY"] = "test-secret"
os.environ["ADMIN_PASSWORD"] = "admin-password-123"

import pytest
from fastapi.testclient import TestClient

from app.core.database import Base, engine
from app.main import app
from app import models  # noqa: F401


@pytest.fixture(autouse=True)
def reset_db():
    from app.core.permissions import _rate_store

    _rate_store.clear()
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def admin_token(client):
    response = client.post("/api/auth/login", json={"email": "birajadhikari49@gmail.com", "password": "admin-password-123"})
    return response.json()["data"]["access_token"]
