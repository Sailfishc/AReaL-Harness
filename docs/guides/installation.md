**中文** | [English](installation.en.md)

# 安装与升级

安装包发布到 GitHub Release 后，使用本页命令。发布前只可下载 `Release bundles` workflow 的候选产物进行验收，不能把尚未发布的版本或 tap 当作可用安装源。

## 平台与组成

| 平台 | 分发方式 | 前置条件 |
|---|---|---|
| macOS arm64 | Homebrew tap 中的 `areal` formula | macOS 15+、Xcode Command Line Tools（含系统 Python） |
| Linux x86_64 | 完整 tar.gz + Python 安装器 | Ubuntu 22.04 或更新的兼容 glibc 2.35+ 系统、`/usr/bin/python3` 3.9+；不支持 musl |

只验证上述架构，不提供 Windows、macOS Intel 或 Linux arm64 包。每个包包含 `bin/areal`、`libexec/areal/{areal-runtime,areal-runtime-fs,tools/rg}`、工具许可证、LICENSE 和文件 SHA256 manifest；不要只复制 `areal`。安装后无需 Rust/Cargo，运行自定义 Node/Python 工具仍需对应解释器。

macOS 包采用 ad-hoc 签名，尚无 Developer ID 签名和公证。Linux 默认 YOLO/full-access 以当前用户权限运行；受限/只读 Scope 需要 `/usr/bin/bwrap` 及可用 user namespace。Ubuntu 可安装 `bubblewrap`；系统禁用 user namespace 或 AppArmor 拒绝时，受限操作会失败，不自动放宽权限。完整边界见 [Runtime 部署](runtime.md)。

## Homebrew（macOS）

维护者将 release 生成的 `areal.rb` 发布到 `areal-project/homebrew-tap` 后：

```sh
xcode-select --install  # 已有 Command Line Tools 时无需重复
brew tap areal-project/tap
brew install areal-project/tap/areal
areal --version
brew test areal-project/tap/areal
```

tap 由维护者发布，首版发布前该安装源可能尚不存在。Formula 使用最终归档的 SHA256，下载完整预编译包，不在安装机编译 Rust。没有注册 brew services；共享服务由 `areal service` 管理。

## Linux

从同一 Release 下载安装器和清单，校验后执行。固定版本避免在未知版本之间静默升级：

```sh
version=0.1.0
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

默认安装到 `~/.local/lib/areal/<version>-linux-x86_64`，入口为 `~/.local/bin/areal` 符号链接。`--prefix /absolute/path` 可选择有写权限的其他目录；不会自动 sudo 或修改 shell 配置。指定目录中已有非安装器管理的 `bin/areal` 时拒绝覆盖，同版本目录存在时拒绝覆盖。

离线安装先下载平台 tar.gz 与同一 Release 的 SHA256SUMS：

```sh
python3 install.py --version 0.1.0 --prefix "$HOME/.local" \
  --archive areal-harness-v0.1.0-x86_64-unknown-linux-gnu.tar.gz \
  --checksums SHA256SUMS
```

安装器在执行任何包内程序前校验归档和全部文件，拒绝链接、设备和路径逃逸归档。SHA256 校验提供与发布清单的一致性，不替代发布源的身份验证。

## 配置、升级与卸载

按[配置指南](configuration.md)在 `~/.areal/config.toml` 配置模型，然后在工作区启动 `areal`。旧配置必须删除已移除的 `limits.turn_timeout_seconds` 和 `AREAL_HARNESS_TURN_TIMEOUT_SECONDS`。`areal config validate` 可检查配置。旧 `~/.areal-harness` 不会自动迁移。

升级前用 `areal service list` 检查服务，在各工作区执行 `areal service stop --workspace /absolute/workspace`；忙碌任务默认拒绝停止，应先完成或显式暂停任务。Homebrew 用 `brew upgrade areal-project/tap/areal`；Linux 用新版本的安装命令。不要直接覆盖运行中的二进制。Linux 旧版本目录保留，停止服务后可将入口链接切回旧版本；数据格式升级后不能保证旧版本可读取新状态，升级前备份 `~/.areal`。

卸载先停止服务。Homebrew 用 `brew uninstall areal`；Linux 删除安装器管理的入口链接及选定版本目录。两种方式都不自动删除 `~/.areal` 的配置与历史。

符号链接入口先解析到真实版本目录，再定位 `libexec/areal`，适用于 Homebrew Cellar 和 Linux 版本化安装。
