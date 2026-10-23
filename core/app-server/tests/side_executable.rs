use areal_engine::{
    Engine, Limits,
    model::{Message, Model, ModelCapabilities, ModelStream},
};
use areal_protocol::Modality;
use async_trait::async_trait;
use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use std::{
    path::Path,
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, tungstenite::Message as Wire};
use tokio_util::sync::CancellationToken;

type Socket = WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>;
#[derive(Clone, Default)]
struct FixtureModel(Arc<Mutex<Vec<Vec<Message>>>>);
#[async_trait]
impl Model for FixtureModel {
    fn name(&self) -> &str {
        "side-parity-fixture"
    }
    fn configure(
        &self,
        _: &areal_protocol::desktop::ModelParameters,
    ) -> anyhow::Result<Arc<dyn Model>> {
        Ok(Arc::new(self.clone()))
    }
    fn capabilities(&self) -> ModelCapabilities {
        ModelCapabilities {
            declared: None,
            context_window: None,
            context_window_tokens: None,
            max_output_tokens: None,
            summary_output_tokens: None,
            input: vec![Modality::Text],
            output: vec![Modality::Text],
        }
    }
    async fn stream(&self, messages: Vec<Message>) -> anyhow::Result<ModelStream> {
        let last = messages
            .iter()
            .rev()
            .find(|m| m.role == "user")
            .map(Message::text_content)
            .unwrap_or_default();
        self.0.lock().unwrap().push(messages);
        if last == "parent active input" || last == "child hold" {
            return Ok(Box::pin(
                futures_util::stream::iter([Ok("unfinished output excluded".into())])
                    .chain(futures_util::stream::pending()),
            ));
        }
        Ok(Box::pin(futures_util::stream::iter([Ok(
            "settled answer".into()
        )])))
    }
}
struct Fixture {
    engine: Arc<Engine>,
    model: FixtureModel,
    stop: CancellationToken,
    server: tokio::task::JoinHandle<anyhow::Result<()>>,
    addr: std::net::SocketAddr,
}
impl Fixture {
    async fn open(root: &Path) -> Self {
        let model = FixtureModel::default();
        let engine = Engine::open(root, Arc::new(model.clone()), Limits::default()).unwrap();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let stop = CancellationToken::new();
        let server = tokio::spawn(areal_app_server::serve(
            listener,
            engine.clone(),
            stop.clone(),
        ));
        Self {
            engine,
            model,
            stop,
            server,
            addr,
        }
    }
    async fn socket(&self) -> Socket {
        let (mut socket, _) = tokio_tungstenite::connect_async(format!("ws://{}", self.addr))
            .await
            .unwrap();
        let response = call(
            &mut socket,
            "initialize",
            json!({"clientInfo":{"name":"side-parity","version":"1"}}),
        )
        .await;
        assert!(response.get("result").is_some(), "{response}");
        socket
            .send(Wire::Text(
                json!({"method":"initialized"}).to_string().into(),
            ))
            .await
            .unwrap();
        socket
    }
    async fn close(self, mut socket: Socket) {
        socket.close(None).await.unwrap();
        self.stop.cancel();
        tokio::time::timeout(Duration::from_secs(10), self.server)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        self.engine.shutdown().await;
    }
}
async fn call(socket: &mut Socket, method: &str, params: Value) -> Value {
    socket
        .send(Wire::Text(
            json!({"id":1,"method":method,"params":params})
                .to_string()
                .into(),
        ))
        .await
        .unwrap();
    tokio::time::timeout(Duration::from_secs(10), async {
        loop {
            let wire = socket.next().await.unwrap().unwrap();
            let value: Value = serde_json::from_str(wire.to_text().unwrap()).unwrap();
            if value["id"] == 1 {
                return value;
            }
        }
    })
    .await
    .unwrap()
}
async fn start(socket: &mut Socket, thread: &str, text: &str) -> Value {
    let result = call(
        socket,
        "turn/start",
        json!({"threadId":thread,"input":[{"type":"text","text":text}]}),
    )
    .await;
    assert!(result.get("result").is_some(), "{result}");
    result["result"].clone()
}
async fn parent(socket: &mut Socket) -> String {
    let response = call(socket, "thread/start", json!({"cwd":"/workspace"})).await;
    response["result"]["thread"]["id"]
        .as_str()
        .unwrap()
        .to_owned()
}
async fn create(socket: &mut Socket, params: Value) -> Value {
    let response = call(socket, "areal/side/create", params).await;
    assert!(
        response.get("result").is_some(),
        "empty and executable Side creation must be supported: {response}"
    );
    response["result"].clone()
}

