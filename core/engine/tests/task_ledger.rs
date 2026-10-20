use areal_engine::{Engine, Error, Limits, model::ChatModel};
use areal_protocol::tasks::{ChannelRead, TaskControl};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::sync::Arc;

fn open(root: &std::path::Path) -> Arc<Engine> {
    let model = ChatModel::new("http://127.0.0.1:9".into(), "unused".into(), None).unwrap();
    Engine::open(root, Arc::new(model), Limits::default()).unwrap()
}

fn run(n: usize, terminal: bool) -> Value {
    json!({"id":format!("run-{n:05}"),"threadId":null,"goalId":null,
        "status":if terminal {"completed"}else{"queued"},"reason":null,
        "scheduledAt":n,"completedAt":if terminal {Some(n)}else{None},
        "usage":{"inputTokens":5,"cachedInputTokens":0,"outputTokens":2,"tokensUsed":7,"reservedTokens":0,"unknownRequests":0,"timeUsedSeconds":0.5,"turnsStarted":1,"accountingComplete":true},
        "waitRequested":false})
}

fn legacy(root: &std::path::Path, receipts: usize, runs: usize, padding: usize) {
    std::fs::create_dir_all(root.join("desktop")).unwrap();
    let messages = if padding == 0 {
        vec![]
    } else {
        vec![json!({
            "id":"unresolved","sequence":1,"runId":format!("run-{:05}",runs-1),
            "author":"fixture","kind":"question","status":"pending","createdAt":0,
            "expiresAt":null,"questions":[],"required":true,"inReplyTo":null,
            "answers":null,"text":"x".repeat(padding)
        })]
    };
    let value = json!({"version":3,"tasks":{"fixture":{
        "id":"fixture","revision":1,"channelSequence":messages.len(),"owner":"owner",
        "mode":"scheduled","interactionMode":"interactive","objective":"fixture",
        "threadId":null,"schedule":{"at":4102444800_i64,"intervalSeconds":1},
        "nextRunAt":4102444800_i64,"paused":false,"cancelled":false,
        "tokenBudget":100000,"maxTurns":null,"maxActiveSeconds":null,
        "runs":(0..runs).map(|n|run(n,n+1<runs)).collect::<Vec<_>>(),"messages":messages
    }},"receipts":(0..receipts).map(|n|json!({"identity":"owner","method":"pause",
        "requestId":format!("old-{n}"),"digest":format!("{:x}",Sha256::digest(serde_json::to_vec(&control(&format!("old-{n}"),1,None)).unwrap())),"result":{"original":n}})).collect::<Vec<_>>()});
    std::fs::write(
        root.join("desktop/task-mode.json"),
        serde_json::to_vec(&value).unwrap(),
    )
    .unwrap();
}

fn control(request_id: &str, revision: u64, run_id: Option<&str>) -> TaskControl {
    TaskControl {
        request_id: request_id.into(),
        task_id: "fixture".into(),
        expected_revision: revision,
        expected_run_id: run_id.map(str::to_owned),
    }
}

#[tokio::test]
async fn full_receipt_ledger_stops_cancels_and_replays_original_responses_after_restart() {
    let dir = tempfile::tempdir().unwrap();
    legacy(dir.path(), 8192, 1, 0);
    let engine = open(dir.path());
    let stop = control("stop-at-capacity", 1, Some("run-00000"));
    let stopped = engine
        .task_control("owner".into(), "stopRun".into(), stop.clone())
        .await
        .unwrap();
    assert_eq!(stopped["runs"][0]["reason"], "stopRequested");
    let cancel = control(
        "cancel-at-capacity",
        engine.task_read("fixture").await.unwrap().revision,
        None,
    );
    let cancelled = engine
        .task_control("owner".into(), "cancel".into(), cancel.clone())
        .await
        .unwrap();
    assert_eq!(cancelled["cancelled"], true);
    engine.shutdown().await;
    drop(engine);
    let reopened = open(dir.path());
    assert_eq!(
        reopened
            .task_control("owner".into(), "stopRun".into(), stop.clone())
            .await
            .unwrap(),
        stopped
    );
    assert_eq!(
        reopened
            .task_control("owner".into(), "cancel".into(), cancel)
            .await
            .unwrap(),
        cancelled
    );
    assert_eq!(
        reopened
            .task_control("owner".into(), "pause".into(), control("old-0", 1, None))
            .await
            .unwrap(),
        json!({"original":0})
    );
    let mut changed = stop;
    changed.expected_revision += 1;
    assert!(matches!(
        reopened
            .task_control("owner".into(), "stopRun".into(), changed)
            .await,
        Err(Error::Conflict)
    ));
    reopened.shutdown().await;
}

