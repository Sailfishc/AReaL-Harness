#!/usr/bin/env python3
"""使用完整包和真实共享服务验证直接安装器保护；只操作本轮隔离实例。"""

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    args = parser.parse_args()
    bundle = args.bundle.resolve()
    manifest = json.loads((bundle / "manifest.json").read_text())
    version = manifest["productVersion"].removeprefix("areal ")
    target = {"darwin/arm64": "aarch64-apple-darwin", "linux/x86_64": "x86_64-unknown-linux-gnu"}[
        manifest["platform"]
    ]
    root = Path(tempfile.mkdtemp(prefix="ai-", dir="/tmp")).resolve()
    env = {k: v for k, v in os.environ.items() if not k.startswith(("AREAL_", "OTEL_"))}
    env.update(HOME=str(root / "user"), AREAL_HARNESS_HOME=str(root / "home"))
    (root / "user").mkdir()
    workspace = root / "workspace"
    workspace.mkdir()
    config = root / "config.toml"
    config.write_text(
        'schema_version=1\n[model]\nname="fixture"\n[model.providers.default]\nprotocol="chat-completions"\nendpoint="http://127.0.0.1:9/v1/chat/completions"\n'
    )
    archive = root / f"areal-harness-v{version}-{target}.tar.gz"
    with tarfile.open(archive, "w:gz") as stream:
        stream.add(bundle, arcname="areal")
    sums = root / "SHA256SUMS"
    sums.write_text(hashlib.sha256(archive.read_bytes()).hexdigest() + "  " + archive.name + "\n")
    prefix = root / "installed bundle"
    entry = prefix / "bin/areal"
    service = None
    report = {
        "passed": False,
        "sourceRevision": manifest["sourceRevision"],
        "version": version,
        "platform": manifest["platform"],
        "root": str(root),
        "checks": [],
    }

    def run(command, check=True):
        return subprocess.run(
            command, env=env, capture_output=True, text=True, timeout=90, check=check
        )

    def install(destination, requested=version):
        return run(
            [
                sys.executable,
                str(ROOT / "scripts/install.py"),
                "--version",
                requested,
                "--prefix",
                str(destination),
                "--archive",
                str(archive),
                "--checksums",
                str(sums),
            ],
            check=False,
        )

    try:
        first = install(prefix)
        assert first.returncode == 0, first.stderr
        assert run([str(entry), "--version"]).stdout.strip() == "areal " + version
        before = entry.resolve()
        service = json.loads(
            run(
                [
                    str(entry),
                    "service",
                    "ensure",
                    "--json",
                    "--workspace",
                    str(workspace),
                    "--config",
                    str(config),
                ]
            ).stdout
        )
        assert service["state"] == "ready", service
        for destination, requested in [(root / "second-prefix", version), (prefix, "999.0.0")]:
            blocked = install(destination, requested)
            assert blocked.returncode != 0 and "stop all shared services" in blocked.stderr, (
                blocked.stderr
            )
            assert entry.resolve() == before
            assert not (root / "second-prefix/bin/areal").exists()
        report["checks"].append(
            "direct fresh installation and existing upgrade refuse a real running shared service"
        )
        run([str(entry), "service", "stop", "--json", "--instance", service["serviceId"]])
        state = json.loads(
            run(
                [str(entry), "service", "status", "--json", "--instance", service["serviceId"]]
            ).stdout
        )
        assert state["state"] == "stopped", state
        service = None
        config_before = config.read_bytes()
        installed = install(root / "second-prefix")
        assert installed.returncode == 0, installed.stderr
        assert (
            run([str(root / "second-prefix/bin/areal"), "--version"]).stdout.strip()
            == "areal " + version
        )
        assert config.read_bytes() == config_before
        assert entry.resolve() == before
        report["checks"].append(
            "after confirmed stop, a complete package installs without changing the original entry or model config"
        )
        report["passed"] = True
    except BaseException as error:
        report["error"] = str(error)
        if isinstance(error, subprocess.CalledProcessError):
            report["stderr"] = error.stderr
            report["stdout"] = error.stdout
        raise
    finally:
        if service is not None:
            stopped = run(
                [str(entry), "service", "stop", "--json", "--instance", service["serviceId"]],
                check=False,
            )
            report["cleanupStopExitCode"] = stopped.returncode
            if stopped.returncode != 0:
                report["passed"] = False
        args.evidence.parent.mkdir(parents=True, exist_ok=True)
        args.evidence.write_text(json.dumps(report, indent=2) + "\n")
        if report["passed"]:
            shutil.rmtree(root)
        print(json.dumps(report))


if __name__ == "__main__":
    main()
