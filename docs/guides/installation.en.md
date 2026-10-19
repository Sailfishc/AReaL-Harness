[中文](installation.md) | **English**

# Installation and upgrades

Use these commands after the packages are published to GitHub Releases. Before publication, use candidate artifacts from the `Release bundles` workflow for verification; unreleased versions and taps are not available installation sources.

## Platforms and contents

| Platform | Distribution | Prerequisites |
|---|---|---|
| macOS arm64 | Complete GitHub Release bundle and Python installer; optional Homebrew formula once the tap is published | macOS 15+, Xcode Command Line Tools; standalone install/upgrade requires Python 3.9+ on PATH |
| Linux x86_64 | Complete GitHub Release bundle and Python installer | Ubuntu 22.04 or newer compatible glibc 2.35+ system; standalone install/upgrade requires Python 3.9+ on PATH; musl unsupported |

Only these architectures are validated. No Windows, Intel macOS or Linux arm64 packages are provided. **npm and `cargo install` do not provide complete bundles yet**, so neither is an installation channel. Choose Homebrew or standalone installation, not both for the same PATH entry. Bundles contain `bin/areal`, `libexec/areal/{areal-runtime,areal-runtime-fs}`, LICENSE and a file SHA256 manifest; Linux bundles also include `areal-runtime-reaper` in the same directory. Do not copy only `areal`. Startup does not require Rust/Cargo. macOS still requires an executable `/usr/bin/python3` from Command Line Tools; configured Node/Python tools need their interpreters.

macOS bundles are ad-hoc signed, without Developer ID signing or notarization. Linux defaults to YOLO/full-access under the current user's permissions. Restricted/read-only scopes require `/usr/bin/bwrap` and usable user namespaces. Install `bubblewrap` on Ubuntu; restricted operations fail if user namespaces are disabled or AppArmor denies them, without silently expanding permissions. See [Runtime deployment](runtime.en.md).

## Homebrew (future channel)

Use the complete-bundle installer below. An `areal.rb` release attachment does not establish a public tap. Do not overwrite Homebrew files with the installer. Existing Homebrew installations remain owned by Homebrew: `areal upgrade` invokes the original formula and fails explicitly if its tap has not caught up.

## Standalone installation (macOS / Linux)

Download the installer and checksums from the same Release and verify before execution. Pin the version to avoid silent upgrades:

```sh
version=0.1.6
base="https://github.com/areal-project/AReaL-Harness/releases/download/v${version}"
curl -fL "$base/install.py" -o install.py
curl -fL "$base/SHA256SUMS" -o SHA256SUMS
python3 - <<'PY'
import hashlib
from pathlib import Path
lines = [line.split() for line in Path('SHA256SUMS').read_text().splitlines()]
expected = [digest for digest, name in lines if name == 'install.py']
assert len(expected) == 1 and hashlib.sha256(Path('install.py').read_bytes()).hexdigest() == expected[0]
PY
python3 install.py --version "$version"
export PATH="$HOME/.local/bin:$PATH"
command -v areal
areal --version
areal build-info
```

The default destination is `~/.local/lib/areal/<version>-macos-arm64` or `<version>-linux-x86_64`, with a symlink at `~/.local/bin/areal`. Use `--prefix /absolute/path` for another writable directory. The installer never invokes sudo or changes shell configuration. It refuses to replace an unmanaged `bin/areal` or an existing version directory.

For offline installation, download the platform archive and matching SHA256SUMS:

```sh
python3 install.py --version 0.1.6 --prefix "$HOME/.local" \
  --archive areal-harness-v0.1.6-x86_64-unknown-linux-gnu.tar.gz \
  --checksums SHA256SUMS
```

For macOS offline installation, use `areal-harness-v0.1.6-aarch64-apple-darwin.tar.gz` instead. `python3 install.py --version latest --check` queries the latest public Release without installing it; `--version latest` installs it when explicitly requested.

The installer verifies the archive and all bundle files before executing any bundled program, rejecting links, devices and traversal entries. SHA256 verifies consistency with the published manifest; it is not independent authentication of the release source.

## Upgrade commands

Back up configuration and history first (normally `~/.areal`, plus any custom data directories), finish active work, then stop each shared service:

```sh
areal service list
areal service stop --workspace /absolute/workspace
areal upgrade --check
areal upgrade
command -v areal
areal --version
areal build-info
```

`command -v areal` should select the intended installation entry. Check PATH when several prefixes coexist, and run `hash -r` if needed. `build-info` reports the source commit; the complete bundle's `manifest.json` records platform and per-file SHA-256. Retain it alongside the matching release's `SHA256SUMS`.

The current source installer and `areal upgrade` both refuse running, stopping, or unknown shared services. The installer checks again after downloading and excludes concurrent installers for one prefix. The published 0.1.6 installer predates these additional protections: manually check and stop services before reinstalling it. Participating versions share a service lease per installation prefix: admission acquires it before registration, and the installer holds exclusive admission across the final check and switch. In-flight or running services block switching; starts during switching fail immediately and should retry through the active entry afterward. Workspaces, registration directories and GUI profiles using the same managed Core prefix share this protection. Bundled GUI Core and other prefixes use independent leases.

Interrupted downloads, bad checksums, mismatched program versions, and failed entry switches preserve the old entry and configuration/history. Fix the cause and retry. If interruption follows a completed entry switch, the new version may already be active: inspect the entry and version before deleting any candidate directory. Forced termination can leave staging or an inactive version directory: retain old installations and user data. If a version directory already exists, inspect its integrity and the active entry before proceeding; do not overwrite it. To roll back the executable, stop services and repoint the entry symlink to the retained old version. If the new version has written data, restore the matching pre-upgrade backup; old versions are not guaranteed to read newer data formats.

## Migrating older versions without admission coordination

`installationGuardVersion: 1` in `areal build-info` means the program participates in installation/start coordination. The current source installer requires both the active program and candidate bundle to declare this capability; otherwise it refuses automatic switching and preserves the old package and data. Published 0.1.6 and earlier programs do not gain this guarantee by using the new installer. Retained old programs and old installers do not honor the new lock either.

Finish tasks, stop all related services and clients, and back up configuration/history before migrating. Once a participating version is published, use its installer with a new empty prefix (for example `~/.local/areal-next`), verify its version, complete bundle and capability, then explicitly select the new prefix's `bin` on PATH. Retain the original installation for review or a rollback with matching data. Do not reopen old clients or execute old retained binaries afterward. This manual cold migration provides no new atomic coordination for legacy processes and is not a concurrent automatic upgrade path.

## Configuration, upgrades and uninstalling

Configure the model in `~/.areal/config.toml` using the [configuration guide](configuration.en.md), then launch `areal` in a workspace. Remove retired `limits.turn_timeout_seconds` and `AREAL_HARNESS_TURN_TIMEOUT_SECONDS` settings. Run `areal config validate`. Old `~/.areal-harness` state is not migrated automatically.

`areal version` is equivalent to `areal --version`. `areal upgrade --check` queries the latest public release; `areal upgrade` selects the original installation channel: Homebrew upgrades the formula and verifies its installed version (reporting an error if the tap is not yet updated), while standalone installations verify a complete new bundle before atomically switching the entry symlink. Source builds and unmanaged copies refuse self-upgrade. Before upgrading, inspect `areal service list` and stop each workspace service with `areal service stop --workspace /absolute/workspace`. Busy tasks prevent stopping by default; complete or explicitly pause them first. The command also refuses to upgrade while a shared service is still running. Never overwrite running binaries. Standalone installations retain old version directories so the symlink can be switched back after stopping services. Older versions may not understand newer state formats; back up `~/.areal` before upgrading.

Stop services before uninstalling. Use `brew uninstall areal` or remove the installer-managed standalone entry symlink and selected version directories. Neither installation method automatically deletes configuration or history in `~/.areal`.

Symlink entry points are resolved to the real version directory before locating `libexec/areal`, covering Homebrew Cellar and versioned Linux installations.

## Installing from source

Run `make install` to build release and install the complete Runtime under `/usr/local`. Use `make install PREFIX="$HOME/.local"` for a user installation, or `DESTDIR=/tmp/package` for staging. Search uses ripgrep Rust libraries embedded in the file helper; no separate rg is needed. Shell tasks that invoke rg still require a host installation.
