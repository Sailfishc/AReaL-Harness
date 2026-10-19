//! 受管安装的前缀租约；服务启动与安装入口切换使用同一 flock。
use crate::storage;
use anyhow::{Context, Result, ensure};
use fs2::FileExt;
use std::{fs::File, path::Path};

pub const GUARD_VERSION: u32 = 1;

#[derive(Debug)]
pub struct Lease(File);

impl Drop for Lease {
    fn drop(&mut self) {
        // fork 后尚未 exec 的子进程可能临时共享描述符；它不能延长本作用域的租约。
        let _ = FileExt::unlock(&self.0);
    }
}

pub fn acquire(bin_dir: &Path) -> Result<Option<Lease>> {
    let bin_dir = bin_dir.canonicalize()?;
    let Some(version) = bin_dir.parent() else {
        return Ok(None);
    };
    let Some(versions) = version.parent() else {
        return Ok(None);
    };
    let Some(lib) = versions.parent() else {
        return Ok(None);
    };
    if bin_dir.file_name().is_none_or(|name| name != "bin")
        || versions.file_name().is_none_or(|name| name != "areal")
        || lib.file_name().is_none_or(|name| name != "lib")
    {
        return Ok(None);
    }
    let prefix = lib.parent().context("installation prefix missing")?;
    let lease = Lease(storage::open_private(
        &versions.join(".service.lock"),
        true,
    )?);
    FileExt::try_lock_shared(&lease.0).context(
        "installation switch in progress; retry the active installation after it finishes",
    )?;
    let entry = prefix.join("bin/areal");
    ensure!(
        entry.is_symlink() && entry.canonicalize()? == bin_dir.join("areal"),
        "inactive installer-managed version; use the active prefix/bin/areal entry"
    );
    Ok(Some(lease))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::symlink;

    fn managed(root: &Path, name: &str) -> std::path::PathBuf {
        let prefix = root.join(name);
        let bin = prefix.join("lib/areal/fixture/bin");
        std::fs::create_dir_all(&bin).unwrap();
        std::fs::write(bin.join("areal"), "fixture").unwrap();
        std::fs::create_dir_all(prefix.join("bin")).unwrap();
        symlink(bin.join("areal"), prefix.join("bin/areal")).unwrap();
        bin
    }

    #[test]
    fn shared_startup_and_running_leases_exclude_switch_before_any_registry_record() {
        let root = tempfile::tempdir().unwrap();
        let bin = managed(root.path(), "prefix");
        let first = acquire(&bin).unwrap().unwrap();
        let second = acquire(&bin).unwrap().unwrap();
        let switch = storage::open_private(&bin.join("../../.service.lock"), false).unwrap();
        assert!(switch.try_lock_exclusive().is_err());
        drop(first);
        assert!(switch.try_lock_exclusive().is_err());
        drop(second);
        switch.try_lock_exclusive().unwrap();
        assert!(
            acquire(&bin)
                .unwrap_err()
                .to_string()
                .contains("installation switch")
        );
        FileExt::unlock(&switch).unwrap();
        drop(switch);
        assert!(acquire(&bin).unwrap().is_some());
    }

    #[test]
    fn late_old_start_is_rejected_but_other_prefix_and_source_are_independent() {
        let root = tempfile::tempdir().unwrap();
        let old = managed(root.path(), "first");
        let other = managed(root.path(), "other");
        let prefix = root.path().join("first");
        let gate = storage::open_private(&prefix.join("lib/areal/.service.lock"), true).unwrap();
        gate.try_lock_exclusive().unwrap();
        assert!(acquire(&other).unwrap().is_some());
        let source = root.path().join("source/target/debug");
        std::fs::create_dir_all(&source).unwrap();
        assert!(acquire(&source).unwrap().is_none());
        let next = prefix.join("lib/areal/next/bin");
        std::fs::create_dir_all(&next).unwrap();
        std::fs::write(next.join("areal"), "next").unwrap();
        std::fs::remove_file(prefix.join("bin/areal")).unwrap();
        symlink(next.join("areal"), prefix.join("bin/areal")).unwrap();
        FileExt::unlock(&gate).unwrap();
        drop(gate);
        assert!(acquire(&old).unwrap_err().to_string().contains("inactive"));
        assert!(acquire(&next).unwrap().is_some());
    }
}
