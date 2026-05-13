from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from app.core.config import settings


def _mock_series(name: str, base: int) -> list[dict]:
    now = datetime.now(UTC)
    return [
        {"timestamp": (now - timedelta(minutes=(5 - i) * 5)).isoformat(), "value": base + ((i * 7) % 18)}
        for i in range(6)
    ]


def _mock_metric(metric_name: str) -> dict:
    bases = {"cpu": 55, "memory": 68, "request-rate": 0, "error-rate": 0, "latency": 0, "restarts": 1}
    return {"metric": metric_name, "mode": "mock", "data": _mock_series(metric_name, bases.get(metric_name, 10))}


def _prometheus_get(path: str, params: dict[str, Any]) -> dict:
    response = httpx.get(
        f"{settings.PROMETHEUS_URL.rstrip('/')}{path}",
        params=params,
        timeout=settings.PROMETHEUS_QUERY_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    payload = response.json()
    if payload.get("status") != "success":
        raise RuntimeError(payload.get("error") or "Prometheus query failed")
    return payload["data"]


def _query_value(query: str) -> float:
    data = _prometheus_get("/api/v1/query", {"query": query})
    result = data.get("result") or []
    if not result:
        return 0.0
    return float(result[0]["value"][1])


def _query_range(metric_name: str, query: str) -> dict:
    now = datetime.now(UTC)
    start = now - timedelta(minutes=30)
    try:
        data = _prometheus_get(
            "/api/v1/query_range",
            {
                "query": query,
                "start": start.timestamp(),
                "end": now.timestamp(),
                "step": "5m",
            },
        )
        result = data.get("result") or []
        values = result[0].get("values", []) if result else []
        return {
            "metric": metric_name,
            "mode": "prometheus",
            "data": [
                {"timestamp": datetime.fromtimestamp(float(timestamp), UTC).isoformat(), "value": round(float(value), 2)}
                for timestamp, value in values
            ],
        }
    except Exception:
        return _mock_metric(metric_name)


PROMETHEUS_QUERIES = {
    "cpu": '100 * sum(rate(container_cpu_usage_seconds_total{container!="",image!=""}[5m])) / sum(machine_cpu_cores)',
    "memory": '100 * sum(container_memory_working_set_bytes{container!="",image!=""}) / sum(machine_memory_bytes)',
    "request-rate": 'sum(rate(apiserver_request_total[5m])) * 60',
    "error-rate": '100 * sum(rate(apiserver_request_total{code=~"5.."}[5m])) / clamp_min(sum(rate(apiserver_request_total[5m])), 1)',
    "latency": 'histogram_quantile(0.95, sum(rate(apiserver_request_duration_seconds_bucket[5m])) by (le)) * 1000',
    "restarts": 'sum(increase(kube_pod_container_status_restarts_total[5m]))',
}


def overview() -> dict:
    if settings.MONITORING_MODE != "prometheus":
        return {
            "mode": "mock",
            "cpu_usage": 63,
            "memory_usage": 71,
            "request_rate": 0,
            "error_rate": 0,
            "api_latency_ms": 0,
            "pod_restarts": 4,
            "active_alerts": 0,
            "service_health": [],
        }
    try:
        return {
            "mode": "prometheus",
            "cpu_usage": round(_query_value(PROMETHEUS_QUERIES["cpu"]), 2),
            "memory_usage": round(_query_value(PROMETHEUS_QUERIES["memory"]), 2),
            "request_rate": round(_query_value(PROMETHEUS_QUERIES["request-rate"]), 2),
            "error_rate": round(_query_value(PROMETHEUS_QUERIES["error-rate"]), 2),
            "api_latency_ms": round(_query_value(PROMETHEUS_QUERIES["latency"]), 2),
            "pod_restarts": round(_query_value(PROMETHEUS_QUERIES["restarts"]), 2),
            "active_alerts": len(alerts()),
            "service_health": [],
        }
    except Exception:
        return {**overview_mock(), "mode": "mock_fallback"}


def overview_mock() -> dict:
    return {
        "cpu_usage": 63,
        "memory_usage": 71,
        "request_rate": 0,
        "error_rate": 0,
        "api_latency_ms": 0,
        "pod_restarts": 4,
        "active_alerts": 0,
        "service_health": [],
    }


def metric(metric_name: str) -> dict:
    query = PROMETHEUS_QUERIES.get(metric_name)
    if settings.MONITORING_MODE != "prometheus" or not query:
        return _mock_metric(metric_name)
    return _query_range(metric_name, query)


def alerts() -> list[dict]:
    if settings.MONITORING_MODE != "prometheus":
        return []
    try:
        data = _prometheus_get("/api/v1/alerts", {})
        return [
            {
                "name": alert.get("labels", {}).get("alertname", "PrometheusAlert"),
                "severity": alert.get("labels", {}).get("severity", "warning"),
                "service": alert.get("labels", {}).get("service") or alert.get("labels", {}).get("namespace", "cluster"),
                "status": alert.get("state", "firing"),
                "summary": alert.get("annotations", {}).get("summary"),
            }
            for alert in data.get("alerts", [])
            if alert.get("state") == "firing"
        ]
    except Exception:
        return []
