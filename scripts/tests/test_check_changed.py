"""在独立 Git 仓库验证快检输入集合、保守选检与证据失效。"""

import importlib.util
import io
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from contextlib import redirect_stdout

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("check_changed", ROOT / "scripts/check-changed.py")
checks = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checks)


class ChangedChecks(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="areal-changed-check-")
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.git("init", "-q")
        self.git("config", "user.name", "Fixture")
        self.git("config", "user.email", "fixture@example.invalid")
        for name in ("source.rs", "delete.rs", "rename old.rs", "stage.rs", "mixed.rs"):
            (self.root / name).write_text("base\n")
        self.git("add", ".")
        self.git("commit", "-qm", "base")
        self.base = self.git("rev-parse", "HEAD").strip()

    def git(self, *args):
        return subprocess.check_output(["git", *args], cwd=self.root, text=True)

    def test_merge_base_diff_keeps_every_worktree_state_and_both_rename_paths(self):
        (self.root / "source.rs").write_text("committed\n")
        self.git("add", "source.rs")
        self.git("commit", "-qm", "branch")
        (self.root / "stage.rs").write_text("staged\n")
        (self.root / "mixed.rs").write_text("staged\n")
        self.git("add", "stage.rs", "mixed.rs")
        (self.root / "mixed.rs").write_text("unstaged\n")
        (self.root / "delete.rs").unlink()
        self.git("mv", "rename old.rs", "rename new.rs")
        (self.root / "未跟踪\nfile.rs").write_text("new\n")
        merge_base = self.git("merge-base", "HEAD", self.base).strip()
        self.assertEqual(
            checks.changed_paths(self.root, merge_base),
            sorted(
                [
                    "source.rs",
                    "stage.rs",
                    "mixed.rs",
                    "delete.rs",
                    "rename old.rs",
                    "rename new.rs",
                    "未跟踪\nfile.rs",
                ]
            ),
        )

    def test_shared_and_unknown_code_cannot_select_no_tests(self):
        for path in (
            "schemas/areal-core-v1.json",
            "core/protocol/src/lib.rs",
            "Cargo.lock",
            "Makefile",
            "unmapped/new-driver.ts",
        ):
            with self.subTest(path=path):
                plan = checks.plan_checks([path], self.base)
                names = {item["name"] for item in plan["checks"]}
                self.assertTrue({"rust-types", "rust-behavior", "gui-static"} <= names)
                self.assertEqual(
                    plan["ciScopes"],
                    {
                        key: checks.ci_scope.applicable(key, [path])
                        for key in checks.ci_scope.SCOPES
                    },
                )
        unknown = checks.plan_checks(["unmapped/new-driver.ts"], self.base)
        self.assertEqual(unknown["conservativeFallback"], ["unmapped/new-driver.ts"])

    def test_staged_change_cancelled_in_worktree_remains_selected(self):
        original_key = checks.input_key(self.root, self.base)
        (self.root / "source.rs").write_text("staged-only value\n")
        self.git("add", "source.rs")
        (self.root / "source.rs").write_text("base\n")
        paths = checks.changed_paths(self.root, self.base)
        self.assertEqual(paths, ["source.rs"])
        self.assertNotEqual(checks.input_key(self.root, self.base), original_key)
        plan = checks.plan_checks(paths, self.base)
        self.assertTrue(plan["checks"])
        self.assertEqual(plan["validationTarget"], "working-tree")

    def test_index_only_drift_invalidates_worktree_validation(self):
        (self.root / "source.rs").write_text("staged-only value\n")
        self.git("add", "source.rs")
        (self.root / "source.rs").write_text("base\n")
        plan = checks.plan_checks(checks.changed_paths(self.root, self.base), self.base)
        key = checks.input_key(self.root, self.base)
        contents = (self.root / "source.rs").read_bytes()
        blob = (
            subprocess.check_output(
                ["git", "hash-object", "-w", "--stdin"],
                cwd=self.root,
                input=b"another staged-only value\n",
            )
            .decode()
            .strip()
        )
        self.git("update-index", "--cacheinfo", f"100644,{blob},source.rs")
        self.assertEqual((self.root / "source.rs").read_bytes(), contents)
        result = checks.execute_plan(
            plan, self.root, key, lambda *args, **kwargs: self.fail("must not execute")
        )
        self.assertEqual(result["status"], "invalidated")
        self.assertEqual(result["results"], [])

    def test_docs_and_gui_leaf_have_distinct_explicit_scope(self):
        docs = checks.plan_checks(["docs/features.md"], self.base)
        self.assertEqual([item["name"] for item in docs["checks"]], ["format", "docs"])
        gui = checks.plan_checks(["clients/gui/renderer/src/composer/input.ts"], self.base)
        self.assertEqual([item["name"] for item in gui["checks"]], ["format", "gui-static"])
        infra = checks.plan_checks(["scripts/ci-scope.py"], self.base)
        self.assertIn("scripts", [item["name"] for item in infra["checks"]])

    def test_plan_resolves_base_and_never_executes_checks(self):
        (self.root / "docs").mkdir()
        (self.root / "docs/new.md").write_text("Documentation fixture\n")
        output = io.StringIO()
        with (
            patch.object(checks, "ROOT", self.root),
            patch.object(
                checks, "execute_plan", side_effect=AssertionError("plan must not execute")
            ),
            redirect_stdout(output),
        ):
            self.assertEqual(checks.main(["--base", self.base, "--plan"]), 0)
        plan = json.loads(output.getvalue())["plan"]
        self.assertEqual(plan["base"], self.base)
        self.assertEqual(plan["paths"], ["docs/new.md"])
        self.assertEqual(plan["inputHash"], checks.input_key(self.root, self.base))

    def test_empty_selection_is_explicitly_no_changes(self):
        plan = checks.plan_checks([], self.base)
        result = checks.execute_plan(plan, self.root, checks.input_key(self.root, self.base))
        self.assertEqual(result["status"], "no-changes")
        self.assertEqual(result["results"], [])

    def test_manifest_cli_keeps_shared_units_and_reports_missing_conditions(self):
        gui = self.root / "clients/gui"
        (gui / "scripts").mkdir(parents=True)
        entries = [
            {"script": "test:unit", "layer": "unit", "areas": ["renderer"]},
            {"script": "test:composer", "layer": "contract", "areas": ["composer"]},
            {
                "script": "test:core",
                "layer": "contract",
                "areas": ["composer"],
                "requires": ["core-binary"],
            },
            {"script": "test:history", "layer": "contract", "areas": ["history"]},
            {
                "script": "test:mac",
                "layer": "contract",
                "areas": ["composer"],
                "platforms": ["darwin"],
                "platformReason": "Fixture macOS requirement",
            },
            {"script": "test:ui", "layer": "e2e", "areas": ["composer"]},
        ]
        for entry in entries:
            entry.setdefault("platforms", ["darwin", "linux"])
            entry.setdefault("requires", [])
        (gui / "package.json").write_text(
            json.dumps({"scripts": {entry["script"]: "fixture" for entry in entries}})
        )
        (gui / "scripts/test-manifest.json").write_text(json.dumps(entries))
        shutil.copy2(ROOT / "clients/gui/scripts/test-manifest.mjs", gui / "scripts")
        selected = checks.gui_selection(
            self.root, ["clients/gui/renderer/src/composer/input.ts"], [], "linux"
        )
        self.assertEqual(selected["areas"], ["composer"])
        self.assertEqual(selected["selected"], ["test:unit", "test:composer"])
        self.assertEqual(
            {item["script"] for item in selected["unexecuted"]}, {"test:core", "test:mac"}
        )
        self.assertEqual(selected["deferred"], ["test:ui"])
        unknown = checks.gui_selection(self.root, ["schemas/new.json"], [], "linux")
        self.assertIn("test:history", unknown["selected"])

    def test_missing_conditions_and_command_failures_never_report_passed(self):
        plan = {
            "base": self.base,
            "checks": [{"name": "fixture", "command": ["fixture"]}],
            "unexecuted": [{"script": "missing-core"}],
        }
        key = checks.input_key(self.root, self.base)
        result = checks.execute_plan(
            plan, self.root, key, lambda *a, **k: subprocess.CompletedProcess(a, 0)
        )
        self.assertEqual(result["status"], "partial")
        failed = checks.execute_plan(
            plan, self.root, key, lambda *a, **k: subprocess.CompletedProcess(a, 1)
        )
        self.assertEqual(failed["status"], "failed")
        self.assertEqual(failed["results"][0]["exitCode"], 1)

    def test_source_change_during_execution_invalidates_green_command(self):
        plan = {
            "base": self.base,
            "checks": [{"name": "fixture", "command": ["fixture"]}],
            "unexecuted": [],
        }
        key = checks.input_key(self.root, self.base)

        def runner(*args, **kwargs):
            (self.root / "source.rs").write_text("edited while checking\n")
            return subprocess.CompletedProcess(args, 0)

        self.assertEqual(checks.execute_plan(plan, self.root, key, runner)["status"], "invalidated")

    def test_counterexample_shared_mapping_removal_is_detected(self):
        # 定向错误：漏掉 schema 边界后，仍须由未知代码的保守回退补足检查。
        with patch.object(checks.ci_scope, "applicable", return_value=False):
            plan = checks.plan_checks(["schemas/areal-core-v1.json"], self.base)
        self.assertIn("gui-static", [item["name"] for item in plan["checks"]])


if __name__ == "__main__":
    unittest.main()
