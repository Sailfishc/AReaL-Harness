[中文](installation.md) | **English**

# Installation and upgrades

Use these commands after the packages are published to GitHub Releases. Before publication, use candidate artifacts from the `Release bundles` workflow for verification; unreleased versions and taps are not available installation sources.

## Platforms and contents

| Platform | Distribution | Prerequisites |
|---|---|---|
| macOS arm64 | `areal` formula in a Homebrew tap | macOS 15+, Xcode Command Line Tools including system Python |
| Linux x86_64 | Complete tar.gz and Python installer | Ubuntu 22.04 or newer compatible glibc 2.35+ system, `/usr/bin/python3` 3.9+; musl unsupported |

Only these architectures are validated. No Windows, Intel macOS or Linux arm64 packages are provided. Bundles contain `bin/areal`, `libexec/areal/{areal-runtime,areal-runtime-fs,tools/rg}`, tool licenses, LICENSE and a file SHA256 manifest. Do not copy only `areal`. Rust/Cargo is unnecessary after installation; configured Node/Python tools still require their interpreters.

macOS bundles are ad-hoc signed, without Developer ID signing or notarization. Linux defaults to YOLO/full-access under the current user's permissions. Restricted/read-only scopes require `/usr/bin/bwrap` and usable user namespaces. Install `bubblewrap` on Ubuntu; restricted operations fail if user namespaces are disabled or AppArmor denies them, without silently expanding permissions. See [Runtime deployment](runtime.en.md).

## Homebrew (macOS)

After maintainers publish the release-generated `areal.rb` to `areal-project/homebrew-tap`:

```sh
xcode-select --install  # Skip if Command Line Tools are installed
brew tap areal-project/tap
brew install areal-project/tap/areal
areal --version
brew test areal-project/tap/areal
```

The tap may not exist before the first release. The formula uses the final archive SHA256 and installs a complete precompiled bundle without compiling Rust. It does not register brew services; use `areal service` for shared services.

## Linux

Download the installer and checksums from the same Release and verify before execution. Pin the version to avoid silent upgrades:

```sh
version=0.1.1
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
areal --version
```

The default destination is `~/.local/lib/areal/<version>-linux-x86_64`, with a symlink at `~/.local/bin/areal`. Use `--prefix /absolute/path` for another writable directory. The installer never invokes sudo or changes shell configuration. It refuses to replace an unmanaged `bin/areal` or an existing version directory.

For offline installation, download the platform archive and matching SHA256SUMS:

```sh
python3 install.py --version 0.1.1 --prefix "$HOME/.local" \
  --archive areal-harness-v0.1.1-x86_64-unknown-linux-gnu.tar.gz \
  --checksums SHA256SUMS
```

The installer verifies the archive and all bundle files before executing any bundled program, rejecting links, devices and traversal entries. SHA256 verifies consistency with the published manifest; it is not independent authentication of the release source.

## Configuration, upgrades and uninstalling

Configure the model in `~/.areal/config.toml` using the [configuration guide](configuration.en.md), then launch `areal` in a workspace. Remove retired `limits.turn_timeout_seconds` and `AREAL_HARNESS_TURN_TIMEOUT_SECONDS` settings. Run `areal config validate`. Old `~/.areal-harness` state is not migrated automatically.

Before upgrading, inspect `areal service list` and stop each workspace service with `areal service stop --workspace /absolute/workspace`. Busy tasks prevent stopping by default; complete or explicitly pause them first. Use `brew upgrade areal-project/tap/areal` on macOS or install the new version on Linux. Never overwrite running binaries. Linux retains old version directories, allowing the entry symlink to be switched back after services stop. Older versions may not understand newer state formats; back up `~/.areal` before upgrading.

Stop services before uninstalling. Use `brew uninstall areal` or remove the installer-managed Linux entry symlink and selected version directories. Neither installation method automatically deletes configuration or history in `~/.areal`.

Symlink entry points are resolved to the real version directory before locating `libexec/areal`, covering Homebrew Cellar and versioned Linux installations.
