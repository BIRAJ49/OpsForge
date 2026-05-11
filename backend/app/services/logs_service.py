from datetime import UTC, datetime, timedelta


MOCK_LOGS = [
    {"service": "billing-api", "severity": "ERROR", "message": "Database connection failed after 30s timeout"},
    {"service": "checkout-service", "severity": "INFO", "message": "Order workflow completed request_id=ord_81f9"},
    {"service": "api-gateway", "severity": "WARNING", "message": "Too many 5xx errors detected for /v1/payments"},
    {"service": "worker-queue", "severity": "CRITICAL", "message": "High memory usage and OOMKilled container observed"},
]


def logs(service: str | None = None, severity: str | None = None, search: str | None = None) -> list[dict]:
    now = datetime.now(UTC)
    rows = []
    for idx, item in enumerate(MOCK_LOGS):
        row = {"timestamp": (now - timedelta(minutes=idx * 3)).isoformat(), **item}
        if service and row["service"] != service:
            continue
        if severity and row["severity"].lower() != severity.lower():
            continue
        if search and search.lower() not in row["message"].lower():
            continue
        rows.append(row)
    return rows


def services() -> list[str]:
    return sorted({row["service"] for row in MOCK_LOGS})
