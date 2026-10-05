"""发行归档、formula 和版本化安装的回归。"""

import hashlib
import importlib.util
import io
import json
import platform
import subprocess
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


installer = load("release_installer", "install.py")
release = load("release_artifacts", "release-artifacts.py")


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def bundle(self, version="0.1.0", target="linux/x86_64"):
        bundle = self.root / (version + target.replace("/", "-"))
        bundle.mkdir()
        files = {}
        for name in [
            "bin/areal",
            "libexec/areal/areal-runtime",
            "libexec/areal/areal-runtime-fs",
            "libexec/areal/tools/rg",
            "LICENSE",
        ]:
            p = bundle / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text("fixture " + name)
            p.chmod(0o755)
            files[name] = installer.checksum(p)
        (bundle / "manifest.json").write_text(
            json.dumps(
                {
                    "manifestVersion": 1,
                    "productVersion": "areal " + version,
                    "platform": target,
                    "files": files,
                    "profile": "release",
                    "workingTree": False,
                    "prerequisites": [{"glibc": ">=2.35", "verifiedVersion": "2.35"}],
                }
            )
        )
        return bundle

    def test_archive_roundtrip_and_tampered_checksum(self):
        bundle = self.bundle()
        archive = release.archive(bundle, self.root / "assets")
        sums = archive.with_name(archive.name + ".sha256")
        installer.verify_archive(archive, sums, archive.name)
        unpacked = installer.extract_bundle(archive, self.root / "unpack")
        installer.verify_bundle(unpacked, "0.1.0", "linux/x86_64")
        archive.write_bytes(archive.read_bytes() + b"tampered")
        with self.assertRaises(ValueError):
            installer.verify_archive(archive, sums, archive.name)

    def test_manifest_rejects_missing_extra_and_changed_files(self):
        bundle = self.bundle()
        with self.assertRaises(ValueError):
            installer.verify_bundle(bundle, "0.1.1", "linux/x86_64")
        with self.assertRaises(ValueError):
            installer.verify_bundle(bundle, "0.1.0", "darwin/arm64")
        (bundle / "extra").write_text("not in manifest")
        with self.assertRaises(ValueError):
            installer.verify_bundle(bundle, "0.1.0", "linux/x86_64")
        (bundle / "extra").unlink()
        (bundle / "bin/areal").write_text("changed")
        with self.assertRaises(ValueError):
            installer.verify_bundle(bundle, "0.1.0", "linux/x86_64")

    def test_archive_rejects_traversal_links_and_duplicates(self):
        for mode in ["traversal", "symlink", "duplicate"]:
            archive = self.root / (mode + ".tar.gz")
            with tarfile.open(archive, "w:gz") as stream:
                member = tarfile.TarInfo(
                    "areal/../outside" if mode == "traversal" else "areal/bin/areal"
                )
                if mode == "symlink":
                    member.type = tarfile.SYMTYPE
                    member.linkname = "/etc/passwd"
                stream.addfile(member, io.BytesIO(b""))
                if mode == "duplicate":
                    stream.addfile(member, io.BytesIO(b""))
            with self.assertRaises(ValueError):
                installer.extract_bundle(archive, self.root / mode)
        self.assertFalse((self.root / "outside").exists())

    def test_formula_uses_actual_archive_hash_and_full_bundle(self):
        archive = release.archive(self.bundle(target="darwin/arm64"), self.root / "assets")
        output = self.root / "Formula/areal.rb"
        release.formula(archive, output)
        text = output.read_text()
        self.assertIn(hashlib.sha256(archive.read_bytes()).hexdigest(), text)
        self.assertIn("/v0.1.0/" + archive.name, text)
        self.assertIn('prefix.install "bin", "libexec", "manifest.json", "LICENSE"', text)
        self.assertNotIn("PLACEHOLDER", text)

    def test_release_rejects_dirty_or_debug_bundles(self):
        bundle = self.bundle()
        p = bundle / "manifest.json"
        data = json.loads(p.read_text())
        for field, value in [("workingTree", True), ("profile", "debug")]:
            changed = {**data, field: value}
            p.write_text(json.dumps(changed))
            with self.assertRaises(ValueError):
                release.archive(bundle, self.root / "assets")

    def test_latest_release_tag_is_validated(self):
        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *_):
                pass

            def read(self, *_):
                return b'{"tag_name":"v0.1.2"}'

        with patch.object(installer.urllib.request, "urlopen", return_value=Response()):
            self.assertEqual(installer.latest_version(), "0.1.2")

        class Invalid(Response):
            def read(self, *_):
                return b'{"tag_name":"../0.1.2"}'

        with patch.object(installer.urllib.request, "urlopen", return_value=Invalid()):
            with self.assertRaises(ValueError):
                installer.latest_version()

    @unittest.skipUnless(
        (platform.system() == "Darwin" and platform.machine() == "arm64")
        or (
            platform.system() == "Linux"
            and platform.machine() == "x86_64"
            and platform.libc_ver()[0] == "glibc"
            and tuple(map(int, platform.libc_ver()[1].split(".")[:2])) >= (2, 35)
        ),
        "supported installer platform",
    )
    def test_install_upgrade_keeps_old_version_and_refuses_unmanaged_binary(self):
        prefix = self.root / "prefix with spaces"
        target = "darwin/arm64" if platform.system() == "Darwin" else "linux/x86_64"
        directory = "macos-arm64" if platform.system() == "Darwin" else "linux-x86_64"
        for version in ["0.1.0", "0.1.1"]:
            archive = release.archive(self.bundle(version, target), self.root / "assets")
            command = [
                sys.executable,
                str(ROOT / "scripts/install.py"),
                "--version",
                version,
                "--prefix",
                str(prefix),
                "--archive",
                str(archive),
                "--checksums",
                str(archive.with_name(archive.name + ".sha256")),
            ]
            subprocess.run(command, check=True, capture_output=True)
            self.assertEqual(
                (prefix / "bin/areal").resolve(),
                (prefix / f"lib/areal/{version}-{directory}/bin/areal").resolve(),
            )
            self.assertNotEqual(subprocess.run(command, capture_output=True).returncode, 0)
        self.assertTrue((prefix / f"lib/areal/0.1.0-{directory}/bin/areal").exists())
        (prefix / "bin/areal").unlink()
        (prefix / "bin/areal").write_text("user-owned executable")
        command[command.index("--version") + 1] = "0.1.2"
        self.assertNotEqual(subprocess.run(command, capture_output=True).returncode, 0)
        self.assertEqual((prefix / "bin/areal").read_text(), "user-owned executable")


if __name__ == "__main__":
    unittest.main()
