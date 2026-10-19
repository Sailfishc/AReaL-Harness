#!/usr/bin/env python3
"""使用完整包和真实共享服务验证入口更新不接管旧后台；只操作本轮隔离实例。"""

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
        before = entry.resolve()
        # 同一真实二进制的合成旧布局；不冒充已发布旧版本。
        baseline = before.parent.parent.with_name("baseline-fixture")
        before.parent.parent.rename(baseline)
        entry.unlink()
        entry.symlink_to(baseline / "bin/areal")
        old_entry = entry.resolve()
        retained = {
            str(p.relative_to(baseline)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in baseline.rglob("*")
            if p.is_file()
        }
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
        original = {key: service[key] for key in ["serviceId", "generation", "hostPid", "corePid"]}
        config_before = config.read_bytes()
        installed = install(prefix)
        assert installed.returncode == 0, installed.stderr
        observed = json.loads(
            run(
                [str(entry), "service", "status", "--json", "--instance", service["serviceId"]]
            ).stdout
        )
        assert observed["state"] == "ready", observed
        assert {key: observed[key] for key in original} == original
        assert old_entry.exists() and entry.resolve() != old_entry
        assert run([str(old_entry), "--version"]).stdout.strip() == "areal " + version
        assert run([str(entry), "--version"]).stdout.strip() == "areal " + version
        assert config.read_bytes() == config_before
        assert retained == {
            str(p.relative_to(baseline)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in baseline.rglob("*")
            if p.is_file()
        }
        report["checks"].append(
            "entry switches while the real old service retains PID/generation and its complete unchanged bundle"
        )
        # 新前缀安装不接管另一个安装的后台。
        second = install(root / "second-prefix")
        assert second.returncode == 0, second.stderr
        assert (
            json.loads(
                run(
                    [str(entry), "service", "status", "--json", "--instance", service["serviceId"]]
                ).stdout
            )["generation"]
            == original["generation"]
        )
        report["checks"].append(
            "installing another prefix never stops or replaces the existing service"
        )
        run([str(entry), "service", "stop", "--json", "--instance", service["serviceId"]])
        state = json.loads(
            run(
                [str(entry), "service", "status", "--json", "--instance", service["serviceId"]]
            ).stdout
        )
        assert state["state"] == "stopped", state
        service = None
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
