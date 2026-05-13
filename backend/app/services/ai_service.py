import json
import re
from functools import lru_cache
from typing import Any

import httpx

from app.core.config import settings

OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models"

SECRET_PATTERNS = [
    re.compile(r"(?i)(password|token|secret|api[_-]?key|authorization)\s*[:=]\s*\S+"),
    re.compile(r"(?i)(aws_access_key_id|aws_secret_access_key|github_token)\s*[:=]\s*\S+"),
    re.compile(r"(?i)(database_url|redis_url)\s*[:=]\s*\S+"),
]


def sanitize_ai_text(value: str) -> str:
    text = value or ""
    for pattern in SECRET_PATTERNS:
        text = pattern.sub(lambda match: f"{match.group(1)}=********", text)
    return text[:6000]


def _split_models(value: str | None) -> list[str]:
    return [item.strip() for item in (value or "").split(",") if item.strip()]


@lru_cache(maxsize=1)
def _openrouter_free_models() -> tuple[str, ...]:
    if not settings.OPENROUTER_USE_FREE_FALLBACKS:
        return ()
    try:
        response = httpx.get(OPENROUTER_MODELS_URL, timeout=10)
        response.raise_for_status()
        models = response.json().get("data", [])
        return tuple(model["id"] for model in models if str(model.get("id", "")).endswith(":free"))
    except Exception:
        return ()


def _openrouter_model_candidates() -> list[str]:
    candidates = [
        settings.OPENROUTER_MODEL,
        *_split_models(settings.OPENROUTER_FALLBACK_MODELS),
        *_openrouter_free_models(),
    ]
    seen = set()
    unique = []
    for model in candidates:
        if model and model not in seen:
            seen.add(model)
            unique.append(model)
    return unique[: max(settings.OPENROUTER_MAX_MODEL_ATTEMPTS, 1)]


def ai_runtime_status() -> dict[str, Any]:
    return {
        "enabled": settings.AI_ENABLED,
        "provider": settings.AI_PROVIDER,
        "openrouter_configured": bool(settings.OPENROUTER_API_KEY),
        "primary_model": settings.OPENROUTER_MODEL if settings.AI_PROVIDER.lower() == "openrouter" else None,
        "fallback_models_enabled": settings.OPENROUTER_USE_FREE_FALLBACKS,
        "max_model_attempts": settings.OPENROUTER_MAX_MODEL_ATTEMPTS,
    }


def _extract_json(content: str) -> dict[str, Any] | None:
    content = (content or "").strip()
    content = re.sub(r"^```(?:json)?", "", content, flags=re.IGNORECASE).strip()
    content = re.sub(r"```$", "", content).strip()
    try:
        parsed = json.loads(content)
        if isinstance(parsed, str):
            parsed = json.loads(parsed.strip().strip("`"))
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{.*\}", content or "", re.DOTALL)
    if not match:
        return None
    try:
        parsed = json.loads(match.group(0))
        if isinstance(parsed, str):
            parsed = json.loads(parsed.strip().strip("`"))
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        inner_match = re.search(r"\{.*\}", match.group(0).replace("\\n", "\n").replace('\\"', '"'), re.DOTALL)
        if not inner_match:
            return None
        try:
            parsed = json.loads(inner_match.group(0))
            return parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            return None


def _clean_ai_field(value: Any, *, limit: int = 900) -> str:
    text = sanitize_ai_text(str(value or "")).strip()
    text = re.sub(r"^```(?:json)?", "", text, flags=re.IGNORECASE).strip()
    text = re.sub(r"```$", "", text).strip()
    text = re.sub(r"^\s*[-*]\s*", "", text)
    return text[:limit].strip()


def _normalize_ai_fix(payload: dict[str, Any], *, model: str) -> dict[str, Any]:
    likely_cause = _clean_ai_field(payload.get("likely_cause") or payload.get("root_cause"), limit=500)
    suggested_fix = _clean_ai_field(payload.get("suggested_fix") or payload.get("fix"), limit=900)
    recommended_command = _clean_ai_field(payload.get("recommended_command") or payload.get("command"), limit=300)
    return {
        "likely_cause": likely_cause,
        "suggested_fix": suggested_fix,
        "recommended_command": recommended_command,
        "severity": str(payload.get("severity") or "").strip().title(),
        "confidence": str(payload.get("confidence") or "medium").strip().lower(),
        "ai_assisted": True,
        "ai_provider": "openrouter",
        "ai_model": model,
    }


