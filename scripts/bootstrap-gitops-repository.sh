#!/usr/bin/env bash
set -euo pipefail

destination=${1:-../OpsForge-GitOps}
backend_image=${2:-}
frontend_image=${3:-}
source_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

if [[ ! "$backend_image" =~ ^ghcr\.io/biraj49/opsforge-backend@sha256:[0-9a-f]{64}$ ]] || \
   [[ ! "$frontend_image" =~ ^ghcr\.io/biraj49/opsforge-frontend@sha256:[0-9a-f]{64}$ ]]; then
  printf 'Usage: %s DESTINATION BACKEND_DIGEST_REF FRONTEND_DIGEST_REF\n' "$0" >&2
  printf 'Both image references must be full ghcr.io/biraj49/opsforge-* sha256 digests.\n' >&2
  exit 2
fi

if [[ -e "$destination" ]]; then
  printf 'Refusing to overwrite existing path: %s\n' "$destination" >&2
  exit 1
fi

mkdir -p "$destination/production" "$destination/scripts" "$destination/.github/workflows"
cp -R "$source_root/deploy/k8s/." "$destination/production/"

find "$destination/production/applications" -type f -name '*.yaml' -exec \
  sed -i.bak 's#https://github.com/BIRAJ49/OpsForge.git#https://github.com/BIRAJ49/OpsForge-GitOps.git#g; s#path: deploy/k8s/#path: production/#g' {} +
find "$destination" -name '*.bak' -delete

cp "$source_root/scripts/update-images.py" "$destination/scripts/update-images.py"
cp "$source_root/deploy/bootstrap/argocd-root-gitops.yaml" "$destination/argocd-root.yaml"
cp "$source_root/deploy/gitops-workflow-template.yml" "$destination/.github/workflows/validate.yml"
cp "$source_root/deploy/gitops-trivyignore.yaml" "$destination/.trivyignore.yaml"

(
  cd "$destination"
  python3 scripts/update-images.py --backend "$backend_image" --frontend "$frontend_image"
)

cat >"$destination/.github/CODEOWNERS" <<'EOF'
* @BIRAJ49
EOF

cat >"$destination/README.md" <<'EOF'
# OpsForge GitOps

Declarative production state for the OpsForge single-node K3s platform.
Changes are validated by pull request and reconciled by Argo CD after merge.

This repository is an interim production-only migration scaffold. Restructure it
into development, staging, and production overlays before enabling automated
promotion from the application repository.
EOF

git -C "$destination" init -b main
printf 'Created GitOps repository scaffold at %s\n' "$destination"
