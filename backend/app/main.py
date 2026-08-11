import logging
from contextlib import asynccontextmanager
from time import perf_counter

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from sqlalchemy import text

from app.api.routes import (
    admin,
    ai_assistant,
    audit_logs,
    auth,
    deployments,
    generated_files,
    github,
    gitops,
    guest,
    healing,
    infrastructure,
    incidents,
    integrations,
    kubernetes,
    logs,
    monitoring,
    project_analysis,
    projects,
    security,
    users,
)
from app.core.config import settings
from app.core.database import SessionLocal, engine
from app.core.exceptions import register_exception_handlers
from app.core.logging import configure_logging
from app.core.response import error_response, success_response
from app.models import *  # noqa: F403
from app.services.auth_service import seed_admin

logger = logging.getLogger(__name__)

HTTP_REQUESTS = Counter(
    "opsforge_http_requests_total",
    "Total number of HTTP requests processed by OpsForge.",
    ("method", "route", "status_code"),
)
HTTP_REQUEST_DURATION = Histogram(
    "opsforge_http_request_duration_seconds",
    "Time spent processing OpsForge HTTP requests.",
    ("method", "route"),
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10),
)

_KNOWN_HTTP_METHODS = frozenset(
    {"DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"}
)


def _metric_method(method: str) -> str:
    normalized_method = method.upper()
    return normalized_method if normalized_method in _KNOWN_HTTP_METHODS else "OTHER"


def _metric_route(request: Request) -> str:
    route = request.scope.get("route")
    route_path = getattr(route, "path", None)
    return route_path if isinstance(route_path, str) else "__unmatched__"


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    db = SessionLocal()
    try:
        seed_admin(db)
        db.commit()
    finally:
        db.close()
    try:
        yield
    finally:
        engine.dispose()


app = FastAPI(title=settings.APP_NAME, debug=settings.APP_DEBUG, lifespan=lifespan)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    started_at = perf_counter()
    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault(
            "Referrer-Policy", "strict-origin-when-cross-origin"
        )
        response.headers.setdefault(
            "Permissions-Policy", "geolocation=(), microphone=(), camera=()"
        )
        if settings.APP_ENV.lower() == "production":
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
            )
        return response
    finally:
        if request.url.path != "/metrics":
            method = _metric_method(request.method)
            route = _metric_route(request)
            HTTP_REQUESTS.labels(
                method=method, route=route, status_code=status_code
            ).inc()
            HTTP_REQUEST_DURATION.labels(method=method, route=route).observe(
                perf_counter() - started_at
            )


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)

for router in [
    auth.router,
    users.router,
    guest.router,
    admin.router,
    projects.router,
    project_analysis.router,
    generated_files.router,
    github.router,
    deployments.router,
    gitops.router,
    kubernetes.router,
    monitoring.router,
    logs.router,
    incidents.router,
    ai_assistant.router,
    security.router,
    infrastructure.router,
    integrations.router,
    audit_logs.router,
    healing.router,
]:
    app.include_router(router, prefix=settings.API_PREFIX)


@app.get("/api/health")
def health():
    return success_response("OpsForge API is healthy", {"status": "healthy"})


@app.get("/api/health/live", include_in_schema=False)
def health_live():
    return success_response("OpsForge API is live", {"status": "healthy"})


@app.get("/api/health/ready", include_in_schema=False)
def health_ready():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception as exc:
        logger.warning("Database readiness probe failed: %s", type(exc).__name__)
        return error_response(
            "OpsForge API is not ready", "DATABASE_UNAVAILABLE", status_code=503
        )

    return success_response(
        "OpsForge API is ready", {"status": "ready", "database": "healthy"}
    )


@app.get("/metrics", include_in_schema=False)
def metrics():
    return Response(
        content=generate_latest(), headers={"Content-Type": CONTENT_TYPE_LATEST}
    )
