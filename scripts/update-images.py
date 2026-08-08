#!/usr/bin/env python3
import argparse
import re
from pathlib import Path

import yaml


EXPECTED_IMAGES = {
    "backend": "ghcr.io/biraj49/opsforge-backend",
    "frontend": "ghcr.io/biraj49/opsforge-frontend",
}


def digest_reference(component: str):
    expected_name = EXPECTED_IMAGES[component]

    def validate(value: str) -> str:
        if not re.fullmatch(rf"{re.escape(expected_name)}@sha256:[0-9a-f]{{64}}", value):
            raise argparse.ArgumentTypeError(f"expected {expected_name}@sha256:<64 lowercase hex characters>")
        return value

    return validate


parser = argparse.ArgumentParser(description="Set immutable OpsForge image digests")
parser.add_argument("--backend", required=True, type=digest_reference("backend"))
parser.add_argument("--frontend", required=True, type=digest_reference("frontend"))
args = parser.parse_args()

path = Path("production/opsforge/kustomization.yaml")
document = yaml.safe_load(path.read_text())
replacements = {
    EXPECTED_IMAGES["backend"]: args.backend,
    EXPECTED_IMAGES["frontend"]: args.frontend,
}

updated = set()
for image in document["images"]:
    replacement = replacements.get(image["name"])
    if replacement:
        name, digest = replacement.split("@", 1)
        image["newName"] = name
        image["digest"] = digest
        image.pop("newTag", None)
        updated.add(image["name"])

missing = replacements.keys() - updated
if missing:
    raise SystemExit(f"Missing expected image entries: {', '.join(sorted(missing))}")

path.write_text(yaml.safe_dump(document, sort_keys=False))
