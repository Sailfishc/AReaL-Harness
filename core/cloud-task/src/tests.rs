use super::*;
use anyhow::{Result, bail};
use std::{
    cell::{Cell, RefCell},
    fs,
    path::Path,
    sync::Arc,
};

fn input(workspace: &Path) -> TaskInput {
    TaskInput {
        workspace: workspace.into(),
        commit: "a".repeat(40),
        image: "sha256:test".into(),
        backend: BackendTarget::Docker {
            endpoint: "unix:///test/docker.sock".into(),
        },
        model_name: "fixture".into(),
        max_output_tokens: 4096,
        prompt: "change code".into(),
        test_command: Some("true".into()),
        model_config: None,
        model_fingerprint: "test".into(),
        snapshot_sha256: source::digest(b"source"),
        max_seconds: 60,
        max_turns: 4,
    }
}
fn setup() -> (tempfile::TempDir, Store, Task) {
    let root = tempfile::tempdir().unwrap();
    let workspace = root.path().join("workspace");
    fs::create_dir(&workspace).unwrap();
    let store = Store::open(&root.path().join("ledger")).unwrap();
    let (task, _) = store.accept("once", input(&workspace), b"source").unwrap();
    (root, store, task)
}
fn bundle(extra: Option<(&str, &[u8])>) -> Vec<u8> {
    let mut tar = tar::Builder::new(Vec::new());
    for (path, bytes) in [
        ("changes.patch", b"".as_slice()),
        ("new-files.json", b"[\"hello.txt\"]"),
        (
            "test-report.json",
            b"{\"agentExitCode\":0,\"testExitCode\":0}",
        ),
        ("agent.jsonl", b"{\"result\":\"done\"}"),
        ("new/hello.txt", b"hello"),
    ] {
        let mut h = tar::Header::new_gnu();
        h.set_size(bytes.len() as u64);
        h.set_mode(0o600);
        h.set_cksum();
        tar.append_data(&mut h, path, bytes).unwrap();
    }
    if let Some((path, bytes)) = extra {
        let mut h = tar::Header::new_gnu();
        h.set_size(bytes.len() as u64);
        h.set_mode(0o600);
        h.set_cksum();
        tar.append_data(&mut h, path, bytes).unwrap();
    }
    tar.into_inner().unwrap()
}
struct Fixture {
    state: RefCell<Option<docker::Inspection>>,
    data: Vec<u8>,
    export_fail: Cell<bool>,
    remove_fail: Cell<bool>,
    creates: Cell<usize>,
    starts: Cell<usize>,
}
impl Fixture {
    fn new() -> Self {
        Self {
            state: RefCell::new(Some(docker::Inspection {
                status: "exited".into(),
                exit_code: 0,
                volumes: vec!["test-volume".into()],
            })),
            data: bundle(None),
            export_fail: Cell::new(false),
            remove_fail: Cell::new(false),
            creates: Cell::new(0),
            starts: Cell::new(0),
        }
    }
}
impl Backend for Fixture {
    fn create(&self, _: &str, _: &str) -> Result<()> {
        self.creates.set(self.creates.get() + 1);
        bail!("injected create failure")
    }
    fn copy_input(&self, _: &str, _: &Path) -> Result<()> {
        Ok(())
    }
    fn start(&self, _: &str) -> Result<()> {
        self.starts.set(self.starts.get() + 1);
        Ok(())
    }
    fn inspect(&self, _: &str) -> Result<Option<docker::Inspection>> {
        Ok(self.state.borrow().clone())
    }
    fn remove(&self, _: &str) -> Result<()> {
        if self.remove_fail.get() {
            bail!("injected cleanup uncertainty");
        }
        self.state.replace(None);
        Ok(())
    }
    fn export(&self, _: &str) -> Result<Vec<u8>> {
        if self.export_fail.get() {
            bail!("injected save failure");
        }
        Ok(self.data.clone())
    }
}

