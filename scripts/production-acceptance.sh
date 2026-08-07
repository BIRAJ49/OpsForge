#!/usr/bin/env bash
set -euo pipefail

: "${OPSFORGE_URL:=https://opsforge.birajadhikari49.com.np}"

kubectl -n argocd wait --for=jsonpath='{.status.health.status}'=Healthy application --all --timeout=10m
kubectl -n argocd wait --for=jsonpath='{.status.sync.status}'=Synced application --all --timeout=10m
kubectl get certificate -A
kubectl wait --for=condition=Ready certificate --all -A --timeout=5m
kubectl -n opsforge-system rollout status deployment/opsforge-backend --timeout=5m
kubectl -n opsforge-system rollout status deployment/opsforge-frontend --timeout=5m
curl --fail --silent --show-error "$OPSFORGE_URL/api/health"

printf '\nProduction acceptance checks passed.\n'
