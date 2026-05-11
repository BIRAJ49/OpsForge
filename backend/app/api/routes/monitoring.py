from fastapi import APIRouter, Depends

from app.core.permissions import get_current_user
from app.core.response import success_response
from app.services import monitoring_service

router = APIRouter(prefix="/monitoring", tags=["monitoring"])


@router.get("/overview")
def overview(current_user=Depends(get_current_user)):
    return success_response("Monitoring overview loaded", monitoring_service.overview())


@router.get("/cpu")
def cpu(current_user=Depends(get_current_user)):
    return success_response("CPU data loaded", monitoring_service.metric("cpu"))


@router.get("/memory")
def memory(current_user=Depends(get_current_user)):
    return success_response("Memory data loaded", monitoring_service.metric("memory"))


@router.get("/request-rate")
def request_rate(current_user=Depends(get_current_user)):
    return success_response("Request rate loaded", monitoring_service.metric("request-rate"))


@router.get("/error-rate")
def error_rate(current_user=Depends(get_current_user)):
    return success_response("Error rate loaded", monitoring_service.metric("error-rate"))


@router.get("/latency")
def latency(current_user=Depends(get_current_user)):
    return success_response("Latency loaded", monitoring_service.metric("latency"))


@router.get("/alerts")
def alerts(current_user=Depends(get_current_user)):
    return success_response("Alerts loaded", monitoring_service.alerts())
