use crate::TaskInput;
use anyhow::{Context, Result, ensure};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    path::{Component, Path},
    process::Command,
};

pub(crate) fn git(workspace: &Path, args: &[&str]) -> Result<Vec<u8>> {
    let output = Command::new("git")
        .arg("-C")
        .arg(workspace)
        .args([
            "-c",
            "core.hooksPath=/dev/null",
            "-c",
            "core.fsmonitor=false",
        ])
        .args(args)
        .output()?;
    ensure!(
        output.status.success(),
        "git operation failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    Ok(output.stdout)
}
pub(crate) fn clean(workspace: &Path) -> Result<()> {
    ensure!(
        git(
            workspace,
            &["status", "--porcelain=v1", "--untracked-files=all"]
        )?
        .is_empty(),
        "MVP requires committed code: commit or exclude local changes first; nothing uploaded"
    );
    Ok(())
}
pub(crate) fn safe_path(path: &str) -> Result<()> {
    ensure!(
        !path.is_empty()
            && !path.contains(['\\', '\0', '\n', '\r', '\t'])
            && Path::new(path)
                .components()
                .all(|c| matches!(c, Component::Normal(_))),
        "unsafe relative path"
    );
    let lower = path.to_lowercase();
    ensure!(
        !lower.split('/').any(|c| [
            ".git",
            ".aws",
            ".ssh",
            ".areal",
            ".codex",
            ".env",
            "credentials",
            "credentials.json",
            "id_rsa",
            "id_ed25519"
        ]
        .contains(&c)
            || c.starts_with(".env.")
            || c.ends_with(".pem")
            || c.ends_with(".key")),
        "sensitive path excluded from task snapshot"
    );
    Ok(())
}
pub(crate) fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub plan_hash: String,
    pub input: TaskInput,
    pub files: Vec<String>,
    pub bytes: usize,
    pub location: &'static str,
    pub limitation: &'static str,
    pub model_request_limit: usize,
}
pub fn prepare(mut input: TaskInput, revision: &str) -> Result<(Plan, Vec<u8>)> {
    input.workspace = input.workspace.canonicalize()?;
    ensure!(
        String::from_utf8(git(&input.workspace, &["rev-parse", "--show-toplevel"])?)?.trim()
            == input.workspace.to_string_lossy(),
        "workspace must be the repository root"
    );
    clean(&input.workspace)?;
    ensure!(!revision.starts_with('-'), "invalid revision");
    input.commit = String::from_utf8(git(
        &input.workspace,
        &["rev-parse", "--verify", &format!("{revision}^{{commit}}")],
    )?)?
    .trim()
    .into();
    ensure!(
        input.commit.len() == 40 || input.commit.len() == 64,
        "invalid commit"
    );
    let list = git(
        &input.workspace,
        &["ls-tree", "-rz", "--full-tree", &input.commit],
    )?;
    let mut files = Vec::new();
    for item in list.split(|b| *b == 0).filter(|v| !v.is_empty()) {
        let line = std::str::from_utf8(item)?;
        let (meta, path) = line.split_once('\t').context("invalid git tree")?;
        ensure!(
            meta.starts_with("100644 blob ") || meta.starts_with("100755 blob "),
            "symlinks and submodules are not supported in MVP"
        );
        safe_path(path)?;
        files.push(path.into());
    }
    let snapshot = git(
        &input.workspace,
        &["archive", "--format=tar", &input.commit],
    )?;
    ensure!(
        snapshot.len() <= 128 * 1024 * 1024,
        "snapshot exceeds 128 MiB"
    );
    // archive 会读取 export-ignore；拒绝静默省略，计划必须列出实际发送内容。
    let mut sent = Vec::new();
    for entry in tar::Archive::new(snapshot.as_slice()).entries()? {
        let entry = entry?;
        if entry.header().entry_type().is_file() {
            sent.push(
                entry
                    .path()?
                    .to_str()
                    .context("non-UTF8 archive path")?
                    .to_owned(),
            );
        } else {
            ensure!(
                entry.header().entry_type().is_dir()
                    || entry.header().entry_type().is_pax_global_extensions(),
                "unsupported archive entry"
            );
        }
    }
    files.sort();
    sent.sort();
    ensure!(
        files == sent,
        "git archive omits committed files; remove export-ignore before submission"
    );
    input.snapshot_sha256 = digest(&snapshot);
    let model_request_limit = input.max_turns + 4;
    let plan_hash = digest(&serde_json::to_vec(&input)?);
    let plan = Plan {
        plan_hash,
        input,
        files,
        bytes: snapshot.len(),
        location: "Local Docker on this Mac; isolated container with no host mounts",
        limitation: "Mac shutdown stops execution. Only committed source is sent. Review the complete file list before submit.",
        model_request_limit,
    };
    Ok((plan, snapshot))
}
