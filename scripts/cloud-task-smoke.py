"""真实 Docker/Core/Runtime 纵切；模型是确定性 HTTP fixture，非真实供应商。"""

import argparse
import hashlib
import http.server
import json
import os
from pathlib import Path
import subprocess
import threading
import time


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--bin", default="target/debug/areal")
    parser.add_argument("--image", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    binary = str(Path(args.bin).resolve())
    root = Path(args.output).resolve()
    root.mkdir()
    repo = root / "repo"
    repo.mkdir()
    errors = []
    requests = []
    holding = threading.Event()
    release = threading.Event()
    save_holding = threading.Event()
    save_release = threading.Event()
    secret = "fixture-provider-credential"

    class Model(http.server.BaseHTTPRequestHandler):
        def log_message(self, *values):
            pass

        def do_POST(self):
            try:
                assert self.headers.get("Authorization") == "Bearer " + secret
                data = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                assert data["model"] == "fixture"
                assert data.get("max_tokens", data.get("max_completion_tokens", 0)) <= 4096
                requests.append(data)
                text = str(data["messages"])
                if "HOLD_FOR_SAVE" in text:
                    save_holding.set()
                    assert save_release.wait(60), "save fault injection timed out"
                if "HOLD_FOR_CANCEL" in text:
                    holding.set()
                    release.wait(60)
                    delta = {"content": "released"}
                    finish = "stop"
                else:
                    results = [m for m in data["messages"] if m["role"] == "tool"]
                    count = len(results)
                    tool = None
                    if count == 0:
                        tool = ("read_file", {"path": "code.txt"})
                    elif count == 1:
                        tool = (
                            "fs_apply_patches",
                            {
                                "path": "code.txt",
                                "patches": [{"oldText": "before", "newText": "after"}],
                            },
                        )
                    elif count == 2:
                        tool = ("run_command", {"command": "printf 'generated\\n' > generated.txt"})
                    delta = {"content": "Code changed and new file produced."}
                    finish = "stop"
                    if tool:
                        delta = {
                            "tool_calls": [
                                {
                                    "index": 0,
                                    "id": f"c{count}",
                                    "type": "function",
                                    "function": {"name": tool[0], "arguments": json.dumps(tool[1])},
                                }
                            ]
                        }
                        finish = "tool_calls"
                payload = {
                    "choices": [{"index": 0, "delta": delta, "finish_reason": finish}],
                    "usage": {"prompt_tokens": 100, "completion_tokens": 20},
                }
                body = ("data: " + json.dumps(payload) + "\n\ndata: [DONE]\n\n").encode()
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass
            except Exception as error:
                errors.append(repr(error))
                self.send_error(400)

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Model)
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, daemon=True).start()
    config = root / "model.toml"
    config.write_text(
        f"schema_version=1\n[model]\nname='fixture'\nmax_retries=0\n[model.providers.default]\nendpoint='http://127.0.0.1:{server.server_port}/v1/chat/completions'\nprotocol='chat-completions'\napi_key_env='AREAL_CLOUD_SMOKE_KEY'\n"
    )
    env = os.environ.copy()
    env["AREAL_CLOUD_SMOKE_KEY"] = secret
    env["AREAL_HARNESS_HOME"] = str(root / "host-home")
    store = root / "ledger"
    task_ids = []

    def git(*values):
        return (
            subprocess.run(["git", "-C", str(repo), *values], check=True, capture_output=True)
            .stdout.decode()
            .strip()
        )

    def cli(*values, success=True):
        # macOS 使用已有产品的 Python 父进程路径。
        result = subprocess.run(
            [binary, "cloud-task", "--store", str(store), *map(str, values)],
            cwd=root,
            env=env,
            capture_output=True,
            timeout=45,
        )
        if success:
            assert result.returncode == 0, result.stderr.decode()
        else:
            assert result.returncode != 0, result.stdout.decode()
        return result

    def status(task_id):
        return json.loads(cli("status", task_id).stdout)

    def until(task_id, phases, seconds=60):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            task = status(task_id)
            if task["phase"] in phases:
                return task
            time.sleep(0.2)
        raise AssertionError(
            f"task timeout: {status(task_id)}; log: {(store / task_id / 'worker.log').read_text()}"
        )

    common = [
        "--workspace",
        repo,
        "--image",
        args.image,
        "--config",
        config,
        "--max-seconds",
        "90",
        "--max-turns",
        "8",
    ]
    report = {
        "realDocker": True,
        "realCoreRuntime": True,
        "realModel": False,
        "fixtureErrors": errors,
        "tasks": [],
    }
    try:
        git("init", "-q")
        (repo / "code.txt").write_text("before\n")
        git("add", ".")
        git("-c", "user.name=Test", "-c", "user.email=test@localhost", "commit", "-qm", "source")
        initial = git("rev-parse", "HEAD")
        # 不上传 untracked/dirty 文件。
        (repo / "private.txt").write_text("local-only")
        cli("plan", *common, "--prompt", "change", success=False)
        (repo / "private.txt").unlink()
        prompt = "Read code.txt, change before to after, create generated.txt."
        test_command = 'test "$(cat code.txt)" = after && test "$(cat generated.txt)" = generated && test ! -e /var/run/docker.sock && test ! -e /Users && test ! -w /task/input/request.json && printf \'tests passed\\n\''
        submitted = [*common, "--prompt", prompt, "--test-command", test_command]
        plan = json.loads(cli("plan", *submitted).stdout)
        assert plan["files"] == ["code.txt"] and plan["input"]["commit"] == initial
        task = json.loads(cli("submit", *submitted, "--request-id", "same").stdout)
        task_id = task["id"]
        task_ids.append(task_id)
        repeated = json.loads(cli("submit", *submitted, "--request-id", "same").stdout)
        assert repeated["id"] == task_id
        cli("submit", *common, "--prompt", "different", "--request-id", "same", success=False)
        after = json.loads(cli("events", task_id).stdout.decode().splitlines()[0])["sequence"]
        finished = until(task_id, {"ready", "failed", "saveFailed", "unknown"})
        assert finished["phase"] == "ready", finished
        assert (
            finished["cleanupConfirmed"]
            and finished["resultsAvailable"]
            and finished["exitCode"] == 0
        )
        assert (repo / "code.txt").read_text() == "before\n" and not (
            repo / "generated.txt"
        ).exists()
        events = [
            json.loads(line)
            for line in cli("events", task_id, "--after", after).stdout.decode().splitlines()
        ]
        assert events and all(event["sequence"] > after for event in events)
        assert events[-1]["phase"] == "ready" and len(
            {event["sequence"] for event in events}
        ) == len(events)
        download = root / "download"
        cli("results", task_id, "--output", download)
        manifest = json.loads((download / "manifest.json").read_text())
        for artifact in manifest["files"]:
            contents = (download / artifact["path"]).read_bytes()
            assert (
                hashlib.sha256(contents).hexdigest() == artifact["sha256"]
                and len(contents) == artifact["bytes"]
            )
        tests = json.loads((download / "test-report.json").read_text())
        assert tests["testExitCode"] == 0 and tests["agentExitCode"] == 0, tests
        assert (download / "new/generated.txt").read_text() == "generated\n"
        (repo / "code.txt").write_text("local conflict\n")
        cli("apply", task_id, "--workspace", repo, success=False)
        assert (repo / "code.txt").read_text() == "local conflict\n"
        (repo / "code.txt").write_text("before\n")
        cli("apply", task_id, "--workspace", repo)
        assert (repo / "code.txt").read_text() == "after\n" and (
            repo / "generated.txt"
        ).read_text() == "generated\n"
        report["tasks"].append(
            {
                "id": task_id,
                "phase": "ready",
                "eventsReplayed": len(events),
                "artifactsVerified": len(manifest["files"]),
                "applyConflictRejected": True,
            }
        )
        # 新提交是第二个任务的独立代码输入。
        git("add", ".")
        git(
            "-c",
            "user.name=Test",
            "-c",
            "user.email=test@localhost",
            "commit",
            "-qm",
            "accepted changes",
        )
        cancelled = json.loads(
            cli("submit", *common, "--prompt", "HOLD_FOR_CANCEL", "--request-id", "cancel").stdout
        )
        task_ids.append(cancelled["id"])
        assert holding.wait(30), status(cancelled["id"])
        running = until(cancelled["id"], {"running"})
        container = "areal-cloud-" + running["id"]
        inspection = json.loads(subprocess.check_output(["docker", "inspect", container]))[0]
        volume = inspection["Mounts"][0]["Name"]
        assert inspection["HostConfig"]["Privileged"] is False
        assert (
            inspection["HostConfig"]["ReadonlyRootfs"]
            and inspection["Config"]["User"] == "65532:65532"
        )
        assert inspection["HostConfig"]["CapDrop"] == ["ALL"]
        assert len(inspection["Mounts"]) == 1 and inspection["Mounts"][0]["Type"] == "volume"
        cli("cancel", running["id"])
        done = until(running["id"], {"cancelled"})
        assert done["cleanupConfirmed"] and done["resource"] == "absent"
        assert (
            subprocess.run(
                ["docker", "container", "inspect", container], capture_output=True
            ).returncode
            != 0
        )
        assert (
            subprocess.run(["docker", "volume", "inspect", volume], capture_output=True).returncode
            != 0
        )
        release.set()
        # 在自己的 ledger 注入真实保存失败，确认停止容器保留且只重试收集。
        retry_repo = root / "retry-repo"
        retry_repo.mkdir()
        (retry_repo / "code.txt").write_text("before\n")
        for command_args in [
            ["init", "-q"],
            ["add", "."],
            ["-c", "user.name=Test", "-c", "user.email=test@localhost", "commit", "-qm", "source"],
        ]:
            subprocess.run(
                ["git", "-C", str(retry_repo), *command_args], check=True, capture_output=True
            )
        retry_common = common.copy()
        retry_common[1] = retry_repo
        retry = json.loads(
            cli(
                "submit",
                *retry_common,
                "--prompt",
                prompt + " HOLD_FOR_SAVE",
                "--test-command",
                test_command,
                "--request-id",
                "save-retry",
            ).stdout
        )
        task_ids.append(retry["id"])
        assert save_holding.wait(30), status(retry["id"])
        obstruction = store / retry["id"] / "artifacts"
        obstruction.write_text("intentional test-only publication obstruction")
        save_release.set()
        failed = until(retry["id"], {"saveFailed"})
        assert not failed["resultsAvailable"]
        state = json.loads(
            subprocess.check_output(["docker", "inspect", "areal-cloud-" + retry["id"]])
        )[0]
        assert state["State"]["Status"] == "exited"
        requests_before_retry = len(requests)
        obstruction.unlink()
        recovered = json.loads(cli("retry-results", retry["id"]).stdout)
        assert (
            recovered["phase"] == "ready"
            and recovered["cleanupConfirmed"]
            and recovered["resultsAvailable"]
        )
        assert len(requests) == requests_before_retry, "result retry reran model execution"
        cli("results", retry["id"], "--output", root / "retry-download")
        assert (root / "retry-download/new/generated.txt").read_text() == "generated\n"
        report["tasks"].append(
            {
                "id": retry["id"],
                "phase": "ready",
                "saveFailureRecovered": True,
                "modelRequestsReplayed": 0,
            }
        )
        for task_id in task_ids:
            for file in (store / task_id).rglob("*"):
                if file.is_file():
                    assert secret.encode() not in file.read_bytes(), f"credential leaked to {file}"
        assert not errors, errors
        report["tasks"].append(
            {"id": done["id"], "phase": "cancelled", "containerAbsent": True, "volumeAbsent": True}
        )
        report["modelRequests"] = len(requests)
        report["passed"] = True
    except Exception as error:
        report["passed"] = False
        report["error"] = repr(error)
        raise
    finally:
        release.set()
        save_release.set()
        # 只取消本次 smoke 的任务，通过产品的公开取消入口清理。
        for task_id in task_ids:
            if status(task_id)["phase"] not in {"ready", "failed", "cancelled"}:
                cli("cancel", task_id)
                until(task_id, {"cancelled"})
        server.shutdown()
        (root / "report.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
