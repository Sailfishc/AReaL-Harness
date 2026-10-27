[中文](CHANGELOG.md) | **English**

# Changelog

## Unreleased

- GUI update-check errors are visible. Native validation timeouts keep the backend running; unknown backend-stop results cannot trigger repeated installation.
- Back up configuration and history before upgrading. GUI previews require manual installation; older versions may not read newer data formats.

## CLI / TUI 0.1.7

### Changes

- Standalone upgrades update the command entry while retaining complete old bundles and running backends; explicitly restart the backend once idle. Homebrew stable and beta track their own channels.
- Improve TUI session recovery after disconnection. CLI and single-input modes accept `--no-session-name` to disable automatic naming while retaining history and resume.
- Fix state preservation during network recovery and child-task handoffs, and improve reporting of command exit codes and file-tool results.

### macOS download and usage (Apple Silicon)

Requires macOS 15+, Xcode Command Line Tools and an executable `/usr/bin/python3`. Install the complete CLI/TUI and Runtime through the public Homebrew tap:

```sh
brew tap areal-project/tap
brew install areal-project/tap/areal
brew test areal-project/tap/areal
areal --version
```

Expect `areal 0.1.7`. For an existing Homebrew installation, finish tasks, inspect `areal service list`, safely stop each workspace with `areal service stop --workspace /absolute/workspace`, then run `brew update` and `brew upgrade --formula areal-project/tap/areal`. macOS CLI binaries are ad-hoc signed, without Developer ID signing or Apple notarization.

The [complete macOS arm64 archive](https://github.com/areal-project/AReaL-Harness/releases/download/v0.1.7/areal-harness-v0.1.7-aarch64-apple-darwin.tar.gz) is also available for offline distribution; verify and install the complete bundle as described in the [installation guide](docs/guides/installation.en.md).

### Linux download and usage (x86_64)

Requires glibc 2.35+ (such as Ubuntu 22.04+) and Python 3.9+. Restricted or read-only execution also requires system Bubblewrap and usable user namespaces. Download and verify the installer from the same Release; it downloads and verifies the [complete Linux x86_64 archive](https://github.com/areal-project/AReaL-Harness/releases/download/v0.1.7/areal-harness-v0.1.7-x86_64-unknown-linux-gnu.tar.gz):

```sh
(
set -eu
download_dir=$(mktemp -d)
cd "$download_dir"
base=https://github.com/areal-project/AReaL-Harness/releases/download/v0.1.7
curl -fL "$base/install.py" -o install.py
curl -fL "$base/SHA256SUMS" -o SHA256SUMS
python3 - <<'VERIFY'
import hashlib
from pathlib import Path
entries = [line.split() for line in Path('SHA256SUMS').read_text().splitlines()]
expected = [digest for digest, name in entries if name == 'install.py']
assert len(expected) == 1
assert hashlib.sha256(Path('install.py').read_bytes()).hexdigest() == expected[0]
VERIFY
python3 install.py --version 0.1.7 --prefix "$HOME/.local"
"$HOME/.local/bin/areal" --version
)
```

After success, run `export PATH="$HOME/.local/bin:$PATH"` and retain that PATH in new terminals. Use the same `--prefix` for an existing standalone installation. Use the verified installer above for the first transition from an older stable release; subsequent upgrades use `areal upgrade --check` and `areal upgrade`. Once idle, explicitly activate the new backend with `areal service restart --workspace /absolute/workspace` from the new entry, retaining the original configuration arguments.

### Configure and start (both platforms)

Configure the provider, model and authentication in `~/.areal/config.toml` using the [model configuration guide](docs/guides/configuration.en.md), then enter your project directory:

```sh
areal config validate
areal             # Open the interactive TUI
# Or run a single CLI task
areal exec "Summarize this project's structure"
```

Back up configuration and history before upgrading (normally `~/.areal`, plus custom data directories). This release writes state format 15; retaining an old executable is not a compatible data backup. Verify standalone entry and backend versions separately; Homebrew upgrades require safely stopped services. See the full [installation and upgrade guide](docs/guides/installation.en.md).

Installation, upgrade and verification commands: [CLI guide](docs/guides/installation.en.md) and [GUI guide](clients/gui/README.en.md#installation-and-updates).