#[test]
fn concurrent_submission_is_durable_and_conflicting_key_rejected() {
    let (_root, store, task) = setup();
    let shared = Arc::new(store.clone());
    let handles: Vec<_> = (0..8)
        .map(|_| {
            let s = shared.clone();
            let i = task.input.clone();
            std::thread::spawn(move || s.accept("once", i, b"source").unwrap())
        })
        .collect();
    for handle in handles {
        let (retry, fresh) = handle.join().unwrap();
        assert_eq!(retry.id, task.id);
        assert!(!fresh);
    }
    let mut other = task.input;
    other.prompt = "different".into();
    assert!(store.accept("once", other, b"source").is_err());
    assert_eq!(
        fs::read_dir(store.root())
            .unwrap()
            .filter(|e| e.as_ref().unwrap().file_type().unwrap().is_dir())
            .count(),
        1
    );
    let reopened = Store::open(store.root()).unwrap();
    assert_eq!(reopened.read(&task.id).unwrap().sequence, 1);
}
#[test]
fn reconnect_reads_missing_events_and_projection_ignores_duplicates_and_other_task() {
    let (_root, store, task) = setup();
    store
        .update(&task.id, |t| {
            t.event(Phase::Starting, "start");
            t.event(Phase::Running, "run");
            Ok(())
        })
        .unwrap();
    let events = Store::open(store.root())
        .unwrap()
        .events(&task.id, 1)
        .unwrap();
    assert_eq!(events.len(), 2);
    let mut view = task;
    assert!(view.project(&events[1]));
    assert!(!view.project(&events[0]));
    assert!(!view.project(&events[1]));
    let mut foreign = events[1].clone();
    foreign.task_id = uuid::Uuid::new_v4().to_string();
    foreign.sequence = 100;
    assert!(!view.project(&foreign));
    assert_eq!(view.phase, Phase::Running);
}
#[test]
fn failed_export_retains_resource_then_retry_verifies_download_and_cleans() {
    let (root, store, task) = setup();
    let backend = Fixture::new();
    backend.export_fail.set(true);
    store
        .update(&task.id, |t| {
            t.resource = Resource::Present;
            t.event(Phase::Collecting, "stop");
            Ok(())
        })
        .unwrap();
    collect(&store, &task.id, &backend).unwrap();
    assert_eq!(store.read(&task.id).unwrap().phase, Phase::SaveFailed);
    assert!(backend.state.borrow().is_some());
    backend.export_fail.set(false);
    collect(&store, &task.id, &backend).unwrap();
    let ready = store.read(&task.id).unwrap();
    assert_eq!(ready.phase, Phase::Ready);
    assert_eq!(ready.resource, Resource::Absent);
    assert_eq!(backend.starts.get(), 0);
    let dest = root.path().join("download");
    artifacts::download(&store, &task.id, &dest).unwrap();
    assert_eq!(fs::read(dest.join("new/hello.txt")).unwrap(), b"hello");
    assert!(artifacts::download(&store, &task.id, &dest).is_err());
    fs::write(
        store.dir(&task.id).unwrap().join("artifacts/new/hello.txt"),
        b"corrupt",
    )
    .unwrap();
    assert!(artifacts::download(&store, &task.id, &root.path().join("corrupt")).is_err());
    assert!(!root.path().join("corrupt").exists());
}
#[test]
fn save_failure_and_cleanup_failure_never_claim_ready() {
    let (_root, store, task) = setup();
    let mut backend = Fixture::new();
    backend.data = bundle(Some(("new/hello.txt", b"duplicate")));
    store
        .update(&task.id, |t| {
            t.event(Phase::Collecting, "stop");
            Ok(())
        })
        .unwrap();
    collect(&store, &task.id, &backend).unwrap();
    assert_eq!(store.read(&task.id).unwrap().phase, Phase::SaveFailed);
    assert!(!store.dir(&task.id).unwrap().join("artifacts").exists());
    backend.data = bundle(None);
    backend.remove_fail.set(true);
    collect(&store, &task.id, &backend).unwrap();
    assert_eq!(store.read(&task.id).unwrap().phase, Phase::CleanupPending);
    let downloaded = store.root().join("available-before-cleanup");
    artifacts::download(&store, &task.id, &downloaded).unwrap();
    assert_eq!(
        fs::read(downloaded.join("new/hello.txt")).unwrap(),
        b"hello"
    );
    backend.remove_fail.set(false);
    collect(&store, &task.id, &backend).unwrap();
    assert_eq!(store.read(&task.id).unwrap().phase, Phase::Ready);
}
#[test]
fn cancel_pending_requires_actual_cleanup_confirmation_and_is_idempotent() {
    let (_root, store, task) = setup();
    let backend = Fixture::new();
    backend.remove_fail.set(true);
    assert_eq!(
        cancel(&store, &task.id, &backend).unwrap().phase,
        Phase::CancelRequested
    );
    assert!(backend.state.borrow().is_some());
    backend.remove_fail.set(false);
    let done = cancel(&store, &task.id, &backend).unwrap();
    assert_eq!(done.phase, Phase::Cancelled);
    assert_eq!(done.resource, Resource::Absent);
    assert_eq!(
        cancel(&store, &task.id, &backend).unwrap().sequence,
        done.sequence
    );
}
#[tokio::test]
async fn uncertain_start_is_not_replayed() {
    let (_root, store, task) = setup();
    let backend = Fixture::new();
    backend.state.borrow_mut().as_mut().unwrap().status = "running".into();
    store
        .update(&task.id, |t| {
            t.event(Phase::Starting, "start intent persisted");
            Ok(())
        })
        .unwrap();
    execute(&store, &task.id, &backend).await.unwrap();
    assert_eq!(store.read(&task.id).unwrap().phase, Phase::Unknown);
    assert_eq!(backend.creates.get(), 0);
    assert_eq!(backend.starts.get(), 0);
    cancel(&store, &task.id, &backend).unwrap();
    assert!(backend.state.borrow().is_none());
}
#[tokio::test]
async fn startup_failure_is_persisted_and_resource_is_cleaned() {
    let (root, store, task) = setup();
    let config = root.path().join("model.toml");
    fs::write(&config,"schema_version=1\n[model]\nname='fixture'\n[model.providers.default]\nendpoint='http://127.0.0.1:9/model'\nprotocol='chat-completions'\n").unwrap();
    let (_, model) = broker::model(&task.input.workspace, Some(&config)).unwrap();
    store
        .update(&task.id, |t| {
            t.input.model_config = Some(config);
            t.input.model_fingerprint = model.fingerprint();
            Ok(())
        })
        .unwrap();
    let backend = Fixture::new();
    execute(&store, &task.id, &backend).await.unwrap();
    let failed = store.read(&task.id).unwrap();
    assert_eq!(failed.phase, Phase::Failed);
    assert_eq!(failed.resource, Resource::Absent);
    assert_eq!(backend.creates.get(), 1);
    assert_eq!(backend.starts.get(), 0);
}
#[test]
fn task_and_artifact_paths_are_isolated() {
    let (_root, store, task) = setup();
    assert!(store.read("../escape").is_err());
    for path in [
        "../escape",
        "/absolute",
        ".git/config",
        ".aws/credentials",
        ".env",
        "folder/id_rsa",
        "folder/key.pem",
        "a\\b",
    ] {
        assert!(source::safe_path(path).is_err(), "{path}");
    }
    let second = store
        .accept("second", task.input.clone(), b"source")
        .unwrap()
        .0;
    assert_ne!(task.id, second.id);
    let mut tar = tar::Builder::new(Vec::new());
    let mut header = tar::Header::new_gnu();
    header.set_entry_type(tar::EntryType::Symlink);
    header.set_size(0);
    header.set_mode(0o777);
    header.set_link_name("/tmp/escape").unwrap();
    header.set_cksum();
    tar.append_data(&mut header, "new/link", &b""[..]).unwrap();
    assert!(artifacts::save(&store, &task, &tar.into_inner().unwrap()).is_err());
}
fn repository(dir: &Path) -> String {
    fs::create_dir(dir).unwrap();
    source::git(dir, &["init", "-q"]).unwrap();
    fs::write(dir.join("code.txt"), "before\n").unwrap();
    source::git(dir, &["add", "."]).unwrap();
    source::git(
        dir,
        &[
            "-c",
            "user.name=Test",
            "-c",
            "user.email=test@localhost",
            "commit",
            "-qm",
            "source",
        ],
    )
    .unwrap();
    String::from_utf8(source::git(dir, &["rev-parse", "HEAD"]).unwrap())
        .unwrap()
        .trim()
        .into()
}
#[test]
fn source_is_committed_only_and_apply_rejects_local_conflicts() {
    let root = tempfile::tempdir().unwrap();
    let repo = root.path().join("repo");
    let sha = repository(&repo);
    let mut i = input(&repo);
    i.commit = sha;
    let (plan, bytes) = prepare(i.clone(), "HEAD").unwrap();
    assert_eq!(plan.files, vec!["code.txt"]);
    assert!(!bytes.is_empty());
    fs::write(repo.join("code.txt"), "local\n").unwrap();
    assert!(prepare(i, "HEAD").is_err());
    let store = Store::open(&root.path().join("ledger")).unwrap();
    let task = store.accept("apply", plan.input, &bytes).unwrap().0;
    store
        .update(&task.id, |t| {
            t.phase = Phase::Ready;
            t.manifest = Some(Manifest {
                schema_version: 1,
                files: vec![],
            });
            Ok(())
        })
        .unwrap();
    assert!(artifacts::apply(&store, &task.id, &repo).is_err());
    assert_eq!(
        fs::read_to_string(repo.join("code.txt")).unwrap(),
        "local\n"
    );
}
#[tokio::test(flavor = "multi_thread")]
async fn broker_uses_existing_config_without_exposing_provider_key_and_bounds_requests() {
    use axum::{
        Router,
        http::{HeaderMap, StatusCode},
        routing::post,
    };
    let upstream = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = upstream.local_addr().unwrap().port();
    let server = tokio::spawn(async move {
        axum::serve(
            upstream,
            Router::new().route(
                "/model",
                post(|headers: HeaderMap, body: axum::body::Bytes| async move {
                    let request: serde_json::Value = serde_json::from_slice(&body).unwrap();
                    assert_eq!(request["model"], "fixture");
                    assert_eq!(request["n"], 1);
                    assert_eq!(request["max_tokens"], 4096);
                    assert!(request.get("best_of").is_none());
                    assert_eq!(headers["authorization"], "Bearer existing-provider-key");
                    (StatusCode::OK, "model-response")
                }),
            ),
        )
        .await
        .unwrap();
    });
    let root = tempfile::tempdir().unwrap();
    let config = root.path().join("model.toml");
    fs::write(&config,format!("schema_version=1\n[model]\nname='fixture'\n[model.providers.default]\nendpoint='http://127.0.0.1:{port}/model'\nprotocol='chat-completions'\napi_key_env='PROVIDER_KEY'\n")).unwrap();
    let mut inputs = areal_config::ConfigInputs {
        cwd: root.path().into(),
        homedir: Some(root.path().into()),
        config_file: Some(config),
        ..Default::default()
    };
    inputs
        .env
        .insert("PROVIDER_KEY".into(), "existing-provider-key".into());
    let model = areal_config::load_config(&inputs).unwrap().model;
    let broker = broker::Broker::start(&inputs, &model, 1).await.unwrap();
    assert!(!broker.config.contains("existing-provider-key"));
    assert!(!broker.config.contains("PROVIDER_KEY"));
    let doc = broker.config.parse::<toml_edit::DocumentMut>().unwrap();
    let endpoint = doc["model"]["providers"]["task-proxy"]["endpoint"]
        .as_str()
        .unwrap()
        .replace("host.docker.internal", "127.0.0.1");
    let client = reqwest::Client::new();
    assert_eq!(
        client
            .post(&endpoint)
            .body(r#"{"model":"fixture"}"#)
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        client
            .post(&endpoint)
            .bearer_auth(&broker.token)
            .body(r#"{"model":"another-model"}"#)
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        client
            .post(&endpoint)
            .bearer_auth(&broker.token)
            .body(r#"{"model":"fixture","max_tokens":999999,"n":100,"best_of":1000}"#)
            .send()
            .await
            .unwrap()
            .text()
            .await
            .unwrap(),
        "model-response"
    );
    assert_eq!(
        client
            .post(&endpoint)
            .bearer_auth(&broker.token)
            .body(r#"{"model":"fixture"}"#)
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::TOO_MANY_REQUESTS
    );
    let token = broker.token.clone();
    drop(broker);
    let result = client
        .post(&endpoint)
        .bearer_auth(token)
        .body(r#"{"model":"fixture"}"#)
        .send()
        .await;
    assert!(result.is_err() || result.unwrap().status() == StatusCode::GONE);
    server.abort();
}
