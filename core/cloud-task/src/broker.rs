use anyhow::{Result, ensure};
use areal_config::{ConfigInputs, SelectedModelConfig};
use axum::{
    Router,
    body::{Body, Bytes},
    extract::State,
    http::{HeaderMap, StatusCode},
    response::Response,
    routing::post,
};
use futures_util::StreamExt;
use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};
use tokio_util::sync::CancellationToken;

pub(crate) fn model(
    workspace: &std::path::Path,
    config: Option<&std::path::Path>,
) -> Result<(ConfigInputs, SelectedModelConfig)> {
    let inputs = ConfigInputs {
        cwd: workspace.into(),
        homedir: std::env::home_dir(),
        env: std::env::vars_os().collect(),
        config_file: config.map(|p| p.to_path_buf()),
        ..Default::default()
    };
    let resolved = areal_config::load_config(&inputs)?;
    let url = url::Url::parse(&resolved.model.endpoint)?;
    ensure!(
        url.username().is_empty()
            && url.password().is_none()
            && url.query().is_none()
            && url.fragment().is_none(),
        "model endpoint must not embed credentials/query data"
    );
    ensure!(
        !resolved.model.responses_websocket,
        "MVP broker supports HTTP streaming; disable responses_websocket for this task"
    );
    resolved.credential(&inputs)?;
    let mut selected = resolved.model;
    // 任务使用有界的临时策略，不写回用户配置。
    selected.max_retries = 0;
    selected.max_output_tokens = Some(selected.max_output_tokens.unwrap_or(4096).min(4096));
    Ok((inputs, selected))
}
struct Proxy {
    lease: CancellationToken,
    model: String,
    protocol: areal_config::ModelProtocolConfig,
    max_output_tokens: u64,
    endpoint: String,
    secret: Option<String>,
    token: String,
    client: reqwest::Client,
    max_bytes: usize,
    remaining: AtomicUsize,
}
async fn forward(
    State(p): State<Arc<Proxy>>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, StatusCode> {
    if p.lease.is_cancelled() {
        return Err(StatusCode::GONE);
    }
    if headers.get("authorization").and_then(|h| h.to_str().ok())
        != Some(&format!("Bearer {}", p.token))
    {
        return Err(StatusCode::UNAUTHORIZED);
    }
    if body.len() > p.max_bytes {
        return Err(StatusCode::PAYLOAD_TOO_LARGE);
    }
    let mut request_body: serde_json::Value =
        serde_json::from_slice(&body).map_err(|_| StatusCode::BAD_REQUEST)?;
    if request_body["model"].as_str() != Some(p.model.as_str()) {
        return Err(StatusCode::FORBIDDEN);
    }
    let object = request_body
        .as_object_mut()
        .ok_or(StatusCode::BAD_REQUEST)?;
    let budget_field = match p.protocol {
        areal_config::ModelProtocolConfig::Responses => "max_output_tokens",
        areal_config::ModelProtocolConfig::ChatCompletions
            if object.contains_key("max_completion_tokens") =>
        {
            "max_completion_tokens"
        }
        areal_config::ModelProtocolConfig::ChatCompletions => "max_tokens",
    };
    let requested = object
        .get(budget_field)
        .and_then(|v| v.as_u64())
        .unwrap_or(p.max_output_tokens)
        .min(p.max_output_tokens);
    object.insert(budget_field.into(), requested.into());
    if matches!(
        p.protocol,
        areal_config::ModelProtocolConfig::ChatCompletions
    ) {
        object.remove(if budget_field == "max_tokens" {
            "max_completion_tokens"
        } else {
            "max_tokens"
        });
        object.insert("n".into(), 1.into());
        object.remove("best_of");
    }
    if p.remaining
        .fetch_update(Ordering::SeqCst, Ordering::SeqCst, |v| v.checked_sub(1))
        .is_err()
    {
        return Err(StatusCode::TOO_MANY_REQUESTS);
    }
    let mut request = p
        .client
        .post(&p.endpoint)
        .header("Content-Type", "application/json")
        .json(&request_body);
    if let Some(secret) = &p.secret {
        request = request.bearer_auth(secret);
    }
    // 不重试未知模型请求；只允许固定供应商 URL，不接受任务指定目的地或重定向。
    let response = tokio::select! {
        _ = p.lease.cancelled() => return Err(StatusCode::GONE),
        result=request.send() => result.map_err(|_| StatusCode::BAD_GATEWAY)?,
    };
    let status = response.status();
    let content_type = response.headers().get("content-type").cloned();
    let stream = futures_util::stream::unfold(
        (response.bytes_stream(), p.lease.clone()),
        |(mut stream, lease)| async move {
            tokio::select! { _=lease.cancelled() => None, item=stream.next() => item.map(|value|(value,(stream,lease))) }
        },
    );
    let mut result = Response::new(Body::from_stream(stream));
    *result.status_mut() = status;
    if let Some(value) = content_type {
        result.headers_mut().insert("content-type", value);
    }
    Ok(result)
}

pub(crate) struct Broker {
    lease: CancellationToken,
    pub config: String,
    pub token: String,
    worker: tokio::task::JoinHandle<()>,
}
impl Drop for Broker {
    fn drop(&mut self) {
        self.lease.cancel();
        self.worker.abort();
    }
}
impl Broker {
    pub async fn start(
        inputs: &ConfigInputs,
        model: &SelectedModelConfig,
        max_requests: usize,
    ) -> Result<Self> {
        let token = uuid::Uuid::new_v4().to_string();
        let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::UNSPECIFIED, 0)).await?;
        let port = listener.local_addr()?.port();
        let lease = CancellationToken::new();
        let proxy = Arc::new(Proxy {
            lease: lease.clone(),
            model: model.name.clone(),
            protocol: model.protocol,
            max_output_tokens: model.max_output_tokens.unwrap_or(4096).min(4096),
            endpoint: model.endpoint.clone(),
            secret: model.credential(inputs)?,
            token: token.clone(),
            client: reqwest::Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                .connect_timeout(std::time::Duration::from_secs(15))
                .timeout(std::time::Duration::from_secs(600))
                .build()?,
            max_bytes: model.max_request_bytes,
            remaining: AtomicUsize::new(max_requests),
        });
        let app = Router::new()
            .route("/model", post(forward))
            .layer(axum::extract::DefaultBodyLimit::max(
                model.max_request_bytes,
            ))
            .with_state(proxy);
        let worker = tokio::spawn(async move {
            let _ = axum::serve(listener, app).await;
        });
        let mut doc = toml_edit::DocumentMut::new();
        doc["schema_version"] = toml_edit::value(1);
        let values = serde_json::to_value(model)?;
        for (key, value) in values.as_object().unwrap() {
            if [
                "endpoint",
                "protocol",
                "api_key_env",
                "provider",
                "responses_websocket",
            ]
            .contains(&key.as_str())
                || value.is_null()
            {
                continue;
            }
            doc["model"][key] = match value {
                serde_json::Value::String(v) => toml_edit::value(v.as_str()),
                serde_json::Value::Number(v) if v.is_i64() => toml_edit::value(v.as_i64().unwrap()),
                serde_json::Value::Number(v) => toml_edit::value(v.as_f64().unwrap()),
                serde_json::Value::Bool(v) => toml_edit::value(*v),
                _ => anyhow::bail!("unsupported selected model option"),
            };
        }
        doc["model"]["provider"] = toml_edit::value("task-proxy");
        doc["model"]["max_retries"] = toml_edit::value(0);
        doc["model"]["providers"]["task-proxy"]["endpoint"] =
            toml_edit::value(format!("http://host.docker.internal:{port}/model"));
        doc["model"]["providers"]["task-proxy"]["protocol"] =
            toml_edit::value(match model.protocol {
                areal_config::ModelProtocolConfig::ChatCompletions => "chat-completions",
                areal_config::ModelProtocolConfig::Responses => "responses",
            });
        doc["model"]["providers"]["task-proxy"]["api_key_env"] =
            toml_edit::value("AREAL_TASK_PROXY_TOKEN");
        Ok(Self {
            lease,
            config: doc.to_string(),
            token,
            worker,
        })
    }
}
