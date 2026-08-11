from prometheus_client import CONTENT_TYPE_LATEST

from app import main as main_module


def test_legacy_health_and_liveness_endpoints(client):
    legacy_response = client.get("/api/health")
    assert legacy_response.status_code == 200
    assert legacy_response.json() == {
        "success": True,
        "message": "OpsForge API is healthy",
        "data": {"status": "healthy"},
    }

    live_response = client.get("/api/health/live")
    assert live_response.status_code == 200
    assert live_response.json()["data"] == {"status": "healthy"}


def test_readiness_checks_database(client):
    response = client.get("/api/health/ready")

    assert response.status_code == 200
    assert response.json()["data"] == {"status": "ready", "database": "healthy"}


def test_readiness_returns_503_when_database_is_unavailable(client, monkeypatch):
    def unavailable_connection():
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(main_module.engine, "connect", unavailable_connection)

    response = client.get("/api/health/ready")

    assert response.status_code == 503
    assert response.json() == {
        "success": False,
        "message": "OpsForge API is not ready",
        "error_code": "DATABASE_UNAVAILABLE",
    }


def test_metrics_use_route_templates_instead_of_request_paths(client):
    project_id = "987654321"
    response = client.get(f"/api/projects/{project_id}")
    assert response.status_code == 401

    unmatched_id = "unmatched-987654321"
    unmatched_response = client.get(f"/not-a-real-route/{unmatched_id}")
    assert unmatched_response.status_code == 404

    metrics_response = client.get("/metrics")
    assert metrics_response.status_code == 200
    assert metrics_response.headers["content-type"] == CONTENT_TYPE_LATEST

    metrics = metrics_response.text
    request_metric_lines = [
        line
        for line in metrics.splitlines()
        if line.startswith("opsforge_http_requests_total{")
    ]
    duration_metric_lines = [
        line
        for line in metrics.splitlines()
        if line.startswith("opsforge_http_request_duration_seconds_count{")
    ]

    assert any(
        'route="/api/projects/{project_id}"' in line for line in request_metric_lines
    )
    assert any(
        'route="/api/projects/{project_id}"' in line for line in duration_metric_lines
    )
    assert all(
        project_id not in line for line in request_metric_lines + duration_metric_lines
    )
    assert any('route="__unmatched__"' in line for line in request_metric_lines)
    assert all(
        unmatched_id not in line
        for line in request_metric_lines + duration_metric_lines
    )
    assert all(
        'route="/metrics"' not in line
        for line in request_metric_lines + duration_metric_lines
    )