#[tokio::test]
async fn empty_side_freezes_full_stable_history_and_keeps_visible_history_local() {
    let dir = tempfile::tempdir().unwrap();
    let f = Fixture::open(dir.path()).await;
    let mut socket = f.socket().await;
    let parent = parent(&mut socket).await;
    start(&mut socket, &parent, "settled parent input").await;
    f.engine.wait(&parent).await.unwrap();
    let active = start(&mut socket, &parent, "parent active input").await;
    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            if f.model.0.lock().unwrap().len() == 2 {
                break;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    let steered = call(
        &mut socket,
        "turn/steer",
        json!({"threadId":parent,"expectedTurnId":active["turn"]["id"],
        "requestId":"active-steer","input":[{"type":"text","text":"committed active steering"}]}),
    )
    .await;
    assert!(steered.get("result").is_some(), "{steered}");
    let params = json!({"sourceThreadId":parent,"requestId":"empty-child"});
    let created = create(&mut socket, params.clone()).await;
    let child = created["thread"]["id"].as_str().unwrap().to_owned();
    assert!(created.get("turn").is_none_or(Value::is_null));
    assert_eq!(
        created["thread"]["conversation"]["policy"]["kind"],
        "sideExecutableV2"
    );
    assert_eq!(
        f.model.0.lock().unwrap().len(),
        2,
        "empty creation starts no model request"
    );
    assert!(f.engine.read(&child, true).await.unwrap().turns.is_empty());
    assert_eq!(create(&mut socket, params).await["thread"]["id"], child);
    start(&mut socket, &child, "child question").await;
    f.engine.wait(&child).await.unwrap();
    let request = f
        .model
        .0
        .lock()
        .unwrap()
        .last()
        .unwrap()
        .iter()
        .map(Message::text_content)
        .collect::<Vec<_>>()
        .join("\n");
    for text in [
        "settled parent input",
        "settled answer",
        "parent active input",
        "committed active steering",
        "child question",
    ] {
        assert!(request.contains(text), "missing {text}: {request}");
    }
    assert!(
        !request.contains("unfinished output excluded"),
        "active parent output must not enter seed"
    );
    let visible = f.engine.read(&child, true).await.unwrap();
    assert_eq!(visible.turns.len(), 1, "inherited history stays hidden");
    f.engine
        .interrupt(&parent, active["turn"]["id"].as_str().unwrap())
        .await
        .unwrap();
    f.engine.wait(&parent).await.unwrap();
    start(&mut socket, &parent, "later parent sentinel").await;
    f.engine.wait(&parent).await.unwrap();
    start(&mut socket, &child, "second child question").await;
    f.engine.wait(&child).await.unwrap();
    let request = f
        .model
        .0
        .lock()
        .unwrap()
        .last()
        .unwrap()
        .iter()
        .map(Message::text_content)
        .collect::<Vec<_>>()
        .join("\n");
    assert!(
        !request.contains("later parent sentinel"),
        "child seed is immutable"
    );
    f.close(socket).await;
}

#[tokio::test]
async fn closed_side_inspects_only_own_unknown_and_confirms_original_cleanup() {
    let dir = tempfile::tempdir().unwrap();
    let f = Fixture::open(dir.path()).await;
    let mut socket = f.socket().await;
    let source = parent(&mut socket).await;
    let created = create(
        &mut socket,
        json!({"sourceThreadId":source,"requestId":"inspect-child",
        "firstInput":[{"type":"text","text":"child question"}]}),
    )
    .await;
    let child = created["thread"]["id"].as_str().unwrap().to_owned();
    f.engine.wait(&child).await.unwrap();
    f.close(socket).await;
    let path = dir.path().join(format!("{child}.json"));
    let mut record: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    record["thread"]["turns"][0]["items"].as_array_mut().unwrap().push(json!({
        "type":"dynamicToolCall","id":"own-unknown","tool":"external_write","arguments":{},
        "status":"failed","success":false,"contentItems":[],"callId":"lost-call",
        "execution":{"runtimeEpoch":"old","scopeId":"old","operationId":"lost","outcome":"unknown"}}));
    std::fs::write(&path, serde_json::to_vec(&record).unwrap()).unwrap();
    let f = Fixture::open(dir.path()).await;
    let mut socket = f.socket().await;
    let close = json!({"threadId":child,"requestId":"inspect-close"});
    assert_eq!(
        call(&mut socket, "areal/side/close", close.clone()).await["result"]["cleanupConfirmed"],
        false
    );
    f.close(socket).await;
    let f = Fixture::open(dir.path()).await;
    let mut socket = f.socket().await;
    assert_eq!(
        call(&mut socket, "areal/side/close", close.clone()).await["result"]["cleanupConfirmed"],
        false
    );
    assert!(
        call(
            &mut socket,
            "areal/tool/acknowledge",
            json!({"threadId":child,"itemId":"not-owned","inspection":"checked"})
        )
        .await
        .get("error")
        .is_some()
    );
    let inspected = call(&mut socket, "areal/tool/acknowledge", json!({"threadId":child,"itemId":"own-unknown","inspection":"Checked external evidence; execution outcome remains unknown"})).await;
    assert!(inspected.get("result").is_some(), "{inspected}");
    assert_eq!(
        call(&mut socket, "areal/side/close", close.clone()).await["result"]["cleanupConfirmed"],
        true
    );
    assert!(
        call(
            &mut socket,
            "turn/start",
            json!({"threadId":child,"input":[{"type":"text","text":"forbidden"}]})
        )
        .await
        .get("error")
        .is_some()
    );
    let history = f.engine.read(&child, true).await.unwrap();
    let item = history.turns[0]
        .items
        .iter()
        .find(|item| item.id() == "own-unknown")
        .unwrap();
    let areal_protocol::Item::DynamicToolCall { execution, .. } = item else {
        panic!("expected tool")
    };
    assert_eq!(execution.outcome, areal_protocol::ToolOutcome::Unknown);
    assert!(execution.inspection.is_some());
    assert!(f.model.0.lock().unwrap().is_empty());
    f.close(socket).await;
    let f = Fixture::open(dir.path()).await;
    let mut socket = f.socket().await;
    assert_eq!(
        call(&mut socket, "areal/side/close", close).await["result"]["cleanupConfirmed"],
        true
    );
    f.close(socket).await;
}

#[tokio::test]
async fn cleanup_continues_after_response_deadline_and_updates_original_receipt() {
    use areal_engine::tools::RuntimeConfig;
    use areal_runtime_client::Client;
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
    let dir = tempfile::tempdir().unwrap();
    let f = Fixture::open(dir.path()).await;
    let mut socket = f.socket().await;
    let source = parent(&mut socket).await;
    let child = create(
        &mut socket,
        json!({"sourceThreadId":source,"requestId":"delayed-child"}),
    )
    .await["thread"]["id"]
        .as_str()
        .unwrap()
        .to_owned();
    f.close(socket).await;
    let path = dir.path().join(format!("{child}.json"));
    let mut record: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    record["thread"]["desktop"]["processes"] = json!((0..4).map(|n| json!({
        "id":format!("process-{n}"),"runtimeEpoch":"delayed","scopeOperationId":format!("scope-op-{n}"),
        "scopeId":format!("scope-{n}"),"operationId":format!("process-op-{n}"),"processId":format!("native-{n}"),
        "lifetime":"thread","turnId":null,"owner":"fixture","argv":["fixture"],"state":"running",
        "cleanupConfirmed":false,"error":null,"inputs":[]
    })).collect::<Vec<_>>());
    std::fs::write(&path, serde_json::to_vec(&record).unwrap()).unwrap();
    let observed = Arc::new(Mutex::new(Vec::new()));
    let peer_observed = observed.clone();
    let (pipe, peer) = tokio::io::duplex(128 * 1024);
    let (read, write) = tokio::io::split(pipe);
    let (peer_read, mut peer_write) = tokio::io::split(peer);
    let peer = tokio::spawn(async move {
        let mut lines = BufReader::new(peer_read).lines();
        while let Some(line) = lines.next_line().await.unwrap() {
            let request: Value = serde_json::from_str(&line).unwrap();
            let method = request["method"].as_str().unwrap();
            let result = match method {
                "connection.open" => {
                    json!({"protocolVersion":"areal.runtime.v0","runtimeEpoch":"delayed","connectionId":"fixture","rootScopeId":"root","capabilities":{"methods":["fs.execute"]}})
                }
                "scope.revoke" | "scope.waitClosed" => {
                    peer_observed
                        .lock()
                        .unwrap()
                        .push((method.to_owned(), request["params"]["scopeId"].clone()));
                    if method == "scope.waitClosed" {
                        tokio::time::sleep(Duration::from_secs(8)).await;
                    }
                    json!({"scopeId":request["params"]["scopeId"],"parentScopeId":"root","state":if method == "scope.waitClosed" {"closed"} else {"revoking"},
                        "owner":{"taskId":"fixture"},"readRoots":[],"writeRoots":[],"network":"deny", "limits":{"wallTimeMs":60000,"outputBytes":8388608,"maxProcesses":4},
                        "activeProcesses":0,"outputBytes":0,"cleanupError":null})
                }
                "connection.close" => json!({"closed":true}),
                other => panic!("unexpected Runtime request {other}"),
            };
            peer_write
                .write_all(format!("{}\n", json!({"id":request["id"],"result":result})).as_bytes())
                .await
                .unwrap();
            if method == "connection.close" {
                break;
            }
        }
    });
    let client = Client::connect(read, write).await.unwrap();
    let workspace = tempfile::tempdir().unwrap();
    let engine = Engine::open_with_runtime(
        dir.path(),
        Arc::new(FixtureModel::default()),
        Limits::default(),
        RuntimeConfig {
            client: client.clone(),
            workspace: workspace.path().to_owned(),
            writable: true,
            command_scope: None,
            command_scratch: None,
        },
    )
    .unwrap();
    let request: areal_protocol::desktop::SideClose =
        serde_json::from_value(json!({"threadId":child,"requestId":"delayed-close"})).unwrap();
    let first = tokio::time::timeout(
        Duration::from_secs(35),
        engine.side_close("fixture".into(), request.clone()),
    )
    .await
    .unwrap()
    .unwrap();
    assert_eq!(first["accepted"], true);
    assert_eq!(
        first["cleanupConfirmed"], false,
        "response deadline must preserve pending cleanup"
    );
    assert!(
        engine
            .start(&child, vec![areal_protocol::Input::text("late")])
            .await
            .is_err()
    );
    tokio::time::timeout(Duration::from_secs(10), async {
        loop {
            let result = engine
                .side_close("fixture".into(), request.clone())
                .await
                .unwrap();
            if result["cleanupConfirmed"] == true {
                break;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    })
    .await
    .unwrap();
    assert_eq!(
        observed.lock().unwrap().len(),
        8,
        "each process cleanup is sent exactly once"
    );
    engine.shutdown().await;
    client.shutdown().await.unwrap();
    peer.await.unwrap();
}

#[tokio::test]
async fn atomic_first_input_and_close_receipts_survive_restart_without_replay() {
    let dir = tempfile::tempdir().unwrap();
    let f = Fixture::open(dir.path()).await;
    let mut socket = f.socket().await;
    let parent = parent(&mut socket).await;
    let params = json!({"sourceThreadId":parent,"requestId":"first-child","firstInput":[{"type":"text","text":"child hold"}]});
    let created = create(&mut socket, params.clone()).await;
    let child = created["thread"]["id"].as_str().unwrap().to_owned();
    let turn = created["turn"]["id"].clone();
    assert!(turn.is_string());
    assert_eq!(
        create(&mut socket, params.clone()).await["turn"]["id"],
        turn
    );
    let queued = call(&mut socket, "areal/turn/enqueue", json!({"threadId":child,"requestId":"queued-child","input":[{"type":"text","text":"must never run"}]})).await;
    assert!(
        queued.get("result").is_some(),
        "new Side supports ordinary queue: {queued}"
    );
    let close = json!({"threadId":child,"requestId":"close-child"});
    let closed = call(&mut socket, "areal/side/close", close.clone()).await;
    assert_eq!(closed["result"]["accepted"], true, "{closed}");
    assert_eq!(closed["result"]["cleanupConfirmed"], true, "{closed}");
    assert_eq!(
        call(&mut socket, "areal/side/close", close.clone()).await["result"],
        closed["result"]
    );
    assert!(
        call(
            &mut socket,
            "turn/start",
            json!({"threadId":child,"input":[{"type":"text","text":"late"}]})
        )
        .await
        .get("error")
        .is_some()
    );
    assert!(
        call(
            &mut socket,
            "areal/conversation/unarchive",
            json!({"threadId":child,"requestId":"restore-closed"})
        )
        .await
        .get("error")
        .is_some()
    );
    assert!(f.model.0.lock().unwrap().iter().all(|request| {
        !request
            .iter()
            .any(|message| message.text_content() == "must never run")
    }));
    f.close(socket).await;
    let f = Fixture::open(dir.path()).await;
    let mut socket = f.socket().await;
    assert_eq!(create(&mut socket, params).await["turn"]["id"], turn);
    assert_eq!(
        call(&mut socket, "areal/side/close", close).await["result"],
        closed["result"]
    );
    assert!(call(&mut socket, "areal/turn/enqueue", json!({"threadId":child,"requestId":"late-after-restart","input":[{"type":"text","text":"late"}]})).await.get("error").is_some());
    assert!(
        f.model.0.lock().unwrap().is_empty(),
        "recovery never replays accepted first input or close"
    );
    f.close(socket).await;
}