#[tokio::test]
async fn legacy_near_32_mib_without_archivable_data_can_persist_control() {
    let dir = tempfile::tempdir().unwrap();
    legacy(dir.path(), 0, 1, 32 * 1024 * 1024 - 4096);
    let path = dir.path().join("desktop/task-mode.json");
    let mut seeded: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    let overhead = serde_json::to_vec(&seeded).unwrap().len()
        - seeded["tasks"]["fixture"]["messages"][0]["text"]
            .as_str()
            .unwrap()
            .len();
    seeded["tasks"]["fixture"]["messages"][0]["text"] =
        json!("x".repeat(32 * 1024 * 1024 - overhead - 16));
    std::fs::write(path, serde_json::to_vec(&seeded).unwrap()).unwrap();
    let bytes = std::fs::metadata(dir.path().join("desktop/task-mode.json"))
        .unwrap()
        .len();
    assert!(bytes > 32 * 1024 * 1024 - 32 && bytes < 32 * 1024 * 1024);
    let engine = open(dir.path());
    let result = engine
        .task_control(
            "owner".into(),
            "stopRun".into(),
            control("large-stop", 1, Some("run-00000")),
        )
        .await
        .unwrap();
    assert_eq!(result["runs"][0]["reason"], "stopRequested");
    let result = engine
        .task_control(
            "owner".into(),
            "cancel".into(),
            control(
                "large-cancel",
                engine.task_read("fixture").await.unwrap().revision,
                None,
            ),
        )
        .await
        .unwrap();
    assert_eq!(result["cancelled"], true);
    engine.shutdown().await;
    drop(engine);
    let reopened = open(dir.path());
    assert!(reopened.task_read("fixture").await.unwrap().cancelled);
    reopened.shutdown().await;
}

