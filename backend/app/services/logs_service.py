from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from app.core.config import settings


MOCK_LOGS = [
    {"service": "billing-api", "severity": "ERROR", "message": "Database connection failed after 30s timeout"},
    {"service": "checkout-service", "severity": "INFO", "message": "Order workflow completed request_id=ord_81f9"},
    {"service": "api-gateway", "severity": "WARNING", "message": "Too many 5xx errors detected for /v1/payments"},
    {"service": "worker-queue", "severity": "CRITICAL", "message": "High memory usage and OOMKilled container observed"},
]


def _mock_logs(service: str | None = None, severity: str | None = None, search: str | None = None) -> list[dict]:
    now = datetime.now(UTC)
    rows = []
    for idx, item in enumerate(MOCK_LOGS):
        row = {"timestamp": (now - timedelta(minutes=idx * 3)).isoformat(), "source": "mock", **item}
        if service and row["service"] != service:
            continue
        if severity and row["severity"].lower() != severity.lower():
            continue
        if search and search.lower() not in row["message"].lower():
            continue
        rows.append(row)
    return rows


def _escape_logql(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def _severity_from_line(line: str) -> str:
    upper = line.upper()
    if "CRITICAL" in upper or "FATAL" in upper:
        return "CRITICAL"
    if "ERROR" in upper or "EXCEPTION" in upper or "TRACEBACK" in upper:
        return "ERROR"
    if "WARNING" in upper or "WARN" in upper:
        return "WARNING"
    return "INFO"


def _service_from_stream(stream: dict[str, Any]) -> str:
    return (
        stream.get("app")
        or stream.get("app_kubernetes_io_name")
        or stream.get("container")
        or stream.get("pod")
        or stream.get("job")
        or stream.get("namespace")
        or "cluster"
    )


def _build_query(namespace: str | None, service: str | None, search: str | None) -> str:
    labels = []
    if namespace:
        labels.append(f'namespace="{_escape_logql(namespace)}"')
    else:
        labels.append('namespace=~".+"')
    query = "{" + ", ".join(labels) + "}"
    if search:
        query += f' |= "{_escape_logql(search)}"'
    return query


def _loki_query(namespace: str | None, service: str | None, search: str | None, limit: int) -> list[dict]:
    now = datetime.now(UTC)
    response = httpx.get(
        f"{settings.LOKI_URL.rstrip('/')}/loki/api/v1/query_range",
        params={
            "query": _build_query(namespace, service, search),
            "start": int((now - timedelta(hours=1)).timestamp() * 1_000_000_000),
            "end": int(now.timestamp() * 1_000_000_000),
            "limit": min(max(limit, 1), 2000),
            "direction": "BACKWARD",
        },
        timeout=settings.LOKI_QUERY_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    payload = response.json()
    if payload.get("status") != "success":
        raise RuntimeError(payload.get("error") or "Loki query failed")

    rows = []
    for result in payload.get("data", {}).get("result", []):
        stream = result.get("stream", {})
        service_name = _service_from_stream(stream)
        for timestamp_ns, message in result.get("values", []):
            detected_severity = _severity_from_line(message)
            if service and service_name != service:
                continue
            rows.append(
                {
                    "timestamp": datetime.fromtimestamp(int(timestamp_ns) / 1_000_000_000, UTC).isoformat(),
                    "namespace": stream.get("namespace"),
                    "pod": stream.get("pod"),
                    "container": stream.get("container"),
                    "service": service_name,
                    "severity": detected_severity,
                    "message": message,
                    "source": "loki",
                }
            )
    rows.sort(key=lambda row: row["timestamp"], reverse=True)
    return rows[:limit]


def logs(
    service: str | None = None,
    severity: str | None = None,
    search: str | None = None,
    namespace: str | None = None,
    limit: int = 500,
) -> dict:
    if settings.LOGS_MODE != "loki":
        rows = _mock_logs(service=service, severity=severity, search=search)
        return {"mode": "mock", "rows": rows, "error": None}
    try:
        selected_namespace = namespace or settings.LOKI_DEFAULT_NAMESPACE
        rows = _loki_query(selected_namespace, service, search, limit)
        if severity:
            rows = [row for row in rows if row["severity"].lower() == severity.lower()]
        return {"mode": "loki", "rows": rows, "error": None}
    except Exception as exc:
        rows = _mock_logs(service=service, severity=severity, search=search)
        return {"mode": "mock_fallback", "rows": rows, "error": str(exc)}


def services(namespace: str | None = None) -> list[str]:
    if settings.LOGS_MODE != "loki":
        return sorted({row["service"] for row in MOCK_LOGS})
    try:
        rows = _loki_query(namespace or settings.LOKI_DEFAULT_NAMESPACE, None, None, 500)
        return sorted({row["service"] for row in rows if row.get("service")})
    except Exception:
        return sorted({row["service"] for row in MOCK_LOGS})
