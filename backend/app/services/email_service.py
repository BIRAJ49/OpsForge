from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.email import emit_email_code
from app.core.security import hash_password, verify_password
from app.models.email_token import EmailToken
from app.models.password_reset_token import PasswordResetToken
from app.models.user import User
from app.utils.token import generate_code


def create_email_code(db: Session, user: User) -> str:
    code = generate_code()
    token = EmailToken(user_id=user.id, code_hash=hash_password(code), expires_at=datetime.now(UTC) + timedelta(minutes=15))
    db.add(token)
    emit_email_code(user.email, "verification", code)
    return code


def verify_email_code(db: Session, user: User, code: str) -> bool:
    tokens = db.scalars(select(EmailToken).where(EmailToken.user_id == user.id, EmailToken.used.is_(False)).order_by(EmailToken.created_at.desc())).all()
    now = datetime.now(UTC)
    for token in tokens:
        if token.expires_at.replace(tzinfo=UTC) >= now and verify_password(code, token.code_hash):
            token.used = True
            user.is_verified = True
            return True
    return False


def create_reset_code(db: Session, user: User) -> str:
    code = generate_code()
    token = PasswordResetToken(user_id=user.id, code_hash=hash_password(code), expires_at=datetime.now(UTC) + timedelta(minutes=15))
    db.add(token)
    emit_email_code(user.email, "password-reset", code)
    return code


def verify_reset_code(db: Session, user: User, code: str) -> PasswordResetToken | None:
    tokens = db.scalars(select(PasswordResetToken).where(PasswordResetToken.user_id == user.id, PasswordResetToken.used.is_(False)).order_by(PasswordResetToken.created_at.desc())).all()
    now = datetime.now(UTC)
    for token in tokens:
        if token.expires_at.replace(tzinfo=UTC) >= now and verify_password(code, token.code_hash):
            return token
    return None
