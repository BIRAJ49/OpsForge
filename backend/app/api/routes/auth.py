from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import get_current_user, rate_limit, request_meta
from app.core.response import success_response
from app.schemas.auth import ForgotPasswordRequest, LoginRequest, LogoutRequest, RefreshRequest, RegisterRequest, ResetPasswordRequest, VerifyEmailRequest, VerifyResetCodeRequest
from app.schemas.user import UserOut
from app.services import auth_service
from app.services.audit_service import record_audit

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", dependencies=[Depends(rate_limit("register", 10, 3600))])
def register(payload: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    user = auth_service.register(db, payload)
    ip, ua = request_meta(request)
    record_audit(db, user_id=user.id, action="User registration", resource_type="user", resource_id=user.id, ip_address=ip, user_agent=ua)
    db.commit()
    return success_response("Registration successful. Verify your email with the 6-digit code.", UserOut.model_validate(user).model_dump(), 201)


@router.post("/login", dependencies=[Depends(rate_limit("login", 8, 300))])
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    user, tokens = auth_service.login(db, payload.email, payload.password)
    ip, ua = request_meta(request)
    record_audit(db, user_id=user.id, action="User login", resource_type="user", resource_id=user.id, ip_address=ip, user_agent=ua)
    db.commit()
    return success_response("Login successful", {**tokens, "user": UserOut.model_validate(user).model_dump()})


@router.post("/refresh")
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)):
    user, tokens = auth_service.refresh(db, payload.refresh_token)
    db.commit()
    return success_response("Token refreshed", {**tokens, "user": UserOut.model_validate(user).model_dump()})


@router.post("/logout")
def logout(payload: LogoutRequest, request: Request, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    auth_service.logout(db, payload.refresh_token)
    ip, ua = request_meta(request)
    record_audit(db, user_id=current_user.id, action="User logout", resource_type="user", resource_id=current_user.id, ip_address=ip, user_agent=ua)
    db.commit()
    return success_response("Logout successful")


@router.post("/verify-email", dependencies=[Depends(rate_limit("verify-email", 10, 900))])
def verify_email(payload: VerifyEmailRequest, request: Request, db: Session = Depends(get_db)):
    user = auth_service.verify_email(db, payload.email, payload.code)
    ip, ua = request_meta(request)
    record_audit(db, user_id=user.id, action="Email verification", resource_type="user", resource_id=user.id, ip_address=ip, user_agent=ua)
    db.commit()
    return success_response("Email verified successfully")


@router.post("/resend-verification-code", dependencies=[Depends(rate_limit("resend-verification", 5, 900))])
def resend_verification(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    auth_service.resend_verification(db, payload.email)
    db.commit()
    return success_response("If the email exists and is unverified, a new code was sent")


@router.post("/forgot-password", dependencies=[Depends(rate_limit("forgot-password", 5, 900))])
def forgot_password(payload: ForgotPasswordRequest, request: Request, db: Session = Depends(get_db)):
    auth_service.forgot_password(db, payload.email)
    ip, ua = request_meta(request)
    record_audit(db, user_id=None, action="Password reset request", resource_type="user", resource_id=payload.email, ip_address=ip, user_agent=ua)
    db.commit()
    return success_response("Reset code sent to your email")


@router.post("/reset-password", dependencies=[Depends(rate_limit("reset-password", 5, 900))])
def reset_password(payload: ResetPasswordRequest, request: Request, db: Session = Depends(get_db)):
    user = auth_service.reset_password(db, payload.email, payload.code, payload.new_password)
    ip, ua = request_meta(request)
    record_audit(db, user_id=user.id, action="Password reset success", resource_type="user", resource_id=user.id, ip_address=ip, user_agent=ua)
    db.commit()
    return success_response("Password reset successful")


@router.post("/verify-reset-code", dependencies=[Depends(rate_limit("verify-reset-code", 10, 900))])
def verify_reset_code(payload: VerifyResetCodeRequest, request: Request, db: Session = Depends(get_db)):
    user = auth_service.verify_password_reset_code(db, payload.email, payload.code)
    ip, ua = request_meta(request)
    record_audit(db, user_id=user.id, action="Password reset code verification", resource_type="user", resource_id=user.id, ip_address=ip, user_agent=ua)
    db.commit()
    return success_response("Reset code verified")


@router.get("/me")
def me(current_user=Depends(get_current_user)):
    return success_response("Current user loaded", UserOut.model_validate(current_user).model_dump())
