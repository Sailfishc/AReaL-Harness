"""从本地与 CI 共用的计划运行快检；完整验收由 preflight 执行。"""

import argparse
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]


def load(name):
    spec = importlib.util.spec_from_file_location(
        name.replace("-", "_"), Path(__file__).with_name(name + ".py")
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ci_scope = load("ci-scope")
preflight = load("ci-preflight")
changed_paths = ci_scope.changed_paths
input_key = ci_scope.input_key


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", required=True)
    parser.add_argument("--plan", action="store_true")
    parser.add_argument("--phase", choices=("commit", "full"), default="commit")
    args = parser.parse_args(argv)
    plan = ci_scope.repository_plan(ROOT, args.base)
    selected = [item for item in plan["items"] if args.phase == "full" or item["phase"] == "commit"]
    print(
        json.dumps(
            {
                "plan": plan,
                "selected": [item["id"] for item in selected],
                "pendingFull": [item["id"] for item in plan["items"] if item not in selected],
            },
            ensure_ascii=False,
        ),
        flush=True,
    )
    if args.plan:
        return 0
    output = ROOT / "target/ci/changed" / str(time.time_ns())
    report = preflight.run_plan(plan, ROOT, selected, output)
    print(
        json.dumps(
            {
                "report": str(output / "report.json"),
                "status": report["status"],
                "scope": args.phase,
                "overallStatus": report["overallStatus"],
            }
        ),
        flush=True,
    )
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, subprocess.CalledProcessError, ValueError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
