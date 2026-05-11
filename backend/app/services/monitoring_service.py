from datetime import UTC, datetime, timedelta


def _series(name: str, base: int) -> list[dict]:
    now = datetime.now(UTC)
    return [
        {"timestamp": (now - timedelta(minutes=(5 - i) * 5)).isoformat(), "value": base + ((i * 7) % 18)}
        for i in range(6)
    ]


def overview() -> dict:
    return {
        "cpu_usage": 63,
        "memory_usage": 71,
        "request_rate": 820,
        "error_rate": 2.4,
        "api_latency_ms": 132,
        "pod_restarts": 4,
        "active_alerts": 3,
        "service_health": [
            {"service": "api-gateway", "status": "healthy", "score": 99},
            {"service": "billing-api", "status": "warning", "score": 82},
            {"service": "worker-queue", "status": "healthy", "score": 93},
        ],
    }


def metric(metric_name: str) -> dict:
    bases = {"cpu": 55, "memory": 68, "request-rate": 700, "error-rate": 2, "latency": 110}
    return {"metric": metric_name, "mode": "mock", "data": _series(metric_name, bases.get(metric_name, 10))}


def alerts() -> list[dict]:
    return [
        {"name": "HighPaymentFailureRate", "severity": "critical", "service": "billing-api", "status": "firing"},
        {"name": "PodRestartSpike", "severity": "warning", "service": "worker-queue", "status": "firing"},
    ]
