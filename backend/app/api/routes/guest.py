from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.response import success_response
from app.models.guest_usage import GuestUsage

router = APIRouter(prefix="/guest", tags=["guest"])

GUEST_LIMIT = 3


def _guest_key(request: Request, x_guest_id: str | None) -> str:
    ip = request.client.host if request.client else "unknown"
    return f"{x_guest_id or 'browser'}:{ip}"


@router.get("/usage")
def usage(request: Request, x_guest_id: str | None = Header(default=None), db: Session = Depends(get_db)):
    key = _guest_key(request, x_guest_id)
    row = db.scalar(select(GuestUsage).where(GuestUsage.guest_key == key))
    count = row.generation_count if row else 0
    return success_response("Guest usage loaded", {"count": count, "limit": GUEST_LIMIT, "remaining": max(0, GUEST_LIMIT - count)})


@router.post("/usage/increment")
def increment(request: Request, x_guest_id: str | None = Header(default=None), db: Session = Depends(get_db)):
    key = _guest_key(request, x_guest_id)
    ip = request.client.host if request.client else None
    row = db.scalar(select(GuestUsage).where(GuestUsage.guest_key == key))
    if not row:
        row = GuestUsage(guest_key=key, ip_address=ip, generation_count=0)
        db.add(row)
        db.flush()
    if row.generation_count >= GUEST_LIMIT:
        raise HTTPException(status_code=429, detail="Guest generation limit reached. Login or create an account to continue.")
    row.generation_count += 1
    db.commit()
    return success_response("Guest usage updated", {"count": row.generation_count, "limit": GUEST_LIMIT, "remaining": max(0, GUEST_LIMIT - row.generation_count)})
