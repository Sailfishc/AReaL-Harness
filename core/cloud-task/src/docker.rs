use anyhow::{Context, Result, bail, ensure};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    path::Path,
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Resource {
    Absent,
    Present,
    Unknown,
}
#[derive(Clone, Debug)]
pub struct Inspection {
    pub status: String,
    pub exit_code: i64,
    pub volumes: Vec<String>,
}

/// 只有部署/资源差异进入 adapter；它不拥有模型循环或任务账本。
pub trait Backend {
    fn progress(&self, _id: &str) -> Result<Vec<String>> {
        Ok(vec![])
    }
    fn create(&self, id: &str, image: &str) -> Result<()>;
    fn copy_input(&self, id: &str, dir: &Path) -> Result<()>;
    fn start(&self, id: &str) -> Result<()>;
    fn inspect(&self, id: &str) -> Result<Option<Inspection>>;
    fn remove(&self, id: &str) -> Result<()>;
    fn export(&self, id: &str) -> Result<Vec<u8>>;
}
pub struct Docker {
    pub endpoint: String,
}
fn name(id: &str) -> String {
    format!("areal-cloud-{id}")
}
pub(crate) fn command(args: &[&str], seconds: u64) -> Result<std::process::Output> {
    use std::io::Read;
    let mut cmd = Command::new("docker");
    if args.first() == Some(&"--host") {
        cmd.env_remove("DOCKER_CONTEXT").env_remove("DOCKER_HOST");
    }
    let mut child = cmd
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .context("Docker CLI unavailable")?;
    let (send, receive) = std::sync::mpsc::channel();
    let out_send = send.clone();
    let stdout = child.stdout.take().unwrap();
    thread::spawn(move || {
        let mut bytes = Vec::new();
        let result = stdout
            .take(128 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map(|_| bytes);
        let _ = out_send.send((true, result));
    });
    let stderr = child.stderr.take().unwrap();
    thread::spawn(move || {
        let mut bytes = Vec::new();
        let result = stderr.take(65537).read_to_end(&mut bytes).map(|_| bytes);
        let _ = send.send((false, result));
    });
    let deadline = Instant::now() + Duration::from_secs(seconds);
    let mut out = None;
    let mut err = None;
    let mut status = None;
    loop {
        while let Ok((is_stdout, result)) = receive.try_recv() {
            let bytes = result?;
            if bytes.len() > if is_stdout { 128 * 1024 * 1024 } else { 65536 } {
                let _ = child.kill();
                let _ = child.wait();
                bail!("Docker output exceeded bounded capture; side-effect status may be unknown");
            }
            if is_stdout {
                out = Some(bytes);
            } else {
                err = Some(bytes);
            }
        }
        if status.is_none() {
            status = child.try_wait()?;
        }
        if status.is_some() && out.is_some() && err.is_some() {
            break;
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            bail!("Docker command timed out; side-effect status may be unknown");
        }
        thread::sleep(Duration::from_millis(20));
    }
    Ok(std::process::Output {
        status: status.unwrap(),
        stdout: out.unwrap(),
        stderr: err.unwrap(),
    })
}
impl Docker {
    pub fn at(endpoint: &str) -> Result<Self> {
        ensure!(
            endpoint.starts_with("unix:///") && !endpoint.contains(['\n', '\r']),
            "MVP only supports a local Unix Docker socket"
        );
        Ok(Self {
            endpoint: endpoint.into(),
        })
    }
    pub fn local() -> Result<Self> {
        if let Ok(endpoint) = std::env::var("DOCKER_HOST") {
            return Self::at(&endpoint);
        }
        let out = command(&["context", "inspect"], 15)?;
        ensure!(out.status.success(), "Docker context unavailable");
        let data: Value = serde_json::from_slice(&out.stdout)?;
        Self::at(
            data[0]["Endpoints"]["docker"]["Host"]
                .as_str()
                .context("missing Docker endpoint")?,
        )
    }
    fn run(&self, args: &[&str], seconds: u64) -> Result<std::process::Output> {
        let mut pinned = vec!["--host", self.endpoint.as_str()];
        pinned.extend_from_slice(args);
        command(&pinned, seconds)
    }
    fn checked(&self, args: &[&str]) -> Result<Vec<u8>> {
        let out = self.run(args, 30)?;
        ensure!(
            out.status.success(),
            "Docker command failed: {}",
            String::from_utf8_lossy(&out.stderr)
        );
        Ok(out.stdout)
    }
    pub fn image(&self, image: &str) -> Result<String> {
        ensure!(
            !image.is_empty() && !image.starts_with('-'),
            "invalid image"
        );
        let data: Value = serde_json::from_slice(&self.checked(&["image", "inspect", image])?)?;
        ensure!(
            data[0]["Config"]["Labels"]["io.areal.cloud-task.contract"] == "1",
            "select an explicitly built cloud-task OCI image; no image is pulled automatically"
        );
        ensure!(
            data[0]["Config"]["Volumes"]
                .as_object()
                .is_some_and(|v| v.len() == 1 && v.contains_key("/task")),
            "cloud-task image must declare only /task volume"
        );
        Ok(data[0]["Id"]
            .as_str()
            .context("missing image digest")?
            .into())
    }
}
impl Backend for Docker {
    fn progress(&self, id: &str) -> Result<Vec<String>> {
        let data = self.checked(&["logs", "--tail=16", &name(id)])?;
        Ok(String::from_utf8(data)?
            .lines()
            .filter_map(|line| {
                let value: Value = serde_json::from_str(line).ok()?;
                let stage = value["stage"].as_str()?;
                ["coreStarted", "coreFinished", "resultsPrepared"]
                    .contains(&stage)
                    .then(|| format!("runner: {line}"))
            })
            .collect())
    }
    fn create(&self, id: &str, image: &str) -> Result<()> {
        self.checked(&[
            "volume",
            "create",
            "--label",
            &format!("io.areal.cloud-task.id={id}"),
            &name(id),
        ])?;
        self.checked(&[
            "create",
            "--pull=never",
            "--name",
            &name(id),
            "--label",
            &format!("io.areal.cloud-task.id={id}"),
            "--mount",
            &format!("type=volume,source={},target=/task", name(id)),
            "--read-only",
            "--cap-drop=ALL",
            "--security-opt=no-new-privileges",
            "--pids-limit=128",
            "--memory=2g",
            "--cpus=2",
            "--user=65532:65532",
            "--init",
            "--tmpfs=/tmp:rw,nosuid,nodev,size=256m",
            "--env=HOME=/task/home",
            "--env=AREAL_HARNESS_HOME=/task/home/.areal",
            "--env=PYTHONDONTWRITEBYTECODE=1",
            "--log-opt=max-size=2m",
            "--log-opt=max-file=1",
            image,
        ])?;
        Ok(())
    }
    fn copy_input(&self, id: &str, dir: &Path) -> Result<()> {
        self.checked(&[
            "cp",
            &dir.display().to_string(),
            &format!("{}:/task/", name(id)),
        ])?;
        Ok(())
    }
    fn start(&self, id: &str) -> Result<()> {
        self.checked(&["start", &name(id)])?;
        Ok(())
    }
    fn inspect(&self, id: &str) -> Result<Option<Inspection>> {
        let out = self.run(&["container", "inspect", &name(id)], 15)?;
        if !out.status.success() {
            let error = String::from_utf8_lossy(&out.stderr);
            if error.contains("No such container") || error.contains("No such object") {
                return Ok(None);
            }
            bail!("Docker status unavailable: {error}");
        }
        let data: Value = serde_json::from_slice(&out.stdout)?;
        let c = &data[0];
        ensure!(
            c["Config"]["Labels"]["io.areal.cloud-task.id"] == id,
            "container belongs to another owner"
        );
        let mounts = c["Mounts"].as_array().context("missing container mounts")?;
        ensure!(
            mounts.len() == 1
                && mounts[0]["Type"] == "volume"
                && mounts[0]["Destination"] == "/task"
                && mounts[0]["Name"] == name(id),
            "unexpected container mounts"
        );
        Ok(Some(Inspection {
            status: c["State"]["Status"]
                .as_str()
                .context("invalid Docker state")?
                .into(),
            exit_code: c["State"]["ExitCode"]
                .as_i64()
                .context("missing exit code")?,
            volumes: vec![
                mounts[0]["Name"]
                    .as_str()
                    .context("missing volume name")?
                    .into(),
            ],
        }))
    }
    fn remove(&self, id: &str) -> Result<()> {
        if self.inspect(id)?.is_some() {
            self.checked(&["rm", "--force", &name(id)])?;
            ensure!(
                self.inspect(id)?.is_none(),
                "container removal not confirmed"
            );
        }
        let out = self.run(&["volume", "inspect", &name(id)], 15)?;
        if out.status.success() {
            let data: Value = serde_json::from_slice(&out.stdout)?;
            ensure!(
                data[0]["Labels"]["io.areal.cloud-task.id"] == id,
                "volume belongs to another owner"
            );
            self.checked(&["volume", "rm", &name(id)])?;
            let out = self.run(&["volume", "inspect", &name(id)], 15)?;
            ensure!(
                !out.status.success()
                    && String::from_utf8_lossy(&out.stderr).contains("no such volume"),
                "temporary volume removal not confirmed"
            );
        } else {
            ensure!(
                String::from_utf8_lossy(&out.stderr).contains("no such volume"),
                "temporary volume state unknown"
            );
        }
        Ok(())
    }
    fn export(&self, id: &str) -> Result<Vec<u8>> {
        let state = self
            .inspect(id)?
            .context("container missing before results saved")?;
        ensure!(
            state.status == "exited",
            "container must be stopped before export"
        );
        self.checked(&["cp", &format!("{}:/task/output/.", name(id)), "-"])
    }
}

pub(crate) fn remove_input(dir: &Path) -> Result<()> {
    if dir.exists() {
        fs::remove_dir_all(dir)?;
    }
    Ok(())
}
