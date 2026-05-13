from datetime import UTC, datetime
from functools import cached_property
from typing import Any

from kubernetes import client, config
from kubernetes.client import ApiException

from app.core.config import settings
from app.services.ai_service import ai_runtime_status, suggest_kubernetes_fix
from app.services.rule_based_ai_service import analyze_text


class KubernetesService:
    def __init__(self) -> None:
        self.namespace = settings.KUBERNETES_DEFAULT_NAMESPACE
        self._configured = False
        self._config_error: str | None = None

    def _load_config(self) -> bool:
        if self._configured:
            return True
        try:
            if settings.KUBERNETES_MODE == "incluster":
                config.load_incluster_config()
            elif settings.KUBECONFIG_PATH:
                config.load_kube_config(config_file=settings.KUBECONFIG_PATH, context=settings.KUBERNETES_CONTEXT)
            else:
                config.load_kube_config(context=settings.KUBERNETES_CONTEXT)
            self._configured = True
            return True
        except Exception as exc:
            self._config_error = str(exc)
            return False

    @cached_property
    def core(self):
        return client.CoreV1Api()

    @cached_property
    def apps(self):
        return client.AppsV1Api()

    @cached_property
    def networking(self):
        return client.NetworkingV1Api()

    @cached_property
    def autoscaling(self):
        return client.AutoscalingV2Api()

    def _not_connected(self, resource: str) -> dict:
        return {
            "status": "not_connected",
            "resource": resource,
            "message": self._config_error or "Kubernetes config is not configured or cluster is not reachable",
            "context": settings.KUBERNETES_CONTEXT,
            "namespace": self.namespace,
            "items": [],
        }

    def _error(self, resource: str, exc: Exception) -> dict:
        return {
            "status": "error",
            "resource": resource,
            "message": str(exc),
            "namespace": self.namespace,
            "items": [],
        }

    def _age(self, created_at) -> str:
        if not created_at:
            return "unknown"
        seconds = int((datetime.now(UTC) - created_at).total_seconds())
        if seconds < 60:
            return f"{seconds}s"
        minutes = seconds // 60
        if minutes < 60:
            return f"{minutes}m"
        hours = minutes // 60
        if hours < 48:
            return f"{hours}h"
        return f"{hours // 24}d"

    def _pod_status(self, pod) -> str:
        waiting_reason = None
        for status in pod.status.container_statuses or []:
            if status.state and status.state.waiting:
                waiting_reason = status.state.waiting.reason
                break
            if status.state and status.state.terminated:
                waiting_reason = status.state.terminated.reason
                break
        return waiting_reason or pod.status.phase or "Unknown"

    def _pod_restarts(self, pod) -> int:
        return sum(status.restart_count for status in pod.status.container_statuses or [])

    def _pod_ready_count(self, pod) -> int:
        return sum(1 for status in pod.status.container_statuses or [] if status.ready)

    def _pod_container_count(self, pod) -> int:
        return len(pod.spec.containers or [])

    def namespaces(self) -> dict:
        if not self._load_config():
            return self._not_connected("namespaces")
        try:
            namespaces = self.core.list_namespace().items
            return {
                "status": "live",
                "items": [
                    {
                        "name": ns.metadata.name,
                        "status": ns.status.phase,
                        "age": self._age(ns.metadata.creation_timestamp),
                    }
                    for ns in namespaces
                ],
            }
        except Exception as exc:
            return self._error("namespaces", exc)

    def list_resource(self, resource: str) -> dict:
        if not self._load_config():
            return self._not_connected(resource)
        try:
            handlers = {
                "pods": self._pods,
                "deployments": self._deployments,
                "services": self._services,
                "ingress": self._ingress,
                "configmaps": self._configmaps,
                "secrets": self._secrets,
                "hpa": self._hpa,
            }
            handler = handlers.get(resource)
            if not handler:
                return {"status": "unsupported", "resource": resource, "items": []}
            return {"status": "live", "resource": resource, "items": handler()}
        except Exception as exc:
            return self._error(resource, exc)

    def _pods(self) -> list[dict[str, Any]]:
        pods = self.core.list_pod_for_all_namespaces().items
        return [
            {
                "name": pod.metadata.name,
                "namespace": pod.metadata.namespace,
                "status": self._pod_status(pod),
                "phase": pod.status.phase,
                "node": pod.spec.node_name,
                "pod_ip": pod.status.pod_ip,
                "restarts": self._pod_restarts(pod),
                "containers": self._pod_container_count(pod),
                "ready": f"{self._pod_ready_count(pod)}/{self._pod_container_count(pod)}",
                "cpu": "metrics-server required",
                "memory": "metrics-server required",
                "age": self._age(pod.metadata.creation_timestamp),
            }
            for pod in pods
        ]

    def _deployments(self) -> list[dict[str, Any]]:
        deployments = self.apps.list_deployment_for_all_namespaces().items
        return [
            {
                "name": item.metadata.name,
                "namespace": item.metadata.namespace,
                "status": "Healthy" if (item.status.ready_replicas or 0) == (item.spec.replicas or 0) else "Progressing",
                "replicas": item.spec.replicas or 0,
                "ready": item.status.ready_replicas or 0,
                "available": item.status.available_replicas or 0,
                "age": self._age(item.metadata.creation_timestamp),
            }
            for item in deployments
        ]

    def _services(self) -> list[dict[str, Any]]:
        services = self.core.list_service_for_all_namespaces().items
        return [
            {
                "name": item.metadata.name,
                "namespace": item.metadata.namespace,
                "type": item.spec.type,
                "cluster_ip": item.spec.cluster_ip,
                "ports": [f"{port.port}:{port.target_port}/{port.protocol}" for port in item.spec.ports or []],
                "age": self._age(item.metadata.creation_timestamp),
            }
            for item in services
        ]

    def _ingress(self) -> list[dict[str, Any]]:
        ingresses = self.networking.list_ingress_for_all_namespaces().items
        return [
            {
                "name": item.metadata.name,
                "namespace": item.metadata.namespace,
                "class": item.spec.ingress_class_name,
                "hosts": [rule.host or "*" for rule in item.spec.rules or []],
                "address": [
                    ingress.ip or ingress.hostname
                    for ingress in (item.status.load_balancer.ingress or [])
                    if ingress.ip or ingress.hostname
                ],
                "age": self._age(item.metadata.creation_timestamp),
            }
            for item in ingresses
        ]

    def _configmaps(self) -> list[dict[str, Any]]:
        configmaps = self.core.list_config_map_for_all_namespaces().items
        return [
            {
                "name": item.metadata.name,
                "namespace": item.metadata.namespace,
                "keys": sorted((item.data or {}).keys()),
                "age": self._age(item.metadata.creation_timestamp),
            }
            for item in configmaps
        ]

    def _secrets(self) -> list[dict[str, Any]]:
        secrets = self.core.list_secret_for_all_namespaces().items
        return [
            {
                "name": item.metadata.name,
                "namespace": item.metadata.namespace,
                "type": item.type,
                "keys": sorted((item.data or {}).keys()),
                "values": "masked",
                "age": self._age(item.metadata.creation_timestamp),
            }
            for item in secrets
        ]

    def _hpa(self) -> list[dict[str, Any]]:
        hpas = self.autoscaling.list_horizontal_pod_autoscaler_for_all_namespaces().items
        return [
            {
                "name": item.metadata.name,
                "namespace": item.metadata.namespace,
                "target": f"{item.spec.scale_target_ref.kind}/{item.spec.scale_target_ref.name}",
                "min_replicas": item.spec.min_replicas,
                "max_replicas": item.spec.max_replicas,
                "current_replicas": item.status.current_replicas,
                "desired_replicas": item.status.desired_replicas,
                "age": self._age(item.metadata.creation_timestamp),
            }
            for item in hpas
        ]

    def _find_pod_namespace(self, pod_name: str) -> str | None:
        pods = self.core.list_pod_for_all_namespaces(field_selector=f"metadata.name={pod_name}").items
        return pods[0].metadata.namespace if pods else None

    def _owner_reference(self, item, kind: str):
        for owner in item.metadata.owner_references or []:
            if owner.kind == kind:
                return owner
        return None

    def pod_logs(self, pod_name: str) -> dict:
        if not self._load_config():
            return self._not_connected("pod_logs")
        try:
            namespace = self._find_pod_namespace(pod_name)
            if not namespace:
                return {"status": "not_found", "pod_name": pod_name, "logs": []}
            logs = self.core.read_namespaced_pod_log(name=pod_name, namespace=namespace, tail_lines=200)
            return {"status": "live", "pod_name": pod_name, "namespace": namespace, "logs": logs.splitlines()}
        except ApiException as exc:
            return {"status": "error", "pod_name": pod_name, "message": exc.reason, "logs": []}
        except Exception as exc:
            return {"status": "error", "pod_name": pod_name, "message": str(exc), "logs": []}

    def pod_events(self, pod_name: str) -> dict:
        if not self._load_config():
            return self._not_connected("pod_events")
        try:
            namespace = self._find_pod_namespace(pod_name)
            if not namespace:
                return {"status": "not_found", "pod_name": pod_name, "events": []}
            events = self.core.list_namespaced_event(namespace=namespace, field_selector=f"involvedObject.name={pod_name}").items
            return {
                "status": "live",
                "pod_name": pod_name,
                "namespace": namespace,
                "events": [
                    {
                        "type": event.type,
                        "reason": event.reason,
                        "message": event.message,
                        "count": event.count,
                        "first_seen": event.first_timestamp,
                        "last_seen": event.last_timestamp,
                    }
                    for event in events
                ],
            }
        except Exception as exc:
            return {"status": "error", "pod_name": pod_name, "message": str(exc), "events": []}

    def analyze_cluster_incidents(self) -> dict:
        if not self._load_config():
            return self._not_connected("cluster_incidents")
        try:
            pods = self.core.list_pod_for_all_namespaces().items
            incidents = []
            ai_summary = ai_runtime_status()
            ai_summary.update({"attempted": False, "assisted_incidents": 0, "last_error": None})
            unhealthy_statuses = {
                "CrashLoopBackOff",
                "ImagePullBackOff",
                "ErrImagePull",
                "CreateContainerConfigError",
                "CreateContainerError",
                "RunContainerError",
                "OOMKilled",
                "Failed",
                "Unknown",
                "Pending",
            }

            for pod in pods:
                status = self._pod_status(pod)
                phase = pod.status.phase or "Unknown"
                restarts = self._pod_restarts(pod)
                ready = self._pod_ready_count(pod)
                containers = self._pod_container_count(pod)
                not_ready = containers > 0 and ready < containers
                high_restart_count = restarts >= 3
                is_unhealthy = status in unhealthy_statuses or phase in {"Failed", "Unknown", "Pending"} or high_restart_count or not_ready

                if phase == "Succeeded":
                    continue
                if not is_unhealthy:
                    continue

                namespace = pod.metadata.namespace
                name = pod.metadata.name
                events = self.core.list_namespaced_event(
                    namespace=namespace,
                    field_selector=f"involvedObject.name={name}",
                ).items
                event_summaries = [
                    f"{event.type or 'Normal'} {event.reason or 'Event'}: {event.message or ''}"
                    for event in events[-5:]
                ]
                evidence = "\n".join(
                    [
                        f"Pod {name} in namespace {namespace}",
                        f"status={status}",
                        f"phase={phase}",
                        f"ready={ready}/{containers}",
                        f"restarts={restarts}",
                        *event_summaries,
                    ]
                )
                analysis = analyze_text(evidence)
                severity = analysis["severity"].title()
                if high_restart_count and severity == "Medium":
                    severity = "High"
                if status == "Pending" and severity == "Medium":
                    severity = "Medium"
                incident_payload = {
                    "pod_name": name,
                    "namespace": namespace,
                    "status": status,
                    "phase": phase,
                    "ready": f"{ready}/{containers}",
                    "restarts": restarts,
                    "events": event_summaries,
                }
                ai_diagnostics = {}
                ai_fix = suggest_kubernetes_fix(incident_payload, analysis, ai_diagnostics)
                if ai_diagnostics.get("attempted"):
                    ai_summary["attempted"] = True
                if ai_diagnostics.get("last_error"):
                    ai_summary["last_error"] = ai_diagnostics["last_error"]
                if ai_fix:
                    ai_summary["assisted_incidents"] += 1
                final_cause = ai_fix.get("likely_cause") if ai_fix else analysis["root_cause"]
                final_fix = ai_fix.get("suggested_fix") if ai_fix else analysis["suggested_fix"]
                final_command = ai_fix.get("recommended_command") if ai_fix else analysis["recommended_command"]
                final_severity = ai_fix.get("severity") if ai_fix and ai_fix.get("severity") in {"Low", "Medium", "High", "Critical"} else severity

                incidents.append(
                    {
                        "id": f"{namespace}:{name}:{status}",
                        "pod_name": name,
                        "namespace": namespace,
                        "status": status,
                        "phase": phase,
                        "ready": f"{ready}/{containers}",
                        "restarts": restarts,
                        "severity": final_severity,
                        "likely_cause": final_cause,
                        "suggested_fix": final_fix,
                        "recommended_command": final_command
                        .replace("<pod>", name)
                        .replace("<namespace>", namespace),
                        "rule_based_cause": analysis["root_cause"],
                        "rule_based_fix": analysis["suggested_fix"],
                        "ai_assisted": bool(ai_fix),
                        "ai_provider": ai_fix.get("ai_provider") if ai_fix else None,
                        "ai_model": ai_fix.get("ai_model") if ai_fix else None,
                        "ai_confidence": ai_fix.get("confidence") if ai_fix else None,
                        "ai_attempted": bool(ai_diagnostics.get("attempted")),
                        "ai_fallback_reason": ai_diagnostics.get("last_error") if not ai_fix else None,
                        "rollback_recommendation": analysis["rollback_recommendation"],
                        "prevention_advice": analysis["prevention_advice"],
                        "events": event_summaries,
                    }
                )

            severity_order = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
            incidents.sort(key=lambda item: (severity_order.get(item["severity"], 4), item["namespace"], item["pod_name"]))
            return {
                "status": "live",
                "summary": {
                    "pods_checked": len(pods),
                    "incidents_found": len(incidents),
                    "healthy_pods": max(len(pods) - len(incidents), 0),
                    "ai": ai_summary,
                },
                "incidents": incidents,
            }
        except Exception as exc:
            return {"status": "error", "message": str(exc), "summary": {"pods_checked": 0, "incidents_found": 0, "healthy_pods": 0}, "incidents": []}

    def restart_pod_owner(self, pod_name: str, namespace: str | None = None) -> dict:
        if not self._load_config():
            return self._not_connected("restart_pod_owner")
        try:
            target_namespace = namespace or self._find_pod_namespace(pod_name)
            if not target_namespace:
                return {"status": "not_found", "message": f"Pod {pod_name} was not found", "pod_name": pod_name}

            pod = self.core.read_namespaced_pod(name=pod_name, namespace=target_namespace)
            replica_set_owner = self._owner_reference(pod, "ReplicaSet")
            if not replica_set_owner:
                return {
                    "status": "unsupported",
                    "message": "Pod is not managed by a ReplicaSet, so OpsForge could not infer a deployment restart target.",
                    "pod_name": pod_name,
                    "namespace": target_namespace,
                }

            replica_set = self.apps.read_namespaced_replica_set(name=replica_set_owner.name, namespace=target_namespace)
            deployment_owner = self._owner_reference(replica_set, "Deployment")
            if not deployment_owner:
                return {
                    "status": "unsupported",
                    "message": "ReplicaSet is not managed by a Deployment, so OpsForge could not restart a deployment safely.",
                    "pod_name": pod_name,
                    "namespace": target_namespace,
                    "replica_set": replica_set_owner.name,
                }

            restarted_at = datetime.now(UTC).isoformat()
            body = {
                "spec": {
                    "template": {
                        "metadata": {
                            "annotations": {
                                "opsforge.io/restarted-at": restarted_at,
                                "kubectl.kubernetes.io/restartedAt": restarted_at,
                            }
                        }
                    }
                }
            }
            self.apps.patch_namespaced_deployment(name=deployment_owner.name, namespace=target_namespace, body=body)
            return {
                "status": "executed",
                "message": f"Restarted deployment {deployment_owner.name} in namespace {target_namespace}",
                "pod_name": pod_name,
                "namespace": target_namespace,
                "replica_set": replica_set_owner.name,
                "deployment": deployment_owner.name,
                "restarted_at": restarted_at,
            }
        except ApiException as exc:
            return {"status": "error", "message": exc.reason, "pod_name": pod_name, "namespace": namespace}
        except Exception as exc:
            return {"status": "error", "message": str(exc), "pod_name": pod_name, "namespace": namespace}


kubernetes_service = KubernetesService()
