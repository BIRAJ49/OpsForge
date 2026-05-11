import re
from pathlib import Path


SECRET_PATTERNS = [
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"(?i)aws_secret_access_key\s*[:=]\s*['\"]?[^'\"\s]+"),
    re.compile(r"gh[pousr]_[A-Za-z0-9_]{20,}"),
    re.compile(r"(?i)(jwt_secret|secret_key|api_key|token|password)\s*[:=]\s*['\"]?[^'\"\n]+"),
    re.compile(r"(?i)(database_url|postgresql://|mysql://|mongodb://)[^'\"\s]+"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
]


def mask_secret_value(line: str) -> str:
    if "=" in line:
        key, _value = line.split("=", 1)
        return f"{key}=********"
    if ":" in line:
        key, _value = line.split(":", 1)
        return f"{key}: ********"
    return "********"


def scan_text_for_secrets(text: str, file_path: str = "") -> tuple[str, list[str]]:
    warnings: list[str] = []
    masked_lines: list[str] = []
    sensitive_file = Path(file_path).name.lower() in {".env", ".env.local", ".env.production"} or file_path.endswith(".pem")
    for line in text.splitlines():
        detected = sensitive_file or any(pattern.search(line) for pattern in SECRET_PATTERNS)
        if detected:
            masked_lines.append(mask_secret_value(line))
            warnings.append(f"Secret detected and masked in {file_path or 'project file'}")
        else:
            masked_lines.append(line)
    return "\n".join(masked_lines), sorted(set(warnings))


def masked_env_vars(text: str, file_path: str) -> tuple[dict[str, str], list[str]]:
    env: dict[str, str] = {}
    warnings: list[str] = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        if any(pattern.search(stripped) for pattern in SECRET_PATTERNS) or Path(file_path).name.lower().startswith(".env"):
            env[key] = "********"
            warnings.append(f"Secret detected and masked in {file_path}")
        else:
            env[key] = value[:120]
    return env, sorted(set(warnings))
