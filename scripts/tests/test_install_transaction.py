"""直接调用安装器与可执行合成完整包，验证入口提交和失败不变量。"""

import fcntl
import io
import json
import os
import platform
import shutil
import subprocess
import sys
import unittest
from contextlib import nullcontext, redirect_stdout
from types import SimpleNamespace
from unittest.mock import patch

import test_release

installer = test_release.installer
release = test_release.release


class InstallTransactionTests(unittest.TestCase):
    def setUp(self):
        fixture = test_release.ReleaseTests(methodName="runTest")
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        self.fixture = fixture
        self.root = fixture.root.resolve()
        fixture.root = self.root
        self.prefix = self.root / "prefix with spaces"
        self.target = installer.TARGETS[(platform.system(), platform.machine())]
        self.home = self.root / "home"
        self.home.mkdir()
        for name, content in {
            ".areal/config.toml": "synthetic model config",
            ".areal/projects/history.json": "synthetic history",
            ".areal/credentials.json": "synthetic credential sentinel",
        }.items():
            path = self.home / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)
        self.services = self.root / "services.json"
        self.services.write_text("[]")
        environment = patch.dict(
            os.environ,
            {
                "HOME": str(self.home),
                "AREAL_INSTALL_FIXTURE_SERVICES": str(self.services),
            },
        )
        environment.start()
        self.addCleanup(environment.stop)
        self.data_before = self.user_data()

    def user_data(self):
        return {
            str(p.relative_to(self.home)): p.read_bytes()
            for p in self.home.rglob("*")
            if p.is_file()
        }

    def args(self, version):
        archive = release.archive(
            self.fixture.bundle(version, self.target[0], manifest_version=2),
            self.root / ("assets-" + version),
        )
        return SimpleNamespace(
            prefix=self.prefix,
            archive=archive,
            checksums=archive.with_name(archive.name + ".sha256"),
        )

    def install(self, version, args=None):
        with redirect_stdout(io.StringIO()) as output:
            installer.install(args or self.args(version), version, self.target)
        return output.getvalue()

    def old_install(self):
        self.install("0.1.5")
        self.old = (self.prefix / "bin/areal").resolve()
        self.old_bytes = self.old.read_bytes()

    def unchanged(self, rejected="0.1.6"):
        self.assertEqual((self.prefix / "bin/areal").resolve(), self.old)
        self.assertEqual(self.old.read_bytes(), self.old_bytes)
        self.assertEqual(self.user_data(), self.data_before)
        self.assertFalse((self.prefix / f"lib/areal/{rejected}-{self.target[2]}").exists())
        self.assertEqual(list((self.prefix / "lib/areal").glob(".install-*")), [])

    def test_new_install_upgrade_version_path_and_data(self):
        self.old_install()
        output = self.install("0.1.6")
        link = self.prefix / "bin/areal"
        result = subprocess.run(
            [str(link), "--version"], capture_output=True, text=True, check=True
        )
        self.assertEqual(result.stdout, "areal 0.1.6\n")
        self.assertEqual(self.old.read_bytes(), self.old_bytes)
        self.assertEqual(self.user_data(), self.data_before)
        self.assertIn(str(link) + " --version", output)
        self.assertEqual(
            link.resolve(), self.prefix / f"lib/areal/0.1.6-{self.target[2]}/bin/areal"
        )

    def test_path_shadow_is_reported(self):
        shadow = self.root / "other-areal"
        shadow.write_text("user managed")
        with patch.object(installer.shutil, "which", return_value=str(shadow)):
            output = self.install("0.1.6")
        self.assertIn("PATH selects another installation: " + str(shadow), output)
        self.assertEqual(shadow.read_text(), "user managed")

    def test_checksum_failure_retains_old_install_and_can_retry(self):
        self.old_install()
        args = self.args("0.1.6")
        original = args.checksums.read_text()
        args.checksums.write_text("0" * 64 + "  " + args.archive.name + "\n")
        with self.assertRaisesRegex(ValueError, "checksum"):
            self.install("0.1.6", args)
        self.unchanged()
        args.checksums.write_text(original)
        self.install("0.1.6", args)
        self.assertEqual(
            (self.prefix / "bin/areal").resolve().parent.parent.name, "0.1.6-" + self.target[2]
        )

    def test_interrupted_download_retains_old_install(self):
        self.old_install()
        args = SimpleNamespace(prefix=self.prefix, archive=None, checksums=None)

        def interrupted(_url, path):
            path.write_bytes(b"partial download")
            raise ConnectionResetError("fixture interruption")

        with patch.object(installer, "download", side_effect=interrupted):
            with self.assertRaisesRegex(ConnectionResetError, "fixture interruption"):
                self.install("0.1.6", args)
        self.unchanged()
        self.install("0.1.6")
        self.assertEqual(self.user_data(), self.data_before)

    def test_running_stopping_unknown_and_malformed_services_block_direct_installer(self):
        self.old_install()
        args = self.args("0.1.6")
        for value in [
            '[{"state":"ready"}]',
            '[{"state":"stopping"}]',
            '[{"state":"unavailable"}]',
            "[{}]",
            "{}",
            "invalid",
        ]:
            with self.subTest(value=value):
                self.services.write_text(value)
                with self.assertRaises(ValueError):
                    self.install("0.1.6", args)
                self.unchanged()
        self.services.write_text('[{"state":"stopped"}]')
        self.install("0.1.6", args)
        self.assertEqual(self.user_data(), self.data_before)

    def test_first_install_also_checks_shared_services(self):
        self.services.write_text('[{"state":"ready"}]')
        with self.assertRaisesRegex(ValueError, "stop all shared services"):
            self.install("0.1.6")
        self.assertFalse((self.prefix / "bin/areal").exists())
        self.assertEqual(self.user_data(), self.data_before)

    def test_service_started_during_download_blocks_commit(self):
        self.old_install()
        offline = self.args("0.1.6")
        args = SimpleNamespace(prefix=self.prefix, archive=None, checksums=None)

        def download(url, path):
            shutil.copyfile(
                offline.checksums if url.endswith("SHA256SUMS") else offline.archive, path
            )
            self.services.write_text('[{"state":"ready"}]')

        with patch.object(installer, "download", side_effect=download):
            with self.assertRaisesRegex(ValueError, "stop all shared services"):
                self.install("0.1.6", args)
        self.unchanged()

    def test_link_commit_failure_or_interrupt_rolls_back_candidate(self):
        self.old_install()
        args = self.args("0.1.6")
        for failure in [OSError("fixture full disk"), KeyboardInterrupt()]:
            with patch.object(installer.os, "replace", side_effect=failure):
                with self.assertRaises(type(failure)):
                    self.install("0.1.6", args)
            self.unchanged()
        self.install("0.1.6", args)
        self.assertEqual(self.user_data(), self.data_before)

    def test_another_installer_cannot_enter_same_prefix(self):
        self.old_install()
        args = self.args("0.1.6")
        with (self.prefix / "lib/areal/.install.lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            result = subprocess.run(
                [
                    sys.executable,
                    str(test_release.ROOT / "scripts/install.py"),
                    "--version",
                    "0.1.6",
                    "--prefix",
                    str(self.prefix),
                    "--archive",
                    str(args.archive),
                    "--checksums",
                    str(args.checksums),
                ],
                text=True,
                capture_output=True,
            )
        self.assertEqual(result.returncode, 1)
        self.assertIn("another installation is in progress", result.stderr)
        self.unchanged()

    def test_interruption_after_committed_switch_keeps_active_version_usable(self):
        self.old_install()
        args = self.args("0.1.6")
        replace = installer.os.replace

        def committed_then_interrupted(source, destination):
            replace(source, destination)
            raise KeyboardInterrupt()

        with patch.object(installer.os, "replace", side_effect=committed_then_interrupted):
            with self.assertRaises(KeyboardInterrupt):
                self.install("0.1.6", args)
        entry = self.prefix / "bin/areal"
        self.assertEqual(
            subprocess.check_output([str(entry), "--version"], text=True), "areal 0.1.6\n"
        )
        self.assertEqual(self.old.read_bytes(), self.old_bytes)
        self.assertEqual(self.user_data(), self.data_before)
        self.assertEqual(list((self.prefix / "lib/areal").glob(".install-*")), [])

    def test_candidate_must_report_expected_version(self):
        self.old_install()
        bundle = self.fixture.bundle("0.1.6", self.target[0])
        program = bundle / "bin/areal"
        program.write_text(program.read_text().replace("areal 0.1.6", "areal 9.9.9"))
        manifest = json.loads((bundle / "manifest.json").read_text())
        manifest["files"]["bin/areal"] = installer.checksum(program)
        (bundle / "manifest.json").write_text(json.dumps(manifest))
        archive = release.archive(bundle, self.root / "assets")
        args = SimpleNamespace(
            prefix=self.prefix,
            archive=archive,
            checksums=archive.with_name(archive.name + ".sha256"),
        )
        with self.assertRaisesRegex(ValueError, "program version"):
            self.install("0.1.6", args)
        self.unchanged()

    def test_missing_linux_reaper_is_not_a_complete_bundle(self):
        bundle = self.fixture.bundle("0.1.6", "linux/x86_64")
        (bundle / "libexec/areal/areal-runtime-reaper").unlink()
        path = bundle / "manifest.json"
        manifest = json.loads(path.read_text())
        del manifest["files"]["libexec/areal/areal-runtime-reaper"]
        path.write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ValueError, "inventory"):
            installer.verify_bundle(bundle, "0.1.6", "linux/x86_64")

    def test_homebrew_and_unmanaged_entry_are_not_replaced(self):
        self.prefix.joinpath("bin").mkdir(parents=True)
        cellar = self.root / "Cellar/areal/0.1.6/bin/areal"
        cellar.parent.mkdir(parents=True)
        cellar.write_text("brew fixture")
        link = self.prefix / "bin/areal"
        link.symlink_to(cellar)
        with self.assertRaisesRegex(ValueError, "Homebrew"):
            self.install("0.1.7")
        self.assertEqual(link.resolve(), cellar)
        self.assertEqual(cellar.read_text(), "brew fixture")

    def start_admission(self):
        # 子进程真实参与 flock；stdin/stdout 是确定性交错屏障，不使用 sleep。
        program = """import fcntl, sys
with open(sys.argv[1], "a+") as gate:
    try:
        fcntl.flock(gate, fcntl.LOCK_SH | fcntl.LOCK_NB)
    except BlockingIOError:
        print("BLOCKED", flush=True)
        sys.exit(23)
    print("ADMITTED", flush=True)
    sys.stdin.read(1)
"""
        child = subprocess.Popen(
            [sys.executable, "-c", program, str(self.prefix / "lib/areal/.service.lock")],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
        )
        self.addCleanup(lambda: child.poll() is None and child.communicate("x", timeout=10))
        return child, child.stdout.readline().strip()

    def test_final_check_to_switch_has_a_deterministic_negative_control(self):
        self.old_install()
        replace = installer.os.replace
        observations = []

        def switch_while_attempting_start(source, destination):
            child, admission = self.start_admission()
            observations.append(admission)
            replace(source, destination)
            if admission == "ADMITTED":
                self.assertIsNone(child.poll())
                child.communicate("x", timeout=10)
            else:
                child.communicate(timeout=10)
                self.assertEqual(child.returncode, 23)

        with patch.object(installer, "switch_gate", side_effect=lambda _: nullcontext()):
            with patch.object(installer.os, "replace", side_effect=switch_while_attempting_start):
                self.install("0.1.6")
        with patch.object(installer.os, "replace", side_effect=switch_while_attempting_start):
            self.install("0.1.7")
        self.assertEqual(observations, ["ADMITTED", "BLOCKED"])
        self.assertEqual(self.old.read_bytes(), self.old_bytes)
        self.assertEqual(self.user_data(), self.data_before)

    def test_inflight_start_without_registry_record_blocks_switch_and_releases_on_exit(self):
        self.old_install()
        child, admission = self.start_admission()
        self.assertEqual(admission, "ADMITTED")
        args = self.args("0.1.6")
        try:
            with self.assertRaisesRegex(ValueError, "running or starting"):
                self.install("0.1.6", args)
            self.unchanged()
            self.assertEqual(self.services.read_text(), "[]")
        finally:
            child.communicate("x", timeout=10)
        self.install("0.1.6", args)
        self.assertEqual(self.user_data(), self.data_before)

    def test_legacy_active_program_is_refused_without_switching_or_deleting_old_package(self):
        self.old_install()
        args = self.args("0.1.6")
        for capability, message in [("0", "legacy binary lacks"), ("invalid", "cannot confirm")]:
            with patch.dict(os.environ, {"AREAL_INSTALL_FIXTURE_GUARD_VERSION": capability}):
                with self.assertRaisesRegex(ValueError, message):
                    self.install("0.1.6", args)
            self.unchanged()
        self.install("0.1.6", args)
        self.assertEqual(self.old.read_bytes(), self.old_bytes)

    def test_unsupported_candidate_is_refused_and_can_be_retried_with_supported_bundle(self):
        args = self.args("0.1.6")
        with patch.dict(os.environ, {"AREAL_INSTALL_FIXTURE_GUARD_VERSION": "0"}):
            with self.assertRaisesRegex(ValueError, "legacy binary lacks"):
                self.install("0.1.6", args)
        self.assertFalse((self.prefix / "bin/areal").exists())
        self.install("0.1.6", args)
        self.assertEqual(self.user_data(), self.data_before)
