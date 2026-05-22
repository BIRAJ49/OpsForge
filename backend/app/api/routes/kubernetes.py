from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import get_current_user, namespaces_for_user
from app.core.permissions import request_meta
from app.core.response import success_response
from app.services.audit_service import record_audit
from app.services.kubernetes_service import kubernetes_service

router = APIRouter(prefix="/kubernetes", tags=["kubernetes"])


@router.get("/namespaces")
def namespaces(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return success_response("Namespaces loaded", kubernetes_service.namespaces(namespaces_for_user(db, current_user)))


@router.get("/pods")
def pods(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return success_response("Pods loaded", kubernetes_service.list_resource("pods", namespaces_for_user(db, current_user)))


@router.get("/deployments")
def deployments(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return success_response("Kubernetes deployments loaded", kubernetes_service.list_resource("deployments", namespaces_for_user(db, current_user)))


@router.get("/services")
def services(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return success_response("Services loaded", kubernetes_service.list_resource("services", namespaces_for_user(db, current_user)))


@router.get("/ingress")
def ingress(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return success_response("Ingress loaded", kubernetes_service.list_resource("ingress", namespaces_for_user(db, current_user)))


@router.get("/configmaps")
def configmaps(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return success_response("ConfigMaps loaded", kubernetes_service.list_resource("configmaps", namespaces_for_user(db, current_user)))


@router.get("/secrets")
def secrets(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return success_response("Secrets metadata loaded", kubernetes_service.list_resource("secrets", namespaces_for_user(db, current_user)))


@router.get("/hpa")
def hpa(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return success_response("HPA loaded", kubernetes_service.list_resource("hpa", namespaces_for_user(db, current_user)))


@router.post("/incidents/analyze")
def analyze_cluster_incidents(request: Request, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    result = kubernetes_service.analyze_cluster_incidents(namespaces_for_user(db, current_user))
    ip, ua = request_meta(request)
    record_audit(db, user_id=current_user.id, action="Kubernetes incident analysis", resource_type="kubernetes", resource_id=None, ip_address=ip, user_agent=ua)
    db.commit()
    return success_response("Kubernetes incident analysis complete", result)


@router.post("/incidents/{pod_name}/ai-fix")
def analyze_incident_fix(pod_name: str, request: Request, namespace: str | None = None, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    result = kubernetes_service.detailed_pod_ai_fix(pod_name, namespace, namespaces_for_user(db, current_user))
    ip, ua = request_meta(request)
    record_audit(db, user_id=current_user.id, action="Kubernetes AI fix analysis", resource_type="kubernetes", resource_id=pod_name, ip_address=ip, user_agent=ua)
    db.commit()
    return success_response("Kubernetes AI fix analysis complete", result)


@router.get("/pods/{pod_name}/logs")
def pod_logs(pod_name: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return success_response("Pod logs loaded", kubernetes_service.pod_logs(pod_name, namespaces_for_user(db, current_user)))


@router.get("/pods/{pod_name}/events")
def pod_events(pod_name: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return success_response("Pod events loaded", kubernetes_service.pod_events(pod_name, namespaces_for_user(db, current_user)))
