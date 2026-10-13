use crate::{
    Backend, Phase, Resource, Store, artifacts, broker, docker, ledger::atomic, source::digest,
};
use anyhow::{Result, ensure};
use std::{
    fs,
    time::{Duration, Instant},
};

fn transition(store: &Store, id: &str, phase: Phase, message: &str) -> Result<()> {
    store.update(id, |t| {
        if t.phase != Phase::CancelRequested && !t.phase.terminal() {
            t.event(phase, message);
        }
        Ok(())
    })?;
    Ok(())
}
pub fn cancel(store: &Store, id: &str, backend: &impl Backend) -> Result<crate::Task> {
    store.update(id, |t| {
        if !t.phase.terminal() && t.phase != Phase::CancelRequested {
            t.event(
                Phase::CancelRequested,
                "Cancellation accepted; resource termination not yet confirmed",
            );
        }
        Ok(())
    })?;
    // 与 worker 共用执行锁；worker 在每次等待后观察取消，并完成实际清理。
    if let Ok(_worker) = store.worker_lock(id) {
        finish_cancel(store, id, backend)?;
    }
    store.read(id)
}
fn finish_cancel(store: &Store, id: &str, backend: &impl Backend) -> Result<()> {
    if store.read(id)?.phase != Phase::CancelRequested {
        return Ok(());
    }
    match backend.remove(id) {
        Ok(()) => {
            docker::remove_input(&store.dir(id)?.join("input"))?;
            store.update(id, |t| {
                t.resource = Resource::Absent;
                t.event(
                    Phase::Cancelled,
                    "Container and temporary volume removal confirmed",
                );
                Ok(())
            })?;
        }
        Err(error) => {
            store.update(id, |t| {
                t.resource = Resource::Unknown;
                t.event(
                    Phase::CancelRequested,
                    format!("Termination unconfirmed: {error:#}"),
                );
                Ok(())
            })?;
        }
    }
    Ok(())
}
pub fn collect(store: &Store, id: &str, backend: &impl Backend) -> Result<()> {
    let task = store.read(id)?;
    if task.phase == Phase::CancelRequested {
        return finish_cancel(store, id, backend);
    }
    ensure!(
        matches!(
            task.phase,
            Phase::Collecting | Phase::SaveFailed | Phase::CleanupPending
        ),
        "task is not awaiting result collection"
    );
    let result = (|| -> Result<()> {
        if let Some(manifest) = &task.manifest {
            artifacts::verify(&store.dir(id)?.join("artifacts"), manifest)?;
        } else {
            let bytes = backend.export(id)?;
            let manifest = artifacts::save(store, &task, &bytes)?;
            store.update(id, |t| {
                t.manifest = Some(manifest);
                if t.phase != Phase::CancelRequested {
                    t.event(
                        Phase::CleanupPending,
                        "All artifacts persisted and checksums verified",
                    );
                }
                Ok(())
            })?;
        }
        if store.read(id)?.phase == Phase::CancelRequested {
            return finish_cancel(store, id, backend);
        }
        backend.remove(id)?;
        docker::remove_input(&store.dir(id)?.join("input"))?;
        store.update(id, |t| {
            t.resource = Resource::Absent;
            if t.phase == Phase::CancelRequested {
                t.event(
                    Phase::Cancelled,
                    "Container and temporary volume removal confirmed",
                );
            } else {
                t.event(
                    Phase::Ready,
                    "Results ready; container and temporary volume removed",
                );
            }
            Ok(())
        })?;
        Ok(())
    })();
    if let Err(error) = result {
        store.update(id, |t| {
            if t.phase != Phase::CancelRequested {
                let phase = if t.manifest.is_some() {
                    t.resource = Resource::Unknown;
                    Phase::CleanupPending
                } else {
                    Phase::SaveFailed
                };
                t.event(phase, format!("Result collection needs retry: {error:#}"));
            }
            Ok(())
        })?;
    }
    Ok(())
}
fn fail_start(
    store: &Store,
    id: &str,
    backend: &impl Backend,
    error: &anyhow::Error,
) -> Result<()> {
    if store.read(id)?.phase == Phase::CancelRequested {
        return finish_cancel(store, id, backend);
    }
    match backend.remove(id) {
        Ok(()) => {
            docker::remove_input(&store.dir(id)?.join("input"))?;
            store.update(id, |t| {
                t.resource = Resource::Absent;
                t.event(
                    Phase::Failed,
                    format!("Startup failed; resources removed: {error:#}"),
                );
                Ok(())
            })?;
        }
        Err(cleanup) => {
            store.update(id, |t| {
                t.resource = Resource::Unknown;
                t.event(
                    Phase::Unknown,
                    format!("Startup/cleanup status unknown; no replay: {error:#}; {cleanup:#}"),
                );
                Ok(())
            })?;
        }
    }
    Ok(())
}
pub async fn execute(store: &Store, id: &str, backend: &impl Backend) -> Result<()> {
    let _worker = store.worker_lock(id)?;
    let task = store.read(id)?;
    if task.phase.terminal() {
        return Ok(());
    }
    if task.phase == Phase::CancelRequested {
        return finish_cancel(store, id, backend);
    }
    if matches!(
        task.phase,
        Phase::SaveFailed | Phase::Collecting | Phase::CleanupPending
    ) {
        return collect(store, id, backend);
    }
    // 重启只检查现有资源，绝不把不确定的 start 自动重放。
    if task.phase != Phase::Accepted {
        match backend.inspect(id) {
            Ok(Some(state)) if state.status == "exited" => {
                store.update(id, |t| {
                    t.exit_code = Some(state.exit_code);
                    t.event(
                        Phase::Collecting,
                        "Recovered stopped container; collecting without rerunning",
                    );
                    Ok(())
                })?;
                return collect(store, id, backend);
            }
            _ => {
                store.update(id, |t| { t.resource = Resource::Unknown; t.event(Phase::Unknown, "Worker continuity lost; execution not replayed. Inspect or cancel existing resource."); Ok(()) })?;
                return Ok(());
            }
        }
    }
    let input_dir = store.dir(id)?.join("input");
    let setup = async {
        let (inputs, model) = broker::model(&task.input.workspace, task.input.model_config.as_deref())?;
        ensure!(model.fingerprint() == task.input.model_fingerprint, "model configuration changed since plan; submit a new task");
        let broker = broker::Broker::start(&inputs, &model, task.input.max_turns + 4).await?;
        fs::create_dir(&input_dir)?;
        let source = fs::read(store.dir(id)?.join("source.tar"))?;
        ensure!(digest(&source) == task.input.snapshot_sha256, "source snapshot checksum mismatch");
        atomic(&input_dir.join("source.tar"), &source)?;
        atomic(&input_dir.join("model.toml"), broker.config.as_bytes())?;
        atomic(&input_dir.join("request.json"), &serde_json::to_vec(&serde_json::json!({"prompt":task.input.prompt,"testCommand":task.input.test_command,"maxSeconds":task.input.max_seconds,"maxTurns":task.input.max_turns,"proxyToken":broker.token}))?)?;
        // 容器用户只能读取副本；宿主目录本身保持 0700。
        use std::os::unix::fs::PermissionsExt;
        for file in fs::read_dir(&input_dir)? { fs::set_permissions(file?.path(), fs::Permissions::from_mode(0o644))?; }
        transition(store, id, Phase::Starting, "Creating isolated Docker container")?;
        if store.read(id)?.phase == Phase::CancelRequested { return Err(anyhow::anyhow!("cancelled before create")); }
        backend.create(id, &task.input.image)?;
        store.update(id, |t| { t.resource = Resource::Present; Ok(()) })?;
        backend.copy_input(id, &input_dir)?;
        if store.read(id)?.phase == Phase::CancelRequested { return Err(anyhow::anyhow!("cancelled before start")); }
        backend.start(id)?;
        transition(store, id, Phase::Running, "Rust Core/Runtime running in Docker; model credentials remain on host")?;
        Ok::<_, anyhow::Error>(broker)
    }.await;
    let broker = match setup {
        Ok(b) => b,
        Err(error) => {
            fail_start(store, id, backend, &error)?;
            return Ok(());
        }
    };
    let deadline = Instant::now() + Duration::from_secs(task.input.max_seconds + 30);
    loop {
        if store.read(id)?.phase == Phase::CancelRequested {
            drop(broker);
            return finish_cancel(store, id, backend);
        }
        if let Ok(messages) = backend.progress(id) {
            store.update(id, |t| {
                let seen = t
                    .events
                    .iter()
                    .filter(|e| e.message.starts_with("runner: "))
                    .count();
                if t.phase == Phase::Running {
                    for message in messages.into_iter().skip(seen) {
                        t.event(Phase::Running, message);
                    }
                }
                Ok(())
            })?;
        }
        match backend.inspect(id) {
            Ok(Some(state)) if state.status == "exited" => {
                store.update(id, |t| {
                    t.exit_code = Some(state.exit_code);
                    if t.phase != Phase::CancelRequested {
                        t.event(
                            Phase::Collecting,
                            "Execution stopped; saving diff, new files and test report",
                        );
                    }
                    Ok(())
                })?;
                return collect(store, id, backend);
            }
            Ok(Some(state)) if state.status == "running" => {}
            result => {
                let detail = match result {
                    Err(e) => format!("{e:#}"),
                    _ => "container missing or stopped unexpectedly".into(),
                };
                store.update(id, |t| {
                    if t.phase != Phase::CancelRequested {
                        t.resource = Resource::Unknown;
                        t.event(
                            Phase::Unknown,
                            format!("Execution status unknown; no replay: {detail}"),
                        );
                    }
                    Ok(())
                })?;
                return Ok(());
            }
        }
        if Instant::now() >= deadline {
            store.update(id, |t| {
                t.event(
                    Phase::CancelRequested,
                    "Execution deadline reached; terminating resource",
                );
                Ok(())
            })?;
            drop(broker);
            return finish_cancel(store, id, backend);
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
}
