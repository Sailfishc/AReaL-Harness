**中文** | [English](installation.en.md)

# 安装与升级

安装包发布到 GitHub Release 后，使用本页命令。发布前只可下载 `Release bundles` workflow 的候选产物进行验收，不能把尚未发布的版本或 tap 当作可用安装源。

## 平台与组成

| 平台 | 分发方式 | 前置条件 |
|---|---|---|
| macOS arm64 | GitHub Release 完整包 + Python 安装器；Homebrew tap 发布后可选 formula | macOS 15+、Xcode Command Line Tools；独立安装/升级需 PATH 中的 Python 3.9+ |
| Linux x86_64 | GitHub Release 完整包 + Python 安装器 | Ubuntu 22.04 或更新的兼容 glibc 2.35+ 系统；独立安装/升级需 PATH 中的 Python 3.9+；不支持 musl |

只验证上述架构，不提供 Windows、macOS Intel 或 Linux arm64 包。**npm 与 `cargo install` 尚未提供完整发行包**，不能作为安装渠道。Homebrew 和独立安装器二选一，不应同时管理同一个 PATH 入口。每个包包含 `bin/areal`、`libexec/areal/{areal-runtime,areal-runtime-fs}`、LICENSE 和文件 SHA256 manifest；Linux 包另外包含同目录的 `areal-runtime-reaper`，不要只复制 `areal`。安装后无需 Rust/Cargo；macOS 仍需要可用的 `/usr/bin/python3`（Command Line Tools），运行自定义 Node/Python 工具需对应解释器。

macOS 包采用 ad-hoc 签名，尚无 Developer ID 签名和公证。Linux 默认 YOLO/full-access 以当前用户权限运行；受限/只读 Scope 需要 `/usr/bin/bwrap` 及可用 user namespace。Ubuntu 可安装 `bubblewrap`；系统禁用 user namespace 或 AppArmor 拒绝时，受限操作会失败，不自动放宽权限。完整边界见 [Runtime 部署](runtime.md)。

## Homebrew（未来渠道）

目前优先使用下方完整包安装器；Release 中存在 `areal.rb` 不表示公开 tap 已可用。不要自行混用安装器覆盖 Homebrew 的文件。已有 Homebrew 安装由 Homebrew 管理，`areal upgrade` 会使用原 formula；tap 未更新时会明确失败。

## 独立安装（macOS / Linux）

从同一 Release 下载安装器和清单，校验后执行。固定版本避免在未知版本之间静默升级：

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

默认安装到 `~/.local/lib/areal/<version>-macos-arm64` 或 `<version>-linux-x86_64`，入口为 `~/.local/bin/areal` 符号链接。`--prefix /absolute/path` 可选择有写权限的其他目录；不会自动 sudo 或修改 shell 配置。指定目录中已有非安装器管理的 `bin/areal` 时拒绝覆盖，同版本目录存在时拒绝覆盖。

离线安装先下载平台 tar.gz 与同一 Release 的 SHA256SUMS：

```sh
python3 install.py --version 0.1.6 --prefix "$HOME/.local" \
  --archive areal-harness-v0.1.6-x86_64-unknown-linux-gnu.tar.gz \
  --checksums SHA256SUMS
```

macOS 离线安装将归档名改为 `areal-harness-v0.1.6-aarch64-apple-darwin.tar.gz`。`python3 install.py --version latest --check` 仅查询最新已公开 Release，不安装；`--version latest` 可在明确选择时安装最新版。

安装器在执行任何包内程序前校验归档和全部文件，拒绝链接、设备和路径逃逸归档。SHA256 校验提供与发布清单的一致性，不替代发布源的身份验证。

## 升级命令

先备份配置与历史（默认 `~/.areal`；自定义数据目录也需备份），完成活动任务，然后逐项停止服务：

```sh
areal service list
areal service stop --workspace /absolute/workspace
areal upgrade --check
areal upgrade
command -v areal
areal --version
areal build-info
```

`command -v areal` 应指向所选安装的入口；多个前缀并存时检查 PATH，必要时运行 `hash -r`。`build-info` 给出源码提交；完整包 `manifest.json` 给出平台和逐文件 SHA-256，与同一 Release 的 `SHA256SUMS` 一起保留。

当前源码安装器与 `areal upgrade` 都拒绝运行中、停止中或状态未知的共享服务；安装器在下载后再次检查，并拒绝同一前缀并发安装。已发布 0.1.6 的安装器不包含本轮新增保护，重复安装前仍须按上述步骤手动检查和停止服务。安装器不阻止其他进程在检查之后启动新任务，切换期间不要重开客户端。

下载中断、摘要错误、程序版本不符或入口切换失败时，旧入口与配置/历史保持原样，可修复原因后重试。若入口已经切换后才中断，新版本可能已激活；先核对入口和版本，不能直接删除候选目录。强制终止进程可能遗留暂存或未激活的版本目录；不要删除旧安装或用户数据。同版本目录已存在时先核对其完整性和当前入口，不直接覆盖。回退程序前先停止服务，再将入口符号链接指回保留的旧版本；若新版本已写入数据，需配套恢复升级前备份，旧版本读取新格式不作保证。

## 配置、升级与卸载

按[配置指南](configuration.md)在 `~/.areal/config.toml` 配置模型，然后在工作区启动 `areal`。旧配置必须删除已移除的 `limits.turn_timeout_seconds` 和 `AREAL_HARNESS_TURN_TIMEOUT_SECONDS`。`areal config validate` 可检查配置。旧 `~/.areal-harness` 不会自动迁移。

`areal version` 与 `areal --version` 等价。`areal upgrade --check` 查询最新已公开版本，`areal upgrade` 按原安装来源执行：Homebrew 使用 formula 并核对安装版本（tap 尚未更新会报错），独立安装使用已校验的完整新包并原子切换入口；源码构建或非安装器管理的复制品拒绝自升级。升级前用 `areal service list` 检查服务，在各工作区执行 `areal service stop --workspace /absolute/workspace`；忙碌任务默认拒绝停止，应先完成或显式暂停任务。命令也会拒绝在共享服务尚未停止时升级。不要直接覆盖运行中的二进制。独立安装保留旧版本目录，允许停止服务后手动切回旧入口；数据格式升级后不能保证旧版本可读取新状态，升级前备份 `~/.areal`。

卸载先停止服务。Homebrew 用 `brew uninstall areal`；Linux 删除安装器管理的入口链接及选定版本目录。两种方式都不自动删除 `~/.areal` 的配置与历史。

符号链接入口先解析到真实版本目录，再定位 `libexec/areal`，适用于 Homebrew Cellar 和 Linux 版本化安装。

## 源码安装

运行 `make install` 构建 release 并安装完整 Runtime，默认前缀为 `/usr/local`。可用 `make install PREFIX="$HOME/.local"` 安装到用户目录，或用 `DESTDIR=/tmp/package` 暂存打包。搜索通过文件助手内置的 ripgrep Rust 库执行，无需单独安装 rg；命令行任务需要 rg 时仍须自行安装。
