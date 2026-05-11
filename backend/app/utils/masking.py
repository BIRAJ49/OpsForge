def mask_secret(value: str | None) -> str | None:
    if not value:
        return None
    if len(value) <= 8:
        return "****"
    return f"{value[:4]}****{value[-4:]}"


def mask_dict(data: dict, secret_keys: set[str] | None = None) -> dict:
    secret_keys = secret_keys or {"token", "password", "secret", "api_key", "kubeconfig"}
    masked = {}
    for key, value in data.items():
        if any(part in key.lower() for part in secret_keys):
            masked[key] = mask_secret(str(value)) if value else None
        else:
            masked[key] = value
    return masked
