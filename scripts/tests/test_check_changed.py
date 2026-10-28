"""在独立仓库验证共享选检、完整失败收集和输入漂移。"""

from contextlib import redirect_stdout
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

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
        (self.root / ".gitignore").write_text("target/\n")
        for name in ("source.rs", "delete.rs", "rename old.rs", "stage.rs", "mixed.rs"):
            (self.root / name).write_text("base\n")
        self.gui = self.root / "clients/gui"
        (self.gui / "scripts").mkdir(parents=True)
        self.manifest = json.loads((ROOT / "clients/gui/scripts/test-manifest.json").read_text())
        (self.gui / "scripts/test-manifest.json").write_text(json.dumps(self.manifest))
        self.git("add", ".")
        self.git("commit", "-qm", "base")
        self.base = self.git("rev-parse", "HEAD").strip()
        self.serial = 0

    def git(self, *args):
        return subprocess.check_output(["git", *args], cwd=self.root, text=True)

    def plan(self, paths):
        return checks.ci_scope.build_plan(
            paths,
            {
                "baseRevision": self.base,
                "sourceRevision": self.base,
                "headRevision": self.base,
                "inputHash": checks.input_key(self.root, self.base),
            },
            self.manifest,
        )

    def item(self, name, dependencies=(), requires=()):
        return {
            "id": name,
            "command": [name],
            "group": "early",
            "dependsOn": list(dependencies),
            "requires": list(requires),
            "platforms": ["darwin", "linux"],
        }

    def execute(self, items, runner=None, key=None):
        plan = self.plan([])
        plan["items"] = items
        if key is not None:
            plan["source"]["inputHash"] = key
        self.serial += 1
        return checks.preflight.run_plan(
            plan,
            self.root,
            items,
            self.root / "target/ci" / str(self.serial),
            runner=runner or (lambda *a, **k: subprocess.CompletedProcess(a, 0)),
            capability_probe=lambda *args: set(),
        )

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
        self.assertEqual(
            checks.changed_paths(self.root, self.base),
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

    def test_shared_and_unknown_code_keep_behavior_budget_native_and_every_smoke(self):
        for path in (
            "schemas/areal-core-v1.json",
            "core/protocol/src/lib.rs",
            "Cargo.lock",
            "Makefile",
            "unmapped/new-driver.ts",
        ):
            with self.subTest(path=path):
                names = {item["id"] for item in self.plan([path])["items"]}
                self.assertTrue(
                    {
                        "rust-types",
                        "rust-behavior",
                        "portable:bundle",
                        "native-replay",
                        "legacy-native-access",
                        "relay-contracts",
                    }
                    <= names
                )
                self.assertEqual(
                    {entry["script"] for entry in self.manifest if entry.get("ciSmoke")},
                    {name.removeprefix("smoke:") for name in names if name.startswith("smoke:")},
                )
        self.assertEqual(
            self.plan(["unmapped/new-driver.ts"])["fallbackPaths"], ["unmapped/new-driver.ts"]
        )

    def test_staged_change_cancelled_in_worktree_remains_selected(self):
        original = checks.input_key(self.root, self.base)
        (self.root / "source.rs").write_text("staged-only\n")
        self.git("add", "source.rs")
        (self.root / "source.rs").write_text("base\n")
        self.assertEqual(checks.changed_paths(self.root, self.base), ["source.rs"])
        self.assertNotEqual(checks.input_key(self.root, self.base), original)
        self.assertTrue(self.plan(["source.rs"])["items"])

    def change_index_only(self):
        content = (self.root / "source.rs").read_bytes()
        blob = (
            subprocess.check_output(
                ["git", "hash-object", "-w", "--stdin"], cwd=self.root, input=b"index-only\n"
            )
            .decode()
            .strip()
        )
        self.git("update-index", "--cacheinfo", f"100644,{blob},source.rs")
        self.assertEqual((self.root / "source.rs").read_bytes(), content)

    def test_index_only_drift_marks_every_required_item_invalidated_without_execution(self):
        key = checks.input_key(self.root, self.base)
        self.change_index_only()
        result = self.execute(
            [self.item("a"), self.item("b")],
            key=key,
            runner=lambda *a, **k: self.fail("invalid inputs cannot execute"),
        )
        self.assertEqual(result["status"], "invalidated")
        self.assertEqual(
            [item["status"] for item in result["results"]], ["invalidated", "invalidated"]
        )

    def test_docs_do_not_require_gui_but_gui_requires_production_budget_and_interactions(self):
        docs = self.plan(["docs/features.md"])
        self.assertFalse(
            any(item["group"] in checks.ci_scope.WORKFLOW_GROUPS["gui"] for item in docs["items"])
        )
        self.assertIn("docs", {item["id"] for item in docs["items"]})
        gui = self.plan(["clients/gui/renderer/src/Composer.tsx"])
        self.assertTrue(
            {"portable:bundle", "gui-types", "smoke:test:composer"}
            <= {item["id"] for item in gui["items"]}
        )
        self.assertIn(
            "scripts", {item["id"] for item in self.plan(["scripts/ci-scope.py"])["items"]}
        )

    def test_relay_service_alone_cannot_skip_pinned_transport_and_authorization(self):
        self.assertTrue(checks.ci_scope.applicable("gui", ["services/remote-relay/src/server.mjs"]))
        plan = self.plan(["services/remote-relay/src/server.mjs"])
        relay = next(item for item in plan["items"] if item["id"] == "relay-contracts")
        self.assertIn("node-24.2.0", relay["requires"])
        self.assertEqual(relay["command"][-1], "test:remote-relay")

    def test_plan_resolves_base_without_executing_and_records_full_pending_scope(self):
        (self.root / "docs").mkdir()
        (self.root / "docs/new.md").write_text("Documentation fixture\n")
        output = io.StringIO()
        with (
            patch.object(checks, "ROOT", self.root),
            patch.object(checks.preflight, "run_plan", side_effect=AssertionError("plan only")),
            redirect_stdout(output),
        ):
            self.assertEqual(checks.main(["--base", self.base, "--plan"]), 0)
        value = json.loads(output.getvalue())
        self.assertEqual(value["plan"]["source"]["baseRevision"], self.base)
        self.assertEqual(value["plan"]["paths"], ["docs/new.md"])
        self.assertEqual(
            value["plan"]["source"]["inputHash"], checks.input_key(self.root, self.base)
        )

    def test_empty_selection_is_explicit_and_still_rechecks_inputs(self):
        self.assertEqual(self.execute([])["results"], [])
        key = checks.input_key(self.root, self.base)
        (self.root / "source.rs").write_text("after planning\n")
        self.assertEqual(self.execute([], key=key)["status"], "invalidated")

    def test_empty_plan_index_only_drift_cannot_report_green(self):
        key = checks.input_key(self.root, self.base)
        self.change_index_only()
        self.assertEqual(self.execute([], key=key)["status"], "invalidated")

    def test_native_capability_omission_blocks_instead_of_selecting_a_smaller_green_set(self):
        calls = []
        result = self.execute(
            [self.item("native-in-wrong-lane", requires=("native-runtime",))],
            runner=lambda *a, **k: calls.append(a),
        )
        self.assertEqual(calls, [])
        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["results"][0]["status"], "blocked")
        self.assertEqual(result["results"][0]["missingRequirements"], ["native-runtime"])

    def test_independent_failures_are_collected_and_only_real_dependencies_block(self):
        calls = []

        def runner(command, **kwargs):
            calls.append(command[0])
            return subprocess.CompletedProcess(command, 7 if command == ["a"] else 0)

        report = self.execute([self.item("a"), self.item("b"), self.item("c", ("a",))], runner)
        self.assertEqual(calls, ["a", "b"])
        self.assertEqual(
            [item["status"] for item in report["results"]], ["failed", "passed", "blocked"]
        )
        saved = json.loads((self.root / "target/ci/1/report.json").read_text())
        self.assertEqual(saved["results"][0]["exitCode"], 7)

    def test_failed_attempt_reports_cannot_be_overwritten(self):
        self.execute([self.item("failed")], lambda *a, **k: subprocess.CompletedProcess(a, 9))
        path = self.root / "target/ci/1/report.json"
        saved = path.read_bytes()
        plan = self.plan([])
        with self.assertRaisesRegex(ValueError, "overwrite"):
            checks.preflight.run_plan(plan, self.root, [], path.parent)
        self.assertEqual(path.read_bytes(), saved)

    def test_source_change_during_execution_invalidates_green_command_and_remaining_checks(self):
        calls = []

        def runner(command, **kwargs):
            calls.append(command)
            (self.root / "source.rs").write_text("during check\n")
            return subprocess.CompletedProcess(command, 0)

        report = self.execute([self.item("a"), self.item("b")], runner)
        self.assertEqual(report["status"], "invalidated")
        self.assertEqual(calls, [["a"]])
        self.assertTrue(all(item["status"] == "invalidated" for item in report["results"]))

    def test_mapping_removal_still_falls_back_conservatively(self):
        with patch.dict(checks.ci_scope.SCOPES, {"gui": [], "release": []}, clear=True):
            plan = self.plan(["schemas/areal-core-v1.json"])
        self.assertIn("portable:bundle", {item["id"] for item in plan["items"]})
        self.assertEqual(plan["fallbackPaths"], ["schemas/areal-core-v1.json"])

    def test_legacy_manifest_preview_reports_missing_requirements_without_claiming_execution(self):
        result = subprocess.run(
            ["node", str(ROOT / "clients/gui/scripts/test-manifest.mjs"), "--select-changed"],
            input=json.dumps({"paths": ["schemas/new.json"], "available": [], "platform": "linux"}),
            text=True,
            capture_output=True,
            check=True,
        )
        selected = json.loads(result.stdout)
        self.assertIn("test:feedback-native", {item["script"] for item in selected["unexecuted"]})
        self.assertIn("test:composer", selected["deferred"])


if __name__ == "__main__":
    unittest.main()
