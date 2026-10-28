"""复用 CI 范围与 GUI 清单，执行本地改动快检并报告未覆盖的验收。"""

import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("ci_scope", ROOT / "scripts/ci-scope.py")
ci_scope = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ci_scope)


def git(root, *args):
    return subprocess.check_output(["git", "--no-optional-locks", *args], cwd=root)


def changed_paths(root, base):
    # --no-renames 同时保留重命名的旧路径；NUL 保留空格、换行等合法文件名。
    staged = git(root, "diff", "--cached", "--name-only", "-z", "--no-renames", base, "--")
    worktree = git(root, "diff", "--name-only", "-z", "--no-renames", "--")
    untracked = git(root, "ls-files", "--others", "--exclude-standard", "-z")
    return sorted(
        set(os.fsdecode(path) for path in (staged + worktree + untracked).split(b"\0") if path)
    )


def input_key(root, base):
    digest = hashlib.sha256(base.encode())
    digest.update(git(root, "rev-parse", "HEAD"))
    digest.update(git(root, "diff", "--binary", "--no-ext-diff", "--no-textconv", base, "--"))
    digest.update(
        git(root, "diff", "--cached", "--binary", "--no-ext-diff", "--no-textconv", base, "--")
    )
    # 计入未跟踪文件和工作区原始字节，避免规范化 diff 掩盖格式输入变化。
    for name in changed_paths(root, base):
        digest.update(os.fsencode(name) + b"\0")
        path = root / name
        if path.is_symlink():
            digest.update(os.fsencode(os.readlink(path)))
        elif path.is_file():
            digest.update(path.read_bytes())
    return digest.hexdigest()


def gui_selection(root, paths, available, platform):
    result = subprocess.run(
        ["node", "clients/gui/scripts/test-manifest.mjs", "--select-changed"],
        cwd=root,
        input=json.dumps({"paths": paths, "available": available, "platform": platform}),
        text=True,
        capture_output=True,
        check=True,
    )
    return json.loads(result.stdout)


def plan_checks(paths, base, selection=None):
    scopes = {name: ci_scope.applicable(name, paths) for name in ci_scope.SCOPES}
    code = [path for path in paths if not (path.endswith(".md") or path.startswith("docs/"))]
    unknown = [
        path
        for path in code
        if not any(ci_scope.applicable(name, [path]) for name in ci_scope.SCOPES)
    ]
    broad = bool(unknown)
    rust = broad or any(
        path.startswith(("core/", "runtime/", "schemas/"))
        or path.endswith(".rs")
        or path in ("Cargo.toml", "Cargo.lock", "rust-toolchain.toml", "Makefile")
        for path in code
    )
    gui = bool(code) and (any(scopes.values()) or broad)
    checks = []

    def add(name, command, reason, matched):
        checks.append({"name": name, "command": command, "reason": reason, "paths": matched})

    if paths:
        add("format", ["make", "fmt-check"], "changed inputs", paths)
    if any(path.endswith(".md") or path.startswith("docs/") for path in paths):
        add("docs", ["python3", "scripts/check-docs.py"], "documentation changed", paths)
    if rust:
        add("rust-types", ["make", "check"], "shared Rust/schema inputs or unknown code", code)
        add("rust-behavior", ["make", "test"], "workspace consumers of shared contracts", code)
    if rust or any(
        path.startswith(("core/sdk-typescript/", "runtime/sdk-typescript/")) for path in code
    ):
        add("sdk", ["make", "sdk-test"], "SDK consumers of shared contracts", code)
    if broad or any(path.startswith(("scripts/", ".github/", ".githooks/")) for path in code):
        add("scripts", ["make", "script-test"], "check infrastructure or unknown code", code)
    if gui:
        add(
            "gui-static",
            ["make", "ci-gui-static", f"CI_BASE={base}"],
            "existing CI applicability" if not broad else "conservative unknown-code fallback",
            code,
        )
        for script in (selection or {}).get("selected", []):
            # ci-gui-static 已执行这组合同。
            if script == "test:regressions":
                continue
            add(
                script,
                ["pnpm", "--dir", "clients/gui", "run", script],
                "GUI manifest area/platform/requirements selection",
                code,
            )
    return {
        "base": base,
        "validationTarget": "working-tree",
        "indexNotice": "Staged contents affect selection and drift detection; commands validate working-tree contents.",
        "paths": paths,
        "ciScopes": scopes,
        "conservativeFallback": unknown,
        "guiRequired": gui,
        "guiAreas": (selection or {}).get("areas", []),
        "checks": checks,
        "unexecuted": (selection or {}).get("unexecuted", []) if gui else [],
        "deferred": [
            "Full CI, native desktop, live providers and package acceptance remain separate.",
            *((selection or {}).get("deferred", []) if gui else []),
        ],
    }


