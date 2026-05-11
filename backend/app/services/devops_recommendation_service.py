def build_recommendations(analysis: dict, options: dict | None = None) -> dict:
    stack = set(analysis.get("detected_stack") or [])
    missing = analysis.get("missing_devops_files") or []
    warnings = []
    if "Dockerfile" in missing:
        warnings.append("No Dockerfile found")
    if "Kubernetes manifests" in missing:
        warnings.append("No Kubernetes resource limits or probes found")
    if analysis.get("detected_project_type") == "unknown":
        warnings.append("No supported package files detected")
    if analysis.get("detected_env_vars"):
        warnings.append("Environment file detected and masked")

    if {"React", "Vite", "FastAPI"}.issubset(stack) and "PostgreSQL" in analysis.get("detected_databases", []):
        strategy = "Kubernetes GitOps using Argo CD with GHCR images"
    elif analysis.get("detected_project_type") == "frontend":
        strategy = "Dockerized static frontend with GitHub Actions and Kubernetes ingress"
    elif analysis.get("detected_project_type") == "backend":
        strategy = "Dockerized API service with Kubernetes deployment, probes, secrets, and CI security checks"
    else:
        strategy = "Start with Docker Compose, then add Kubernetes and GitOps once the runtime is confirmed"

    risk = 25 + min(len(missing) * 6, 45) + min(len(warnings) * 8, 30)
    return {
        "recommended_files": missing,
        "recommended_deployment_strategy": strategy,
        "risk_score": min(risk, 100),
        "security_warnings": sorted(set([*analysis.get("security_warnings", []), *warnings])),
        "recommended_next_steps": [
            "Review masked environment variables and create secure secret values",
            "Generate DevOps files from the analysis",
            "Preview generated files before pushing to GitHub",
            "Run Trivy and CI checks before deployment",
        ],
    }
