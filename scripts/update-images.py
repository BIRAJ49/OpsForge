#!/usr/bin/env python3
import argparse
from pathlib import Path

import yaml


parser = argparse.ArgumentParser(description="Set immutable OpsForge image digests")
parser.add_argument("--backend", required=True)
parser.add_argument("--frontend", required=True)
args = parser.parse_args()

path = Path("production/opsforge/kustomization.yaml")
document = yaml.safe_load(path.read_text())
replacements = {
    "ghcr.io/biraj49/opsforge-backend": args.backend,
    "ghcr.io/biraj49/opsforge-frontend": args.frontend,
}

for image in document["images"]:
    replacement = replacements.get(image["name"])
    if replacement:
        name, digest = replacement.split("@", 1)
        image["newName"] = name
        image["digest"] = digest
        image.pop("newTag", None)

path.write_text(yaml.safe_dump(document, sort_keys=False))
