use crate::{Docker, Phase, Store, TaskInput, artifacts, broker, prepare};
use anyhow::{Result, ensure};
use clap::{Args, Subcommand};
use std::{fs::OpenOptions, os::unix::fs::OpenOptionsExt, path::PathBuf, process::Stdio};

#[derive(Subcommand)]
pub enum Commands {
    /// 只读展示将发送的提交、完整文件清单、模型与本机 Docker 位置。
    Plan(Submission),
    /// 受理一个新任务；指定幂等键，相同输入重试返回原任务。
    Submit {
        #[command(flatten)]
        input: Submission,
        #[arg(long)]
        request_id: String,
        #[arg(long)]
        expected_plan: Option<String>,
    },
    /// 读取权威任务账本。
    Status { id: String },
    /// 当前工作区的持久任务；不启动执行。
    List {
        #[arg(long)]
        workspace: PathBuf,
    },
    /// 核对未知受理；不重新提交。
    Find {
        #[arg(long)]
        request_id: String,
    },
    /// 原子读取状态及指定游标后的事件。
    Inspect {
        id: String,
        #[arg(long, default_value_t = 0)]
        after: u64,
    },
    /// 校验后读取 Diff 和实际测试报告。
    Review { id: String },
    /// 补读事件；记录最后 sequence 后可以断线重连。
    Events {
        id: String,
        #[arg(long, default_value_t = 0)]
        after: u64,
        #[arg(long)]
        follow: bool,
    },
    /// 接受取消并核验容器/临时卷删除；pending 不表示已终止。
    Cancel { id: String },
    /// 重新检查已受理或未知的任务；未知 start 不重放。
    Reconcile { id: String },
    /// 只重试收集已停止容器的产物，不重跑模型。
    RetryResults { id: String },
    /// 校验并下载完整结果到新的目录。
    Results {
        id: String,
        #[arg(long)]
        output: PathBuf,
    },
    /// 用户审阅后显式应用；拒绝本地改动、不同 HEAD 和工作区。
    Apply {
        id: String,
        #[arg(long)]
        workspace: PathBuf,
    },
    #[command(hide = true)]
    Worker { id: String },
}
#[derive(Args)]
pub struct Options {
    /// 持久账本/产物目录；必须在代码工作区之外。
    #[arg(long)]
    pub store: PathBuf,
    #[command(subcommand)]
    pub command: Commands,
}
#[derive(Args)]
pub struct Submission {
    #[arg(long, default_value = ".")]
    pub workspace: PathBuf,
    #[arg(long, default_value = "HEAD")]
    pub revision: String,
    /// 已在本地构建的 cloud-task OCI 镜像；不会隐式 pull。
    #[arg(long)]
    pub image: String,
    #[arg(long)]
    pub prompt: String,
    /// 沿用现有模型配置；原始文件和凭据不会发送到容器。
    #[arg(long)]
    pub config: Option<PathBuf>,
    #[arg(long)]
    pub test_command: Option<String>,
    #[arg(long, default_value_t = 600)]
    pub max_seconds: u64,
    #[arg(long, default_value_t = 8)]
    pub max_turns: usize,
}
fn input(s: &Submission) -> Result<TaskInput> {
    ensure!(
        !s.prompt.trim().is_empty() && s.prompt.len() <= 32768,
        "prompt must contain 1–32768 bytes"
    );
    ensure!(
        s.test_command
            .as_ref()
            .is_none_or(|v| !v.trim().is_empty() && v.len() <= 8192),
        "invalid test command"
    );
    ensure!(
        (1..=3600).contains(&s.max_seconds) && (1..=64).contains(&s.max_turns),
        "invalid execution limits"
    );
    let workspace = s.workspace.canonicalize()?;
    let config = s.config.as_ref().map(|p| p.canonicalize()).transpose()?;
    let (_, model) = broker::model(&workspace, config.as_deref())?;
    let docker = Docker::local()?;
    Ok(TaskInput {
        workspace,
        commit: String::new(),
        image: docker.image(&s.image)?,
        backend: crate::BackendTarget::Docker {
            endpoint: docker.endpoint,
        },
        model_name: model.name.clone(),
        max_output_tokens: model.max_output_tokens.unwrap_or(4096),
        prompt: s.prompt.clone(),
        test_command: s.test_command.clone(),
        model_config: config,
        model_fingerprint: model.fingerprint(),
        snapshot_sha256: String::new(),
        max_seconds: s.max_seconds,
        max_turns: s.max_turns,
    })
}
async fn spawn(store: &Store, task: &crate::Task) -> Result<()> {
    let log = OpenOptions::new()
        .create(true)
        .append(true)
        .mode(0o600)
        .open(store.dir(&task.id)?.join("worker.log"))?;
    let (inputs, model) = broker::model(&task.input.workspace, task.input.model_config.as_deref())?;
    let mut cmd =
        areal_local_service::native_process::TrustedCommand::persistent(&std::env::current_exe()?)?;
    cmd.args(["cloud-task", "--store"])
        .arg(store.root())
        .args(["worker", &task.id])
        .stdin(Stdio::null())
        .stdout(log.try_clone()?)
        .stderr(log)
        .env_clear();
    for (name, value) in inputs.env {
        let key = name.to_string_lossy();
        if ["PATH", "HOME", "TMPDIR"].contains(&key.as_ref())
            || key.starts_with("AREAL_HARNESS_")
            || key.starts_with("AREAL_MODEL")
            || model.api_key_env.as_deref() == Some(key.as_ref())
            || areal_config::PROXY_ENV_VARS.contains(&key.as_ref())
        {
            cmd.env(name, value);
        }
    }
    cmd.spawn().await?;
    Ok(())
}
fn emit(value: &impl serde::Serialize) -> Result<()> {
    println!("{}", serde_json::to_string_pretty(value)?);
    Ok(())
}
fn task_backend(store: &Store, id: &str) -> Result<Docker> {
    match store.read(id)?.input.backend {
        crate::BackendTarget::Docker { endpoint } => Docker::at(&endpoint),
    }
}
fn task_view(task: &crate::Task) -> Result<serde_json::Value> {
    let mut value = serde_json::to_value(task)?;
    value["resultsAvailable"] = serde_json::json!(task.manifest.is_some());
    value["cleanupConfirmed"] =
        serde_json::json!(task.resource == crate::Resource::Absent && task.phase.terminal());
    Ok(value)
}
fn emit_task(task: &crate::Task) -> Result<()> {
    emit(&task_view(task)?)
}
pub async fn run(options: Options) -> Result<()> {
    let store = Store::open(&options.store)?;
    match options.command {
        Commands::Plan(s) => {
            let (plan, _) = prepare(input(&s)?, &s.revision)?;
            emit(&plan)?;
        }
        Commands::Submit {
            input: s,
            request_id,
            expected_plan,
        } => {
            let mut input = input(&s)?;
            // 受理重试先返回原记录；工作区后续修改不触发再次上传。
            if let Some(old) = store.find_request(&request_id)? {
                input.commit = String::from_utf8(crate::source::git(
                    &input.workspace,
                    &[
                        "rev-parse",
                        "--verify",
                        &format!("{}^{{commit}}", s.revision),
                    ],
                )?)?
                .trim()
                .into();
                input.snapshot_sha256 = old.input.snapshot_sha256.clone();
                ensure!(
                    old.input == input,
                    "idempotency key reused with different input"
                );
                ensure!(
                    expected_plan.as_ref().is_none_or(|hash| *hash
                        == crate::source::digest(&serde_json::to_vec(&old.input).unwrap())),
                    "发送计划已变化，请重新预览"
                );
                if old.phase == Phase::Accepted {
                    spawn(&store, &old).await?;
                }
                emit_task(&old)?;
            } else {
                let (plan, snapshot) = prepare(input, &s.revision)?;
                ensure!(
                    expected_plan
                        .as_ref()
                        .is_none_or(|hash| *hash == plan.plan_hash),
                    "发送计划已变化，请重新预览"
                );
                let (task, fresh) = store.accept(&request_id, plan.input, &snapshot)?;
                if fresh {
                    spawn(&store, &task).await?;
                }
                emit_task(&task)?;
            }
        }
        Commands::Status { id } => emit_task(&store.read(&id)?)?,
        Commands::List { workspace } => {
            let workspace = workspace.canonicalize()?;
            let tasks = store
                .list()?
                .into_iter()
                .filter(|t| t.input.workspace == workspace)
                .map(|t| task_view(&t))
                .collect::<Result<Vec<_>>>()?;
            emit(&tasks)?;
        }
        Commands::Find { request_id } => emit(
            &store
                .find_request(&request_id)?
                .map(|t| task_view(&t))
                .transpose()?,
        )?,
        Commands::Inspect { id, after } => {
            let task = store.read(&id)?;
            let events = task
                .events
                .iter()
                .filter(|e| e.sequence > after)
                .collect::<Vec<_>>();
            emit(&serde_json::json!({"task":task_view(&task)?,"events":events}))?;
        }
        Commands::Review { id } => emit(&artifacts::review(&store, &id)?)?,
        Commands::Events {
            id,
            mut after,
            follow,
        } => loop {
            for event in store.events(&id, after)? {
                println!("{}", serde_json::to_string(&event)?);
                after = event.sequence;
            }
            if !follow || store.read(&id)?.phase.terminal() {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(250)).await;
        },
        Commands::Cancel { id } => {
            emit_task(&crate::cancel(&store, &id, &task_backend(&store, &id)?)?)?
        }
        Commands::Reconcile { id } => {
            crate::execute(&store, &id, &task_backend(&store, &id)?).await?;
            emit_task(&store.read(&id)?)?;
        }
        Commands::RetryResults { id } => {
            let _lock = store.worker_lock(&id)?;
            crate::collect(&store, &id, &task_backend(&store, &id)?)?;
            emit_task(&store.read(&id)?)?;
        }
        Commands::Results { id, output } => {
            artifacts::download(&store, &id, &output)?;
            emit(&serde_json::json!({"verified":true,"output":output}))?;
        }
        Commands::Apply { id, workspace } => {
            artifacts::apply(&store, &id, &workspace)?;
            emit(&serde_json::json!({"applied":true,"workspace":workspace}))?;
        }
        Commands::Worker { id } => {
            crate::execute(&store, &id, &task_backend(&store, &id)?).await?;
        }
    }
    Ok(())
}
