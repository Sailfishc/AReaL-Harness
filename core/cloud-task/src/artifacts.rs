use crate::{
    Store, Task,
    source::{clean, digest, git, safe_path},
};
use anyhow::{Context, Result, ensure};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File},
    io::Read,
    path::Path,
};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Artifact {
    pub path: String,
    pub bytes: u64,
    pub sha256: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Manifest {
    pub schema_version: u32,
    pub files: Vec<Artifact>,
}

pub(crate) fn save(store: &Store, task: &Task, bytes: &[u8]) -> Result<Manifest> {
    let dir = store.dir(&task.id)?;
    let stage = tempfile::tempdir_in(&dir)?;
    let mut files = Vec::new();
    for entry in tar::Archive::new(bytes).entries()? {
        let mut entry = entry?;
        if entry.header().entry_type().is_dir() {
            continue;
        }
        ensure!(
            entry.header().entry_type().is_file(),
            "artifact links/devices are forbidden"
        );
        let path = entry
            .path()?
            .to_str()
            .context("non-UTF8 artifact path")?
            .trim_start_matches("./")
            .to_owned();
        safe_path(&path)?;
        ensure!(
            [
                "changes.patch",
                "new-files.json",
                "test-report.json",
                "agent.jsonl"
            ]
            .contains(&path.as_str())
                || path.starts_with("new/"),
            "unexpected artifact path"
        );
        ensure!(
            !files.iter().any(|f: &Artifact| f.path == path),
            "duplicate artifact path"
        );
        ensure!(entry.size() <= 32 * 1024 * 1024, "artifact exceeds 32 MiB");
        let mut contents = Vec::new();
        entry.read_to_end(&mut contents)?;
        let dest = stage.path().join(&path);
        fs::create_dir_all(dest.parent().unwrap())?;
        crate::ledger::atomic(&dest, &contents)?;
        files.push(Artifact {
            path,
            bytes: contents.len() as u64,
            sha256: digest(&contents),
        });
    }
    for name in [
        "changes.patch",
        "new-files.json",
        "test-report.json",
        "agent.jsonl",
    ] {
        ensure!(
            files.iter().any(|f| f.path == name),
            "incomplete result bundle: missing {name}"
        );
    }
    // 测试报告来自实际验证命令；非零退出也作为可审阅产物保留。
    let _: serde_json::Value =
        serde_json::from_slice(&fs::read(stage.path().join("test-report.json"))?)?;
    let new: Vec<String> = serde_json::from_slice(&fs::read(stage.path().join("new-files.json"))?)?;
    for path in &new {
        safe_path(path)?;
        ensure!(
            files.iter().any(|f| f.path == format!("new/{path}")),
            "new file missing from bundle"
        );
    }
    ensure!(
        files.iter().filter(|f| f.path.starts_with("new/")).count() == new.len(),
        "new-file inventory mismatch"
    );
    files.sort_by(|a, b| a.path.cmp(&b.path));
    let manifest = Manifest {
        schema_version: 1,
        files,
    };
    verify(stage.path(), &manifest)?;
    crate::ledger::atomic(
        &stage.path().join("manifest.json"),
        &serde_json::to_vec_pretty(&manifest)?,
    )?;
    let dest = dir.join("artifacts");
    if dest.exists() {
        let old: Manifest = serde_json::from_slice(&fs::read(dest.join("manifest.json"))?)?;
        verify(&dest, &old)?;
        ensure!(
            serde_json::to_vec(&old)? == serde_json::to_vec(&manifest)?,
            "existing artifact publication differs"
        );
    } else {
        fs::rename(stage.path(), &dest)?;
        File::open(&dir)?.sync_all()?;
    }
    Ok(manifest)
}
pub fn verify(dir: &Path, manifest: &Manifest) -> Result<()> {
    ensure!(
        manifest.schema_version == 1,
        "unsupported artifact manifest"
    );
    for file in &manifest.files {
        safe_path(&file.path)?;
        let path = dir.join(&file.path);
        ensure!(
            fs::symlink_metadata(&path)?.is_file(),
            "artifact is not a regular file"
        );
        ensure!(
            path.canonicalize()?.starts_with(dir.canonicalize()?),
            "artifact escaped result directory"
        );
        let bytes = fs::read(&path)?;
        ensure!(
            bytes.len() as u64 == file.bytes && digest(&bytes) == file.sha256,
            "artifact checksum mismatch: {}",
            file.path
        );
    }
    Ok(())
}
pub fn review(store: &Store, id: &str) -> Result<serde_json::Value> {
    let task = store.read(id)?;
    let manifest = task.manifest.context("results have not been saved")?;
    let dir = store.dir(id)?.join("artifacts");
    verify(&dir, &manifest)?;
    ensure!(
        fs::metadata(dir.join("changes.patch"))?.len() <= 1024 * 1024,
        "Diff 超过 1 MiB，请下载结果后审阅"
    );
    let diff = fs::read_to_string(dir.join("changes.patch"))?;
    let new_files: Vec<String> = serde_json::from_slice(&fs::read(dir.join("new-files.json"))?)?;
    let report: serde_json::Value =
        serde_json::from_slice(&fs::read(dir.join("test-report.json"))?)?;
    Ok(
        serde_json::json!({"taskId":id,"verified":true,"diff":diff,"newFiles":new_files,"testReport":report,"manifest":manifest}),
    )
}
pub fn download(store: &Store, id: &str, dest: &Path) -> Result<()> {
    let task = store.read(id)?;
    let manifest = task.manifest.context("missing manifest")?;
    let src = store.dir(id)?.join("artifacts");
    verify(&src, &manifest)?;
    ensure!(
        !dest.exists(),
        "download destination already exists; no files overwritten"
    );
    let parent = dest.parent().context("missing download parent")?;
    fs::create_dir_all(parent)?;
    let stage = tempfile::tempdir_in(parent)?;
    for file in &manifest.files {
        let path = stage.path().join(&file.path);
        fs::create_dir_all(path.parent().unwrap())?;
        fs::copy(src.join(&file.path), path)?;
    }
    crate::ledger::atomic(
        &stage.path().join("manifest.json"),
        &serde_json::to_vec_pretty(&manifest)?,
    )?;
    verify(stage.path(), &manifest)?;
    fs::rename(stage.path(), dest)?;
    File::open(parent)?.sync_all()?;
    Ok(())
}
pub fn apply(store: &Store, id: &str, workspace: &Path) -> Result<()> {
    let task = store.read(id)?;
    ensure!(task.manifest.is_some(), "results have not been saved");
    let workspace = workspace.canonicalize()?;
    ensure!(
        workspace == task.input.workspace,
        "task belongs to another workspace"
    );
    clean(&workspace)?;
    ensure!(
        String::from_utf8(git(&workspace, &["rev-parse", "HEAD"])?)?.trim() == task.input.commit,
        "local HEAD differs from source commit; review and apply manually"
    );
    let src = store.dir(id)?.join("artifacts");
    verify(&src, task.manifest.as_ref().context("missing manifest")?)?;
    let patch = src.join("changes.patch");
    if fs::metadata(&patch)?.len() == 0 {
        return Ok(());
    }
    let patch_bytes = fs::read(&patch)?;
    let patch_text = std::str::from_utf8(&patch_bytes).context("non-UTF8 Git patch")?;
    ensure!(
        !patch_text.lines().any(|line| (line.starts_with("new mode ")
            || line.starts_with("new file mode "))
            && (line.ends_with(" 120000") || line.ends_with(" 160000"))),
        "MVP cannot apply symlinks/submodules; review manually"
    );
    let path = patch.to_str().context("non-UTF8 patch path")?;
    let paths = git(&workspace, &["apply", "--numstat", "-z", path])?;
    for row in paths.split(|b| *b == 0).filter(|v| !v.is_empty()) {
        let name = row.splitn(3, |b| *b == b'\t').nth(2).unwrap_or(row);
        if !name.is_empty() {
            safe_path(std::str::from_utf8(name)?)?;
        }
    }
    // Git 自身拒绝越界/.git 路径；先检查完整 patch，才执行用户显式申请的应用。
    git(&workspace, &["apply", "--check", path])?;
    clean(&workspace)?;
    git(&workspace, &["apply", path])?;
    Ok(())
}
