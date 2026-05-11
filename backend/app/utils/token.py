import secrets
import string


def generate_code(length: int = 6) -> str:
    return "".join(secrets.choice(string.digits) for _ in range(length))


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(48)
