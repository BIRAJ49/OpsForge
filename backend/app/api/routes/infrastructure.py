from fastapi import APIRouter, Depends, HTTPException

from app.core.permissions import get_current_user
from app.core.response import success_response
from app.services.infrastructure_service import get_template, list_templates

router = APIRouter(prefix="/infrastructure", tags=["infrastructure"])


@router.post("/generate")
def generate(current_user=Depends(get_current_user)):
    return success_response("Terraform starter templates generated", list_templates())


@router.get("/templates")
def templates(current_user=Depends(get_current_user)):
    return success_response("Infrastructure templates loaded", list_templates())


@router.get("/templates/{template_id}")
def template(template_id: str, current_user=Depends(get_current_user)):
    item = get_template(template_id)
    if not item:
        raise HTTPException(status_code=404, detail="Template not found")
    return success_response("Infrastructure template loaded", item)
