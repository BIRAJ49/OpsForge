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


def _normalize_detailed_kubernetes_fix(payload: dict[str, Any], *, model: str) -> dict[str, Any]:
    return {
        "likely_cause": _clean_ai_field(payload.get("likely_cause") or payload.get("root_cause"), limit=700),
        "suggested_fix": _clean_ai_field(payload.get("suggested_fix") or payload.get("fix"), limit=1200),
        "recommended_command": _clean_ai_field(payload.get("recommended_command") or payload.get("command"), limit=500),
        "patch_preview": _clean_ai_field(payload.get("patch_preview") or payload.get("yaml_patch"), limit=1400),
        "evidence_used": [
            _clean_ai_field(item, limit=240)
            for item in (payload.get("evidence_used") or [])
            if _clean_ai_field(item, limit=240)
        ][:6],
        "risk_level": str(payload.get("risk_level") or "medium").strip().lower(),
        "safe_to_execute": bool(payload.get("safe_to_execute", False)),
        "confidence": str(payload.get("confidence") or "medium").strip().lower(),
        "ai_provider": "openrouter",
        "ai_model": model,
    }


def _normalize_project_profile(payload: dict[str, Any], fallback_profile: dict[str, Any], *, model: str) -> dict[str, Any]:
    profile = {**fallback_profile, **{key: value for key, value in payload.items() if key in {"project_type", "frontend", "backend", "databases", "cache", "environment_variables", "notes"}}}
    profile["frontend"] = {**(fallback_profile.get("frontend") or {}), **(profile.get("frontend") or {})}
    profile["backend"] = {**(fallback_profile.get("backend") or {}), **(profile.get("backend") or {})}
    profile["databases"] = [str(item).strip() for item in (profile.get("databases") or []) if str(item).strip()][:8]
    profile["cache"] = [str(item).strip() for item in (profile.get("cache") or []) if str(item).strip()][:8]
    profile["environment_variables"] = [str(item).strip() for item in (profile.get("environment_variables") or []) if str(item).strip()][:80]
    profile["notes"] = [_clean_ai_field(item, limit=260) for item in (profile.get("notes") or []) if _clean_ai_field(item, limit=260)][:8]
    profile["confidence"] = str(payload.get("confidence") or fallback_profile.get("confidence") or "medium").strip().lower()
    profile["ai_assisted"] = True
    profile["ai_provider"] = "openrouter"
    profile["ai_model"] = model
    return profile


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


def suggest_detailed_kubernetes_fix(evidence: dict[str, Any], rule_analysis: dict[str, Any], diagnostics: dict[str, Any] | None = None) -> dict[str, Any] | None:
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

    user_prompt = {
        "task": "Analyze this Kubernetes pod failure evidence and suggest a safe remediation.",
        "constraints": [
            "Return compact valid JSON only.",
            "Do not invent secrets or ask for secret values.",
            "Prefer read-only investigation commands unless evidence strongly supports a targeted restart, rollout undo, image fix, or config fix.",
            "If a YAML patch is risky or unclear, leave patch_preview empty and set safe_to_execute false.",
            "Use exact resource names and namespaces from evidence.",
        ],
        "evidence": evidence,
        "rule_based_analysis": rule_analysis,
        "required_json_shape": {
            "likely_cause": "string",
            "suggested_fix": "string",
            "recommended_command": "string",
            "patch_preview": "string",
            "evidence_used": ["string"],
            "risk_level": "low|medium|high",
            "safe_to_execute": "boolean",
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
                    "content": "You are a senior Kubernetes SRE. Return only valid JSON with safe, practical remediation.",
                },
                {"role": "user", "content": json.dumps(user_prompt)},
            ],
            "temperature": 0.15,
            "max_tokens": 1000,
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
                if diagnostics is not None:
                    diagnostics["last_error"] = f"{model} returned an empty or unusable response"
                continue
            normalized = _normalize_detailed_kubernetes_fix(parsed, model=model)
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


def suggest_project_profile(static_analysis: dict[str, Any], fallback_profile: dict[str, Any], diagnostics: dict[str, Any] | None = None) -> dict[str, Any] | None:
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

    safe_analysis = {
        "detected_project_type": static_analysis.get("detected_project_type"),
        "detected_stack": static_analysis.get("detected_stack"),
        "frontend_path": static_analysis.get("frontend_path"),
        "backend_path": static_analysis.get("backend_path"),
        "package_manager": static_analysis.get("package_manager"),
        "build_commands": static_analysis.get("build_commands"),
        "start_commands": static_analysis.get("start_commands"),
        "detected_ports": static_analysis.get("detected_ports"),
        "detected_databases": static_analysis.get("detected_databases"),
        "detected_cache": static_analysis.get("detected_cache"),
        "detected_env_var_names": sorted((static_analysis.get("detected_env_vars") or {}).keys()),
        "existing_devops_files": static_analysis.get("existing_devops_files"),
        "missing_devops_files": static_analysis.get("missing_devops_files"),
        "file_count": static_analysis.get("file_count"),
        "important_files": static_analysis.get("important_files", [])[:30],
    }
    user_prompt = {
        "task": "Refine this DevOps project profile for accurate Docker, Compose, CI/CD, Kubernetes, and Argo CD generation.",
        "constraints": [
            "Return compact valid JSON only.",
            "Do not invent secrets or secret values.",
            "Use empty strings for unknown commands instead of guessing risky commands.",
            "Prefer commands that work from the detected frontend/backend root directories.",
            "Preserve detected root paths unless evidence strongly says otherwise.",
        ],
        "static_analysis": safe_analysis,
        "fallback_profile": fallback_profile,
        "required_json_shape": {
            "project_type": "frontend|backend|fullstack|unknown",
            "confidence": "low|medium|high",
            "frontend": {
                "enabled": "boolean",
                "framework": "string",
                "root": "string",
                "package_manager": "string",
                "install_command": "string",
                "build_command": "string",
                "start_command": "string",
                "output_dir": "string",
                "port": "number",
            },
            "backend": {
                "enabled": "boolean",
                "framework": "string",
                "root": "string",
                "package_manager": "string",
                "install_command": "string",
                "start_command": "string",
                "health_path": "string",
                "port": "number",
            },
            "databases": ["string"],
            "cache": ["string"],
            "environment_variables": ["string"],
            "notes": ["string"],
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
                    "content": "You are a senior platform engineer. Return only valid JSON for a deployable project profile.",
                },
                {"role": "user", "content": json.dumps(user_prompt)},
            ],
            "temperature": 0.1,
            "max_tokens": 1400,
        }
        try:
            response = httpx.post(OPENROUTER_CHAT_URL, headers=headers, json=body, timeout=settings.AI_REQUEST_TIMEOUT_SECONDS)
            if response.status_code in retry_statuses:
                if diagnostics is not None:
                    diagnostics["last_error"] = f"{model} returned HTTP {response.status_code}: {response.text[:240]}"
                continue
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            parsed = _extract_json(content)
            if not parsed:
                if diagnostics is not None:
                    diagnostics["last_error"] = f"{model} returned an empty or unusable response"
                continue
            normalized = _normalize_project_profile(parsed, fallback_profile, model=model)
            if normalized.get("frontend") or normalized.get("backend"):
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
