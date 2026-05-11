from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import admin, ai_assistant, audit_logs, auth, deployments, generated_files, github, gitops, guest, healing, infrastructure, incidents, integrations, kubernetes, logs, monitoring, project_analysis, projects, security, users
from app.core.config import settings
from app.core.database import SessionLocal
from app.core.exceptions import register_exception_handlers
from app.core.logging import configure_logging
from app.core.response import success_response
from app.models import *  # noqa: F403
from app.services.auth_service import seed_admin


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    db = SessionLocal()
    try:
        seed_admin(db)
        db.commit()
    finally:
        db.close()
    yield


app = FastAPI(title=settings.APP_NAME, debug=settings.APP_DEBUG, lifespan=lifespan)

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
