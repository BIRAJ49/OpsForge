from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import User, UserRole


def list_users(db: Session) -> list[User]:
    return list(db.scalars(select(User).order_by(User.created_at.desc())))


def change_role(user: User, role: UserRole) -> User:
    user.role = role
    return user


def disable_user(user: User) -> User:
    user.is_active = False
    return user