def _fallback_text_ai_fix(content: str, rule_analysis: dict[str, Any], *, model: str) -> dict[str, Any] | None:
    clean = _clean_ai_field(content, limit=1200)
    if clean.startswith("{") or '"suggested_fix"' in clean or '"likely_cause"' in clean:
        suggested = re.search(r'"suggested_fix"\s*:\s*"([^"]+)"', clean)
        cause = re.search(r'"likely_cause"\s*:\s*"([^"]+)"', clean)
        command = re.search(r'"recommended_command"\s*:\s*"([^"]+)"', clean)
        clean = suggested.group(1) if suggested else clean
        if cause:
            rule_analysis = {**rule_analysis, "root_cause": cause.group(1)}
        if command:
            rule_analysis = {**rule_analysis, "recommended_command": command.group(1)}
    if not clean:
        return None
    return {
        "likely_cause": rule_analysis.get("root_cause", "Kubernetes incident detected."),
        "suggested_fix": clean[:1200],
        "recommended_command": rule_analysis.get("recommended_command", "kubectl describe pod <pod> -n <namespace>"),
        "severity": str(rule_analysis.get("severity", "medium")).title(),
        "confidence": "medium",
        "ai_assisted": True,
        "ai_provider": "openrouter",
        "ai_model": model,
    }


def suggest_kubernetes_fix(incident: dict[str, Any], rule_analysis: dict[str, Any], diagnostics: dict[str, Any] | None = None) -> dict[str, Any] | None:
    if diagnostics is not None:
        diagnostics.update(ai_runtime_status())
        diagnostics["attempted"] = False
        diagnostics["attempted_models"] = []
        diagnostics["last_error"] = None
    if not settings.AI_ENABLED:
        if diagnostics is not None:
            diagnostics["last_error"] = "AI_ENABLED is false"
        return None
    if settings.AI_PROVIDER.lower() != "openrouter":
        if diagnostics is not None:
            diagnostics["last_error"] = f"Unsupported AI_PROVIDER for this flow: {settings.AI_PROVIDER}"
        return None
    if not settings.OPENROUTER_API_KEY:
        if diagnostics is not None:
            diagnostics["last_error"] = "OPENROUTER_API_KEY is not configured"
        return None

    sanitized_events = [sanitize_ai_text(event) for event in incident.get("events", [])[:8]]
    user_prompt = {
        "task": "Suggest a concise Kubernetes incident fix.",
        "constraints": [
            "Do not invent secrets.",
            "Do not ask to expose secret values.",
            "Prefer safe kubectl read commands and targeted restart/rollout commands.",
            "Return JSON only.",
        ],
        "incident": {
            "pod_name": incident.get("pod_name"),
            "namespace": incident.get("namespace"),
            "status": incident.get("status"),
            "phase": incident.get("phase"),
            "ready": incident.get("ready"),
            "restarts": incident.get("restarts"),
            "events": sanitized_events,
        },
        "rule_based_analysis": rule_analysis,
        "required_json_shape": {
            "likely_cause": "string",
            "suggested_fix": "string",
            "recommended_command": "string",
            "severity": "Low|Medium|High|Critical",
            "confidence": "low|medium|high",
        },
    }
    headers = {
        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": settings.FRONTEND_URL,
        "X-Title": settings.APP_NAME,
    }

    retry_statuses = {400, 402, 404, 408, 409, 429, 500, 502, 503, 504}
    for model in _openrouter_model_candidates():
        if diagnostics is not None:
            diagnostics["attempted"] = True
            diagnostics["attempted_models"].append(model)
        body = {
            "model": model,
            "messages": [
                {
                    "role": "system",
                    "content": "You are a senior Kubernetes SRE. Return only compact valid JSON with practical remediation.",
                },
                {"role": "user", "content": json.dumps(user_prompt)},
            ],
            "temperature": 0.2,
            "max_tokens": 700,
        }
        try:
            response = httpx.post(
                OPENROUTER_CHAT_URL,
                headers=headers,
                json=body,
                timeout=settings.AI_REQUEST_TIMEOUT_SECONDS,
            )
            if response.status_code in retry_statuses:
                if diagnostics is not None:
                    diagnostics["last_error"] = f"{model} returned HTTP {response.status_code}: {response.text[:240]}"
                continue
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            parsed = _extract_json(content)
            if not parsed:
                fallback = _fallback_text_ai_fix(content, rule_analysis, model=model)
                if fallback:
                    if diagnostics is not None:
                        diagnostics["last_error"] = None
                        diagnostics["selected_model"] = model
                    return fallback
                if diagnostics is not None:
                    diagnostics["last_error"] = f"{model} returned an empty or unusable response"
                continue
            normalized = _normalize_ai_fix(parsed, model=model)
            if normalized["likely_cause"] and normalized["suggested_fix"]:
                if diagnostics is not None:
                    diagnostics["last_error"] = None
                    diagnostics["selected_model"] = model
                return normalized
        except httpx.TimeoutException:
            if diagnostics is not None:
                diagnostics["last_error"] = f"{model} timed out after {settings.AI_REQUEST_TIMEOUT_SECONDS}s"
            continue
        except httpx.HTTPError as exc:
            if diagnostics is not None:
                diagnostics["last_error"] = f"{model} request failed: {str(exc)[:220]}"
            continue
        except Exception as exc:
            if diagnostics is not None:
                diagnostics["last_error"] = f"{model} failed: {type(exc).__name__}: {str(exc)[:220]}"
            continue
    return None
