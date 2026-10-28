"""顺序执行完整 preflight，保留逐阶段耗时、输入身份与失败证据。"""

import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]


def write_report(path, value):
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")
    temporary.replace(path)


def matching_core():
    built = ROOT / "target/debug/areal"
    core = Path(os.environ.get("AREAL_CORE_BIN") or built)
    if not core.is_file() or not os.access(core, os.X_OK):
        raise ValueError("AREAL_CORE_BIN must name the matching executable")
    if os.environ.get("AREAL_CORE_BIN"):
        hashes = []
        for path in (core, built):
            value = hashlib.sha256()
            with path.open("rb") as source:
                for block in iter(lambda: source.read(1024 * 1024), b""):
                    value.update(block)
            hashes.append(value.digest())
        if hashes[0] != hashes[1]:
            raise ValueError(
                "AREAL_CORE_BIN SHA-256 differs from the fresh build; deploy the new artifact to the fixed path first"
            )
    return core


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", required=True)
    args = parser.parse_args()
    started = time.monotonic()
    started_at = datetime.now(timezone.utc).isoformat()
    base = subprocess.check_output(
        ["git", "merge-base", args.base, "HEAD"], cwd=ROOT, text=True
    ).strip()
    spec = importlib.util.spec_from_file_location(
        "check_changed", ROOT / "scripts/check-changed.py"
    )
    check_changed = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(check_changed)
    run_id = uuid.uuid4().hex
    directory = ROOT / "target/ci/preflight" / run_id
    directory.mkdir(parents=True, exist_ok=False)
    write_report(
        directory / "metadata.json",
        {
            "schemaVersion": 1,
            "runId": run_id,
            "sourceRevision": subprocess.check_output(
                ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
            ).strip(),
            "baseRevision": base,
            "sourceInputHash": check_changed.input_key(ROOT, base),
            "trackedDiffSha256": hashlib.sha256(
                subprocess.check_output(
                    ["git", "diff", "HEAD", "--binary", "--no-ext-diff", "--no-textconv"], cwd=ROOT
                )
            ).hexdigest(),
            "fingerprint": json.loads(
                subprocess.check_output([sys.executable, "scripts/ci-fingerprint.py"], cwd=ROOT)
            ),
            "scope": "stage timing only; no reusable passing-run proof",
        },
    )
    stages = [
        ("format-workflow", ["make", "fmt-check", "workflow-lint"]),
        ("docs", ["python3", "scripts/check-docs.py"]),
        ("gui-health", ["make", "ci-gui-health", f"CI_BASE={base}"]),
        (
            "gate-contracts",
            [
                "python3",
                "-m",
                "unittest",
                "scripts.tests.test_ci_contracts",
                "scripts.tests.test_git_hooks",
            ],
        ),
        ("lint", ["make", "lint"]),
        ("gui-static", ["make", "ci-gui-static", f"CI_BASE={base}"]),
        ("browser-contracts", ["pnpm", "--dir", "clients/gui", "test:browser-contracts"]),
        ("dependency-audit", ["pnpm", "--dir", "clients/gui", "audit"]),
        ("gui-portable", ["make", "ci-gui-portable"]),
        ("core-build", ["make", "build"]),
        ("core-contracts", ["make", "ci-core-contracts"]),
    ]
    result = {
        "status": "running",
        "startedAt": started_at,
        "completedPhases": [],
    }
    write_report(directory / "result.json", result)
    print(json.dumps({"preflightReport": str(directory)}), flush=True)
    code = 0
    for name, command in stages:
        phase = {
            "phase": name,
            "command": command,
            "status": "running",
            "startedAt": datetime.now(timezone.utc).isoformat(),
        }
        path = directory / f"{name}.json"
        write_report(path, phase)
        began = time.monotonic()
        try:
            if name == "core-contracts":
                command.append(f"AREAL_CORE_BIN={matching_core()}")
            code = subprocess.run(command, cwd=ROOT).returncode
        except (OSError, ValueError) as error:
            phase["error"] = str(error)
            print(str(error), file=sys.stderr)
            code = 1
        phase.update(
            status="passed" if code == 0 else "failed",
            exitCode=code,
            elapsedMs=round((time.monotonic() - began) * 1000),
            completedAt=datetime.now(timezone.utc).isoformat(),
        )
        write_report(path, phase)
        result["completedPhases"].append(name)
        print(json.dumps(phase), flush=True)
        if code:
            break
    result.update(
        status="passed" if code == 0 else "failed",
        exitCode=code,
        elapsedMs=round((time.monotonic() - started) * 1000),
        completedAt=datetime.now(timezone.utc).isoformat(),
    )
    write_report(directory / "result.json", result)
    return code if code >= 0 else 128 - code


if __name__ == "__main__":
    raise SystemExit(main())
