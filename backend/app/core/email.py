import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


def _subject_for(purpose: str) -> str:
    if purpose == "verification":
        return "Verify your OpsForge email"
    if purpose == "password-reset":
        return "Reset your OpsForge password"
    return "Your OpsForge code"


def _html_for(purpose: str, code: str) -> str:
    action = "verify your email" if purpose == "verification" else "reset your password"
    return f"""
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
      <h2 style="margin:0 0 12px">OpsForge security code</h2>
      <p style="font-size:15px;line-height:1.6">Use this 6-digit code to {action}.</p>
      <div style="font-size:32px;letter-spacing:8px;font-weight:700;margin:24px 0;padding:16px;background:#f1f5f9;border-radius:8px;text-align:center">{code}</div>
      <p style="font-size:13px;color:#64748b">This code expires in 15 minutes. If you did not request it, you can ignore this email.</p>
    </div>
    """


def _send_resend_email(email: str, purpose: str, code: str) -> bool:
    if not settings.RESEND_API_KEY:
        logger.warning("EMAIL_PROVIDER=resend but RESEND_API_KEY is not configured")
        return False
    payload = {
        "from": f"OpsForge <{settings.SMTP_FROM_EMAIL}>",
        "to": [email],
        "subject": _subject_for(purpose),
        "html": _html_for(purpose, code),
    }
    try:
        response = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}", "Content-Type": "application/json"},
            json=payload,
            timeout=10,
        )
        response.raise_for_status()
        logger.info("Sent OpsForge %s code email to %s through Resend", purpose, email)
        return True
    except httpx.HTTPError as exc:
        logger.exception("Failed to send OpsForge %s code email to %s through Resend: %s", purpose, email, exc)
        return False


def emit_email_code(email: str, purpose: str, code: str) -> None:
    if settings.EMAIL_PROVIDER == "resend" and _send_resend_email(email, purpose, code):
        return
    if settings.EMAIL_PROVIDER == "console" or not settings.SMTP_HOST:
        logger.info("OpsForge %s code for %s: %s", purpose, email, code)
        print(f"[OpsForge email:{purpose}] {email} code={code}")
        return
    logger.info("SMTP/Resend email provider configured; email sending adapter placeholder used for %s", email)
