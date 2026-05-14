from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import get_current_user
from app.core.permissions import request_meta
from app.core.response import success_response
from app.services.audit_service import record_audit
from app.services.kubernetes_service import kubernetes_service

router = APIRouter(prefix="/kubernetes", tags=["kubernetes"])


@router.get("/namespaces")
def namespaces(current_user=Depends(get_current_user)):
    return success_response("Namespaces loaded", kubernetes_service.namespaces())


@router.get("/pods")
def pods(current_user=Depends(get_current_user)):
    return success_response("Pods loaded", kubernetes_service.list_resource("pods"))


@router.get("/deployments")
def deployments(current_user=Depends(get_current_user)):
    return success_response("Kubernetes deployments loaded", kubernetes_service.list_resource("deployments"))


@router.get("/services")
def services(current_user=Depends(get_current_user)):
    return success_response("Services loaded", kubernetes_service.list_resource("services"))


@router.get("/ingress")
def ingress(current_user=Depends(get_current_user)):
    return success_response("Ingress loaded", kubernetes_service.list_resource("ingress"))


@router.get("/configmaps")
def configmaps(current_user=Depends(get_current_user)):
    return success_response("ConfigMaps loaded", kubernetes_service.list_resource("configmaps"))


@router.get("/secrets")
def secrets(current_user=Depends(get_current_user)):
    return success_response("Secrets metadata loaded", kubernetes_service.list_resource("secrets"))


@router.get("/hpa")
def hpa(current_user=Depends(get_current_user)):
    return success_response("HPA loaded", kubernetes_service.list_resource("hpa"))


@router.post("/incidents/analyze")
def analyze_cluster_incidents(request: Request, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    result = kubernetes_service.analyze_cluster_incidents()
    ip, ua = request_meta(request)
    record_audit(db, user_id=current_user.id, action="Kubernetes incident analysis", resource_type="kubernetes", resource_id=None, ip_address=ip, user_agent=ua)
    db.commit()
    return success_response("Kubernetes incident analysis complete", result)


@router.post("/incidents/{pod_name}/ai-fix")
def analyze_incident_fix(pod_name: str, request: Request, namespace: str | None = None, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    result = kubernetes_service.detailed_pod_ai_fix(pod_name, namespace)
    ip, ua = request_meta(request)
    record_audit(db, user_id=current_user.id, action="Kubernetes AI fix analysis", resource_type="kubernetes", resource_id=pod_name, ip_address=ip, user_agent=ua)
    db.commit()
    return success_response("Kubernetes AI fix analysis complete", result)


@router.get("/pods/{pod_name}/logs")
def pod_logs(pod_name: str, current_user=Depends(get_current_user)):
    return success_response("Pod logs loaded", kubernetes_service.pod_logs(pod_name))


@router.get("/pods/{pod_name}/events")
def pod_events(pod_name: str, current_user=Depends(get_current_user)):
    return success_response("Pod events loaded", kubernetes_service.pod_events(pod_name))
