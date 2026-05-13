import re

RULES = [
    ("CrashLoopBackOff", "The pod is repeatedly crashing after startup.", "high", "Inspect container logs and fix the startup failure.", "kubectl logs <pod> -n <namespace> --previous", "Add startup checks and release smoke tests."),
    ("Back-off restarting failed container|BackOff", "The container is repeatedly failing after startup and Kubernetes is backing off restarts.", "high", "Check previous container logs, required environment variables, startup dependencies, and resource limits.", "kubectl logs <pod> -n <namespace> --previous", "Add startup validation, readiness gates, and release smoke tests."),
    ("ImagePullBackOff|ErrImagePull", "Kubernetes cannot pull the container image.", "high", "Verify image name, tag, registry credentials, and imagePullSecrets.", "kubectl describe pod <pod> -n <namespace>", "Validate image existence before GitOps promotion."),
    ("OOMKilled|high memory", "The container is running out of memory.", "high", "Increase memory limits or reduce application memory usage.", "kubectl top pod -n <namespace>", "Add memory alerts and load testing."),
    ("secret not found|DATABASE_URL is missing", "A required Kubernetes Secret or DATABASE_URL is missing.", "high", "Create or update the Kubernetes Secret with required placeholder-backed values.", "kubectl create secret generic backend-secret --from-literal=DATABASE_URL=...", "Add required environment variable checks during CI/CD."),
    ("configmap not found", "A required ConfigMap is missing.", "medium", "Create the ConfigMap or fix the deployment reference.", "kubectl get configmap -n <namespace>", "Validate manifests in CI."),
    ("readiness probe failed", "Readiness probe is failing, so traffic should not be routed to the pod.", "medium", "Fix health endpoint, startup timing, or service dependencies.", "kubectl describe pod <pod> -n <namespace>", "Add realistic readiness checks and startup probes."),
    ("liveness probe failed", "Liveness probe is restarting the pod.", "medium", "Tune liveness probe thresholds or fix deadlock conditions.", "kubectl describe pod <pod> -n <namespace>", "Separate startup and liveness probes."),
    ("database connection failed|connection pool", "The application cannot connect to the database or the pool is exhausted.", "high", "Verify database service, credentials, pool limits, and network policies.", "kubectl logs deployment/backend -n <namespace>", "Add DB connectivity checks and pool saturation alerts."),
    ("port mismatch", "Service targetPort and containerPort likely do not match.", "medium", "Align container ports, service targetPort, and ingress backend port.", "kubectl get svc -n <namespace> -o yaml", "Validate service-port contracts in CI."),
    ("permission denied", "The workload does not have the required runtime or Kubernetes permissions.", "medium", "Check filesystem permissions, service accounts, RBAC, and security context.", "kubectl auth can-i --list -n <namespace>", "Run least-privilege RBAC checks before deployment."),
    ("high cpu", "CPU usage is above expected thresholds.", "medium", "Scale replicas or optimize CPU-heavy code paths.", "kubectl top pods -n <namespace>", "Add HPA and performance budgets."),
    ("5xx", "The service is returning too many 5xx errors.", "high", "Check application errors, upstream dependencies, and recent deployment changes.", "kubectl logs deployment/backend -n <namespace>", "Add canary analysis and error-rate rollback gates."),
]


def analyze_text(text: str) -> dict:
    clean_text = re.sub(r"(?i)(password|token|secret|api[_-]?key)=\\S+", r"\1=****", text or "")
    for pattern, root, severity, fix, command, prevention in RULES:
        if re.search(pattern, clean_text, re.IGNORECASE):
            return {
                "root_cause": root,
                "severity": severity,
                "suggested_fix": fix,
                "recommended_command": command,
                "rollback_recommendation": "Rollback is recommended if the issue started after the latest deployment.",
                "prevention_advice": prevention,
            }
    return {
        "root_cause": "The evidence does not match a known rule. Manual investigation is recommended.",
        "severity": "medium",
        "suggested_fix": "Collect pod logs, Kubernetes events, recent deployment changes, and service metrics.",
        "recommended_command": "kubectl describe pod <pod> -n <namespace>",
        "rollback_recommendation": "Rollback only if the issue correlates with the latest deployment.",
        "prevention_advice": "Add richer telemetry and structured incident evidence.",
    }
