from datetime import UTC, datetime, timedelta
from hashlib import sha256

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_access_token, hash_password, verify_password
from app.models.refresh_token import RefreshToken
from app.models.user import User, UserRole
from app.schemas.auth import RegisterRequest
from app.services.email_service import create_email_code, create_reset_code, verify_email_code, verify_reset_code
from app.utils.token import generate_refresh_token


def _hash_token(token: str) -> str:
    return sha256(token.encode()).hexdigest()


def create_token_pair(db: Session, user: User) -> dict:
    access_token = create_access_token(str(user.id), user.role.value)
    refresh_token = generate_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=_hash_token(refresh_token),
            expires_at=datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        )
    )
    return {"access_token": access_token, "refresh_token": refresh_token, "token_type": "bearer"}


def register(db: Session, payload: RegisterRequest) -> User:
    existing = db.scalar(select(User).where(User.email == payload.email.lower()))
    if existing:
        if existing.is_verified:
            raise HTTPException(status_code=409, detail="Email already registered")
        existing.name = payload.name
        existing.password_hash = hash_password(payload.password)
        create_email_code(db, existing)
        return existing
    user = User(name=payload.name, email=payload.email.lower(), password_hash=hash_password(payload.password), role=UserRole.USER)
    db.add(user)
    db.flush()
    create_email_code(db, user)
    return user


def login(db: Session, email: str, password: str) -> tuple[User, dict]:
    user = db.scalar(select(User).where(User.email == email.lower()))
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User is disabled")
    if not user.is_verified:
        raise HTTPException(status_code=403, detail="Email verification required")
    return user, create_token_pair(db, user)


def refresh(db: Session, refresh_token: str) -> tuple[User, dict]:
    token = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == _hash_token(refresh_token), RefreshToken.revoked.is_(False)))
    if not token or token.expires_at.replace(tzinfo=UTC) < datetime.now(UTC):
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    user = db.get(User, token.user_id)
    if not user or not user.is_active or not user.is_verified:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    token.revoked = True
    return user, create_token_pair(db, user)


def logout(db: Session, refresh_token: str) -> None:
    token = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == _hash_token(refresh_token)))
    if token:
        token.revoked = True


def verify_email(db: Session, email: str, code: str) -> User:
    user = db.scalar(select(User).where(User.email == email.lower()))
    if not user or not verify_email_code(db, user, code):
        raise HTTPException(status_code=400, detail="Invalid or expired verification code")
    return user


def resend_verification(db: Session, email: str) -> None:
    user = db.scalar(select(User).where(User.email == email.lower()))
    if user and not user.is_verified:
        create_email_code(db, user)


def forgot_password(db: Session, email: str) -> None:
    user = db.scalar(select(User).where(User.email == email.lower()))
    if not user:
        raise HTTPException(status_code=404, detail="Account does not exist. Create an account first.")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")
    create_reset_code(db, user)


def reset_password(db: Session, email: str, code: str, new_password: str) -> User:
    user = db.scalar(select(User).where(User.email == email.lower()))
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset code")
    reset_token = verify_reset_code(db, user, code)
    if not reset_token:
        raise HTTPException(status_code=400, detail="Invalid or expired reset code")
    reset_token.used = True
    user.password_hash = hash_password(new_password)
    return user


def verify_password_reset_code(db: Session, email: str, code: str) -> User:
    user = db.scalar(select(User).where(User.email == email.lower()))
    if not user or not verify_reset_code(db, user, code):
        raise HTTPException(status_code=400, detail="Invalid or expired reset code")
    return user


def seed_admin(db: Session) -> None:
    admin = db.scalar(select(User).where(User.email == settings.ADMIN_EMAIL.lower()))
    if admin:
        admin.name = settings.ADMIN_NAME
        admin.password_hash = hash_password(settings.ADMIN_PASSWORD)
        if admin.role != UserRole.ADMIN:
            admin.role = UserRole.ADMIN
        admin.is_verified = True
        admin.is_active = True
        return
    db.add(
        User(
            name=settings.ADMIN_NAME,
            email=settings.ADMIN_EMAIL.lower(),
            password_hash=hash_password(settings.ADMIN_PASSWORD),
            role=UserRole.ADMIN,
            is_active=True,
            is_verified=True,
        )
    )