def execute_plan(plan, root, key, runner=subprocess.run):
    results = []
    started = time.monotonic()
    for check in plan["checks"]:
        if input_key(root, plan["base"]) != key:
            return {"status": "invalidated", "results": results, "reason": "inputs changed"}
        began = time.monotonic()
        try:
            result = runner(check["command"], cwd=root)
            code = result.returncode
            error = None
        except OSError as failure:
            code, error = None, str(failure)
        results.append(
            {
                "name": check["name"],
                "exitCode": code,
                "error": error,
                "elapsedMs": round((time.monotonic() - began) * 1000),
            }
        )
        if input_key(root, plan["base"]) != key:
            return {"status": "invalidated", "results": results, "reason": "inputs changed"}
        if code != 0:
            return {"status": "failed", "results": results}
    if not plan["checks"] and input_key(root, plan["base"]) != key:
        return {"status": "invalidated", "results": results, "reason": "inputs changed"}
    return {
        "status": "no-changes"
        if not plan["checks"]
        else "partial"
        if plan["unexecuted"]
        else "passed-selected-checks",
        "results": results,
        "elapsedMs": round((time.monotonic() - started) * 1000),
    }


def available_requirements(root):
    available = [name for name in ("git", "python3", "openssl") if shutil.which(name)]
    if (root / "clients/gui/renderer/dist/index.html").is_file():
        available.append("gui-build")
    core = os.environ.get("AREAL_CORE_BIN")
    if core and Path(core).is_file() and os.access(core, os.X_OK):
        available.append("core-binary")
    if sys.platform == "darwin" and all(shutil.which(name) for name in ("codesign", "hdiutil")):
        available.append("macos-tools")
    node = subprocess.check_output(["node", "--version"], text=True).strip().removeprefix("v")
    return [*available, f"node-{node}"]


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--base", required=True, help="actual comparison ref; resolved once to merge-base"
    )
    parser.add_argument(
        "--plan", action="store_true", help="print selection without executing checks"
    )
    args = parser.parse_args(argv)
    if not args.base:
        parser.error("--base requires a non-empty comparison ref")
    base = git(ROOT, "merge-base", "HEAD", args.base).decode().strip()
    before = input_key(ROOT, base)
    paths = changed_paths(ROOT, base)
    preliminary = plan_checks(paths, base)
    selection = (
        gui_selection(ROOT, paths, available_requirements(ROOT), sys.platform)
        if preliminary["guiRequired"]
        else None
    )
    plan = plan_checks(paths, base, selection)
    plan["inputHash"] = before
    print(json.dumps({"plan": plan}, ensure_ascii=False), flush=True)
    if args.plan:
        return 0
    result = execute_plan(plan, ROOT, before)
    print(json.dumps(result, ensure_ascii=False), flush=True)
    return 0 if result["status"] in ("passed-selected-checks", "no-changes") else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, subprocess.CalledProcessError, ValueError) as error:
        print(f"check-changed failed: {error}", file=sys.stderr)
        raise SystemExit(1)
