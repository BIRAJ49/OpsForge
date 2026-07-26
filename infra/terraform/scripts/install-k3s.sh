#!/usr/bin/env bash
set -euxo pipefail

apt-get update
apt-get install -y curl

curl -sfL https://get.k3s.io | \
  INSTALL_K3S_CHANNEL="stable" \
  INSTALL_K3S_EXEC="server --disable=traefik" \
  sh -

until k3s kubectl get nodes --no-headers 2>/dev/null | grep -q .; do
  sleep 5
done

k3s kubectl wait --for=condition=Ready node --all --timeout=300s

mkdir -p /home/ubuntu/.kube
cp /etc/rancher/k3s/k3s.yaml /home/ubuntu/.kube/config
chown -R ubuntu:ubuntu /home/ubuntu/.kube
chmod 600 /home/ubuntu/.kube/config
