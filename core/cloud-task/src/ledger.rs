use crate::{Manifest, Resource};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum BackendTarget {
    Docker { endpoint: String },
}
use anyhow::{Context, Result, ensure};
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    os::unix::fs::{OpenOptionsExt, PermissionsExt},
    path::{Path, PathBuf},
};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TaskInput {
    pub workspace: PathBuf,
    pub commit: String,
    pub image: String,
    pub backend: BackendTarget,
    pub model_name: String,
    pub max_output_tokens: u64,
    pub prompt: String,
    pub test_command: Option<String>,
    pub model_config: Option<PathBuf>,
    pub model_fingerprint: String,
    pub snapshot_sha256: String,
    pub max_seconds: u64,
    pub max_turns: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Phase {
    Accepted,
    Starting,
    Running,
    Collecting,
    SaveFailed,
    CleanupPending,
    Ready,
    CancelRequested,
    Cancelled,
    Failed,
    Unknown,
}
impl Phase {
    pub fn terminal(self) -> bool {
        matches!(self, Self::Ready | Self::Cancelled | Self::Failed)
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Event {
    pub task_id: String,
    pub sequence: u64,
    pub phase: Phase,
    pub message: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Task {
    pub schema_version: u32,
    pub id: String,
    pub request_id: String,
    pub input: TaskInput,
    pub phase: Phase,
    pub resource: Resource,
    pub sequence: u64,
    pub events: Vec<Event>,
    pub manifest: Option<Manifest>,
    pub exit_code: Option<i64>,
}
impl Task {
    pub fn event(&mut self, phase: Phase, message: impl Into<String>) {
        self.sequence += 1;
        self.phase = phase;
        self.events.push(Event {
            task_id: self.id.clone(),
            sequence: self.sequence,
            phase,
            message: message.into(),
        });
    }
    /// 过期或重复通知不改变新投影，事件不能跨任务应用。
    pub fn project(&mut self, event: &Event) -> bool {
        if event.task_id != self.id || event.sequence <= self.sequence {
            return false;
        }
        self.sequence = event.sequence;
        self.phase = event.phase;
        true
    }
}

#[derive(Clone)]
pub struct Store {
    root: PathBuf,
}
impl Store {
    pub fn open(root: &Path) -> Result<Self> {
        fs::create_dir_all(root)?;
        let root = root.canonicalize()?;
        fs::set_permissions(&root, fs::Permissions::from_mode(0o700))?;
        Ok(Self { root })
    }
    pub fn root(&self) -> &Path {
        &self.root
    }
    pub fn dir(&self, id: &str) -> Result<PathBuf> {
        let parsed = uuid::Uuid::parse_str(id).context("invalid task ID")?;
        ensure!(parsed.to_string() == id, "task ID must be canonical UUID");
        let dir = self.root.join(id);
        if dir.exists() {
            ensure!(
                fs::symlink_metadata(&dir)?.is_dir(),
                "task directory is not a directory"
            );
        }
        Ok(dir)
    }
    pub fn lock(&self, name: &str) -> Result<File> {
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .mode(0o600)
            .open(self.root.join(name))?;
        file.lock_exclusive()?;
        Ok(file)
    }
    pub fn worker_lock(&self, id: &str) -> Result<File> {
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .mode(0o600)
            .open(self.dir(id)?.join("worker.lock"))?;
        file.try_lock_exclusive()
            .context("task already has an active worker")?;
        Ok(file)
    }
    pub fn read(&self, id: &str) -> Result<Task> {
        let t: Task = serde_json::from_slice(&fs::read(self.dir(id)?.join("task.json"))?)?;
        ensure!(
            t.schema_version == 1 && t.id == id,
            "unsupported or mismatched task ledger"
        );
        Ok(t)
    }
    pub fn update(&self, id: &str, change: impl FnOnce(&mut Task) -> Result<()>) -> Result<Task> {
        let _lock = self.lock("ledger.lock")?;
        let mut task = self.read(id)?;
        change(&mut task)?;
        self.save(&task)?;
        Ok(task)
    }
    fn save(&self, task: &Task) -> Result<()> {
        atomic(
            &self.dir(&task.id)?.join("task.json"),
            &serde_json::to_vec_pretty(task)?,
        )
    }
    pub fn find_request(&self, request: &str) -> Result<Option<Task>> {
        for entry in fs::read_dir(&self.root)? {
            let name = entry?.file_name().to_string_lossy().into_owned();
            if uuid::Uuid::parse_str(&name).is_ok() && self.dir(&name)?.join("task.json").is_file()
            {
                let task = self.read(&name)?;
                if task.request_id == request {
                    return Ok(Some(task));
                }
            }
        }
        Ok(None)
    }
    pub fn accept(&self, request: &str, input: TaskInput, snapshot: &[u8]) -> Result<(Task, bool)> {
        ensure!(
            !request.is_empty() && request.len() <= 128,
            "request ID must contain 1–128 bytes"
        );
        ensure!(
            !self.root.starts_with(&input.workspace),
            "task ledger must be outside workspace"
        );
        let _lock = self.lock("ledger.lock")?;
        if let Some(task) = self.find_request(request)? {
            ensure!(
                task.input == input,
                "idempotency key reused with different input"
            );
            return Ok((task, false));
        }
        let id = uuid::Uuid::new_v4().to_string();
        fs::create_dir(self.dir(&id)?)?;
        atomic(&self.dir(&id)?.join("source.tar"), snapshot)?;
        let mut task = Task {
            schema_version: 1,
            id,
            request_id: request.into(),
            input,
            phase: Phase::Accepted,
            resource: Resource::Absent,
            sequence: 0,
            events: vec![],
            manifest: None,
            exit_code: None,
        };
        task.event(
            Phase::Accepted,
            "Committed source accepted; Docker on this Mac",
        );
        self.save(&task)?;
        Ok((task, true))
    }
    pub fn events(&self, id: &str, after: u64) -> Result<Vec<Event>> {
        Ok(self
            .read(id)?
            .events
            .into_iter()
            .filter(|e| e.sequence > after)
            .collect())
    }
}

pub(crate) fn atomic(path: &Path, bytes: &[u8]) -> Result<()> {
    let parent = path.parent().context("missing parent")?;
    let mut temp = tempfile::NamedTempFile::new_in(parent)?;
    temp.as_file()
        .set_permissions(fs::Permissions::from_mode(0o600))?;
    temp.write_all(bytes)?;
    temp.as_file().sync_all()?;
    temp.persist(path).map_err(|e| e.error)?;
    File::open(parent)?.sync_all()?;
    Ok(())
}
