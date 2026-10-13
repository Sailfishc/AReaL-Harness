"""受信 OCI 入口；原始供应商凭据只在宿主代理中，不运行主机脚本。"""

import json
import os
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import tarfile
import time


def command(args, cwd, **kwargs):
    return subprocess.run(args, cwd=cwd, check=True, **kwargs)


def main():
    request = json.loads(Path("/task/input/request.json").read_text())
    workspace = Path("/task/workspace")
    workspace.mkdir()
    Path("/task/home").mkdir()
    output = Path("/task/output")
    output.mkdir()
    with tarfile.open("/task/input/source.tar") as archive:
        for member in archive.getmembers():
            path = PurePosixPath(member.name)
            if path.is_absolute() or ".." in path.parts or not (member.isfile() or member.isdir()):
                raise ValueError("unsafe source archive")
        archive.extractall(workspace, filter="data")
    git = ["git", "-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false"]
    command(git + ["init", "-q"], workspace)
    command(git + ["add", "-A"], workspace)
    command(
        git
        + [
            "-c",
            "user.name=Cloud Task",
            "-c",
            "user.email=cloud@localhost",
            "commit",
            "-qm",
            "source",
            "--allow-empty",
        ],
        workspace,
    )
    env = os.environ.copy()
    env["AREAL_TASK_PROXY_TOKEN"] = request["proxyToken"]
    started = time.monotonic()
    with (output / "agent.jsonl").open("wb") as log:
        print(json.dumps({"stage": "coreStarted"}), flush=True)
        try:
            core = subprocess.run(
                [
                    "/usr/local/bin/areal",
                    "exec",
                    "--workspace",
                    str(workspace),
                    "--config",
                    "/task/input/model.toml",
                    "--allow-write",
                    "--allow-network",
                    "--permission-mode",
                    "bypassPermissions",
                    "--max-turns",
                    str(request["maxTurns"]),
                    "--output-format",
                    "json",
                    "--strict-mcp-config",
                    "--",
                    request["prompt"],
                ],
                cwd=workspace,
                env=env,
                stdout=log,
                stderr=subprocess.STDOUT,
                timeout=request["maxSeconds"],
            )
            agent_exit = core.returncode
        except subprocess.TimeoutExpired:
            agent_exit = 124
    print(json.dumps({"stage": "coreFinished", "exitCode": agent_exit}), flush=True)
    report = {
        "agentExitCode": agent_exit,
        "testCommand": request["testCommand"],
        "testExitCode": None,
        "stdout": "",
        "stderr": "",
    }
    if request["testCommand"]:
        remaining = max(1, request["maxSeconds"] - int(time.monotonic() - started))
        try:
            test = subprocess.run(
                ["/bin/sh", "-c", request["testCommand"]],
                cwd=workspace,
                capture_output=True,
                timeout=remaining,
            )
            report.update(
                testExitCode=test.returncode,
                stdout=test.stdout[: 1024 * 1024].decode(errors="replace"),
                stderr=test.stderr[: 1024 * 1024].decode(errors="replace"),
                stdoutTruncated=len(test.stdout) > 1024 * 1024,
                stderrTruncated=len(test.stderr) > 1024 * 1024,
            )
        except subprocess.TimeoutExpired:
            report.update(testExitCode=124, stderr="test deadline exceeded")
    # 只接受普通文件；链接和设备不能从结果 bundle 进入宿主。
    added = command(
        git + ["ls-files", "--others", "--exclude-standard", "-z"], workspace, capture_output=True
    ).stdout.split(b"\0")
    new_files = []
    for raw in added:
        if not raw:
            continue
        name = raw.decode()
        source = workspace / name
        if source.is_symlink() or not source.is_file():
            raise ValueError("unsafe new file")
        dest = output / "new" / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, dest)
        new_files.append(name)
    command(git + ["add", "-A"], workspace)
    with (output / "changes.patch").open("wb") as patch:
        command(
            git + ["diff", "--cached", "HEAD", "--binary", "--no-ext-diff", "--no-textconv"],
            workspace,
            stdout=patch,
        )
    (output / "new-files.json").write_text(json.dumps(new_files))
    (output / "test-report.json").write_text(json.dumps(report))
    print(
        json.dumps({"stage": "resultsPrepared", "testExitCode": report["testExitCode"]}), flush=True
    )
    return agent_exit or (report["testExitCode"] or 0)


if __name__ == "__main__":
    raise SystemExit(main())
