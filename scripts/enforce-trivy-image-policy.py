#!/usr/bin/env python3
"""Fail for every critical and every fixable high image vulnerability."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("reports", nargs="+", type=Path)
    return parser.parse_args()


def main() -> int:
    blocked: list[tuple[str, str, str, str, str]] = []

    for report_path in parse_args().reports:
        document = json.loads(report_path.read_text(encoding="utf-8"))
        results = document.get("Results")
        if not isinstance(results, list) or not results:
            raise SystemExit(f"{report_path} contains no Trivy scan results")

        for result in results:
            for vulnerability in result.get("Vulnerabilities") or []:
                severity = vulnerability.get("Severity", "UNKNOWN")
                fixed_version = vulnerability.get("FixedVersion") or ""
                if severity == "CRITICAL" or (severity == "HIGH" and fixed_version):
                    blocked.append(
                        (
                            str(report_path),
                            vulnerability.get("VulnerabilityID", "unknown"),
                            vulnerability.get("PkgName", "unknown"),
                            severity,
                            fixed_version or "unfixed",
                        )
                    )

    for report, identifier, package, severity, fixed_version in blocked:
        print(
            f"BLOCKED {report}: {identifier} {package} {severity} fixed={fixed_version}"
        )

    if blocked:
        raise SystemExit(f"Blocked {len(blocked)} image vulnerability finding(s)")

    print("No critical or fixable high image vulnerabilities detected.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