#[tokio::test]
async fn two_thousand_settled_runs_retain_a_bounded_hot_window_and_exact_count() {
    let dir = tempfile::tempdir().unwrap();
    legacy(dir.path(), 0, 2000, 0);
    let path = dir.path().join("desktop/task-mode.json");
    let mut snapshot: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    snapshot["preparations"]=json!((0..2000).map(|n|(format!("run-{n:05}"),json!({"requestId":format!("prepared-{n}"),"cwd":null,"agentProfile":null,"model":null}))).collect::<serde_json::Map<_,_>>());
    std::fs::write(path, serde_json::to_vec(&snapshot).unwrap()).unwrap();

    let engine = open(dir.path());
    let result = engine
        .task_control("owner".into(), "pause".into(), control("archive", 1, None))
        .await
        .unwrap();
    let task = engine.task_read("fixture").await.unwrap();
    assert!(task.runs.len() <= 128);
    assert_eq!(task.runs.last().unwrap().id, "run-01999");
    let refreshed = engine
        .task_control(
            "owner".into(),
            "pause".into(),
            control("counts", result["revision"].as_u64().unwrap(), None),
        )
        .await
        .unwrap();
    assert_eq!(refreshed["runCount"], 2000);
    assert_eq!(refreshed["archivedRunCount"], 1872);
    assert_eq!(refreshed["runsComplete"], false);
    let catalog: Value =
        serde_json::from_slice(&std::fs::read(dir.path().join("desktop/task-mode.json")).unwrap())
            .unwrap();
    let preparations: Value = serde_json::from_slice(
        &std::fs::read(
            dir.path()
                .join("desktop/task-ledger")
                .join(catalog["preparations"].as_str().unwrap()),
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(
        preparations
            .as_object()
            .unwrap()
            .keys()
            .cloned()
            .collect::<Vec<_>>(),
        vec!["run-01999"]
    );

    engine.shutdown().await;
}

#[tokio::test]
async fn channel_sequence_gaps_do_not_create_an_empty_page_that_claims_more() {
    let dir = tempfile::tempdir().unwrap();
    legacy(dir.path(), 0, 1, 1);
    let path = dir.path().join("desktop/task-mode.json");
    let mut value: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    value["tasks"]["fixture"]["channelSequence"] = json!(9);
    value["tasks"]["fixture"]["messages"][0]["sequence"] = json!(3);
    std::fs::write(path, serde_json::to_vec(&value).unwrap()).unwrap();
    let engine = open(dir.path());
    let page = engine
        .channel_read(ChannelRead {
            task_id: "fixture".into(),
            after_sequence: Some(0),
            limit: Some(1),
        })
        .await
        .unwrap();
    assert_eq!(page["data"].as_array().unwrap().len(), 1);
    assert_eq!(page["nextSequence"], 3);
    assert_eq!(page["hasMore"], false);
    engine.shutdown().await;
}

#[tokio::test]
async fn published_channel_history_remains_readable_after_compaction() {
    let dir = tempfile::tempdir().unwrap();
    legacy(dir.path(), 0, 1, 0);
    let path = dir.path().join("desktop/task-mode.json");
    let mut value: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    value["tasks"]["fixture"]["channelSequence"] = json!(1100);
    value["tasks"]["fixture"]["messages"] = json!((0..1100).map(|n| json!({
        "id":format!("message-{n}"),"sequence":n+1,"runId":"run-00000",
        "author":"core","kind":"report","status":"published","createdAt":0,
        "expiresAt":null,"questions":[],"required":false,"inReplyTo":null,"answers":null,"text":"closed"
    })).collect::<Vec<_>>());
    std::fs::write(path, serde_json::to_vec(&value).unwrap()).unwrap();
    let engine = open(dir.path());
    engine
        .task_control(
            "owner".into(),
            "pause".into(),
            control("compact-channel", 1, None),
        )
        .await
        .unwrap();
    assert!(engine.task_read("fixture").await.unwrap().messages.len() <= 1024);
    let mut cursor = 0;
    let mut ids = std::collections::BTreeSet::new();
    loop {
        let page = engine
            .channel_read(ChannelRead {
                task_id: "fixture".into(),
                after_sequence: Some(cursor),
                limit: Some(100),
            })
            .await
            .unwrap();
        for row in page["data"].as_array().unwrap() {
            assert!(ids.insert(row["id"].as_str().unwrap().to_owned()));
        }
        let next = page["nextSequence"].as_u64().unwrap();
        if page["hasMore"] == false {
            break;
        }
        assert!(next > cursor);
        cursor = next;
    }
    assert_eq!(ids.len(), 1100);
    engine.shutdown().await;
}

#[tokio::test]
async fn missing_committed_task_payload_fails_closed_on_restart() {
    let dir = tempfile::tempdir().unwrap();
    legacy(dir.path(), 0, 1, 0);
    let engine = open(dir.path());
    engine
        .task_control("owner".into(), "pause".into(), control("make-v4", 1, None))
        .await
        .unwrap();
    engine.shutdown().await;
    drop(engine);
    let catalog: Value =
        serde_json::from_slice(&std::fs::read(dir.path().join("desktop/task-mode.json")).unwrap())
            .unwrap();
    assert_eq!(catalog["version"], 4);
    let body = catalog["tasks"]
        .as_object()
        .unwrap()
        .values()
        .next()
        .unwrap()["body"]
        .as_str()
        .unwrap();
    std::fs::remove_file(dir.path().join("desktop/task-ledger").join(body)).unwrap();
    let model = ChatModel::new("http://127.0.0.1:9".into(), "unused".into(), None).unwrap();
    assert!(Engine::open(dir.path(), Arc::new(model), Limits::default()).is_err());
}

#[cfg(feature = "test-support")]
#[tokio::test]
async fn commit_faults_preserve_the_committed_root_and_reconcile_unknown_replace_before_retry() {
    use areal_engine::TaskCommitFault;
    for phase in [
        TaskCommitFault::BeforeLeaf,
        TaskCommitFault::AfterLeaf,
        TaskCommitFault::BeforeRoot,
        TaskCommitFault::AfterRootReplace,
        TaskCommitFault::AfterRootSync,
    ] {
        let dir = tempfile::tempdir().unwrap();
        legacy(dir.path(), 0, 1, 0);
        let engine = open(dir.path());
        engine.set_task_commit_fault(phase).await;
        let request = control("fault-stop", 1, Some("run-00000"));
        assert!(
            matches!(
                engine
                    .task_control("owner".into(), "stopRun".into(), request.clone())
                    .await,
                Err(Error::Storage(_))
            ),
            "{phase:?}"
        );
        assert_eq!(
            engine.task_read("fixture").await.unwrap().revision,
            1,
            "failed writes never install an in-memory candidate"
        );
        assert!(
            matches!(
                engine
                    .task_control(
                        "owner".into(),
                        "pause".into(),
                        control("blocked-after-fault", 1, None)
                    )
                    .await,
                Err(Error::Storage(_))
            ),
            "writes remain frozen until durable reconciliation"
        );
        engine.shutdown().await;
        drop(engine);
        let reopened = open(dir.path());
        let committed = reopened.task_read("fixture").await.unwrap();
        let accepted = matches!(
            phase,
            TaskCommitFault::AfterRootReplace | TaskCommitFault::AfterRootSync
        );
        assert_eq!(
            committed.runs[0].reason.as_deref() == Some("stopRequested"),
            accepted,
            "{phase:?}"
        );
        let result = reopened
            .task_control("owner".into(), "stopRun".into(), request.clone())
            .await
            .unwrap();
        assert_eq!(result["revision"], 2);
        assert_eq!(result["runs"][0]["reason"], "stopRequested");
        assert_eq!(
            reopened
                .task_control("owner".into(), "stopRun".into(), request)
                .await
                .unwrap(),
            result
        );
        reopened.shutdown().await;
    }
}

#[tokio::test]
async fn admitted_unknown_goal_and_questions_settle_at_legacy_byte_and_receipt_capacity() {
    use areal_engine::{
        model::{Message, Model, ModelStream},
        tools::DynamicToolHost,
    };
    use areal_protocol::{goals::GoalControl, tasks::TaskCreate};
    use std::time::{Duration, SystemTime, UNIX_EPOCH};
    struct Held(tokio::sync::Semaphore);
    #[async_trait::async_trait]
    impl Model for Held {
        fn name(&self) -> &str {
            "capacity-held-model"
        }
        async fn stream(&self, _: Vec<Message>) -> anyhow::Result<ModelStream> {
            self.0.add_permits(1);
            Ok(Box::pin(futures_util::stream::pending()))
        }
        async fn chat_limited(
            &self,
            messages: Vec<Message>,
            _: Vec<Value>,
            _: areal_engine::model::RequestPurpose,
            _: Option<u64>,
        ) -> anyhow::Result<ModelStream> {
            self.stream(messages).await
        }
    }
    struct Host;
    #[async_trait::async_trait]
    impl DynamicToolHost for Host {
        fn id(&self) -> &str {
            "capacity-fixture"
        }
        fn identity(&self) -> &str {
            "owner"
        }
        fn is_closed(&self) -> bool {
            false
        }
        async fn prepare_schedule(
            &self,
            _: Value,
            _: tokio_util::sync::CancellationToken,
        ) -> anyhow::Result<Value> {
            Ok(json!({}))
        }
        async fn call(
            &self,
            _: Value,
            _: tokio_util::sync::CancellationToken,
        ) -> anyhow::Result<areal_protocol::DynamicToolResponse> {
            anyhow::bail!("unexpected external tool")
        }
    }
    let dir = tempfile::tempdir().unwrap();
    let model = Arc::new(Held(tokio::sync::Semaphore::new(0)));
    let engine = Engine::open(dir.path(), model.clone(), Limits::default()).unwrap();
    let anchor = engine.create(engine.default_cwd()).await.unwrap();
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    let created=engine.task_create("owner".into(),serde_json::from_value::<TaskCreate>(json!({"requestId":"real-capacity-task","mode":"scheduled","objective":"Hold an admitted invocation","threadId":anchor.id,"schedule":{"at":now-1,"intervalSeconds":3600},"tokenBudget":100000})).unwrap()).await.unwrap();
    let task_id = created["id"].as_str().unwrap().to_owned();
    engine.register_schedule_host(Arc::new(Host)).await.unwrap();
    tokio::time::timeout(Duration::from_secs(10), model.0.acquire())
        .await
        .unwrap()
        .unwrap()
        .forget();
    let task = engine.task_read(&task_id).await.unwrap();
    let run = task.runs.last().unwrap();
    let thread = run.thread_id.as_ref().unwrap();
    let goal = run.goal_id.as_ref().unwrap();
    let view = engine.goal_get(thread).await.unwrap();
    engine
        .goal_control(
            "owner".into(),
            "pause".into(),
            GoalControl {
                request_id: "pause-before-legacy-fixture".into(),
                thread_id: thread.clone(),
                goal_id: goal.clone(),
                expected_revision: view["revision"].as_u64().unwrap(),
            },
            None,
        )
        .await
        .unwrap();
    engine.wait(thread).await.unwrap();
    let task = tokio::time::timeout(Duration::from_secs(10), async {
        loop {
            let task = engine.task_read(&task_id).await.unwrap();
            if task.runs.last().unwrap().status == areal_protocol::tasks::RunStatus::Paused {
                break task;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    let original_usage = serde_json::to_value(&task.runs.last().unwrap().usage).unwrap();
    assert!(original_usage["unknownRequests"].as_u64().unwrap() > 0);
    assert_eq!(original_usage["accountingComplete"], false);
    let run_id = task.runs.last().unwrap().id.clone();
    engine.shutdown().await;
    drop(engine);
    let mut task = serde_json::to_value(task).unwrap();
    task["channelSequence"] = json!(1);
    task["messages"] = json!([{"id":"fixture-pending-question","sequence":1,"runId":run_id,"author":"fixture","kind":"question","status":"pending","createdAt":now,"expiresAt":null,"questions":[{"id":"target","title":"Fixture target","options":["A"],"allowFreeText":false}],"required":true,"inReplyTo":null,"answers":null,"text":""}]);
    let mut legacy = json!({"version":3,"tasks":{task_id.clone():task},"receipts":(0..8192).map(|n|json!({"identity":"fixture-old-owner","method":"pause","requestId":format!("fixture-{n}"),"digest":"0".repeat(64),"result":{"fixture":true,"index":n}})).collect::<Vec<_>>(),"preparations":{}});
    let overhead = serde_json::to_vec(&legacy).unwrap().len();
    legacy["tasks"][&task_id]["messages"][0]["text"] =
        json!("x".repeat(32 * 1024 * 1024 - overhead - 16));
    let bytes = serde_json::to_vec(&legacy).unwrap();
    assert_eq!(bytes.len(), 32 * 1024 * 1024 - 16);
    std::fs::write(dir.path().join("desktop/task-mode.json"), bytes).unwrap();
    let resumed_model = Arc::new(Held(tokio::sync::Semaphore::new(0)));
    let reopened = Engine::open(dir.path(), resumed_model.clone(), Limits::default()).unwrap();
    let task = reopened.task_read(&task_id).await.unwrap();
    let request = TaskControl {
        request_id: "capacity-stop-real-goal".into(),
        task_id: task_id.clone(),
        expected_revision: task.revision,
        expected_run_id: Some(run_id.clone()),
    };
    let stopped = reopened
        .task_control("owner".into(), "stopRun".into(), request.clone())
        .await
        .unwrap();
    let settled = tokio::time::timeout(Duration::from_secs(10), async {
        loop {
            let task = reopened.task_read(&task_id).await.unwrap();
            if task.runs.last().unwrap().status.terminal() {
                break task;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    assert_eq!(
        settled.runs.last().unwrap().status,
        areal_protocol::tasks::RunStatus::Cancelled
    );
    assert_eq!(
        serde_json::to_value(&settled.runs.last().unwrap().usage).unwrap(),
        original_usage
    );
    assert!(
        settled
            .messages
            .iter()
            .all(|message| message.status != "pending")
    );
    assert!(
        settled
            .messages
            .iter()
            .any(|message| message.kind == "report")
    );
    assert_eq!(
        resumed_model.0.available_permits(),
        0,
        "unknown invocation is never replayed"
    );
    reopened
        .task_control(
            "owner".into(),
            "cancel".into(),
            TaskControl {
                request_id: "capacity-cancel-real-goal".into(),
                task_id: task_id.clone(),
                expected_revision: settled.revision,
                expected_run_id: None,
            },
        )
        .await
        .unwrap();
    reopened.shutdown().await;
    drop(reopened);
    let reopened = open(dir.path());
    assert!(reopened.task_read(&task_id).await.unwrap().cancelled);
    assert_eq!(
        reopened
            .task_control("owner".into(), "stopRun".into(), request)
            .await
            .unwrap(),
        stopped
    );
    reopened.shutdown().await;
}
