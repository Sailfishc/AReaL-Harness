//! Trusted task ancestry for bounded Runtime hook write groups. Task identity is
//! the validated opaque scope, never the free-form owner task/plugin label.
use super::*;
use anyhow::Context;
use areal_runtime_protocol as rt;

pub(super) enum Anchor {
    Ready(rt::ScopeInfo),
    Unknown {
        operation: Option<String>,
        scope: Option<String>,
        error: rt::Error,
    },
    Closed,
}
impl Engine {
    pub(crate) async fn runtime_task_parent(&self, cell: &Cell) -> rt::Result<String> {
        self.runtime_resource_parent(cell, false).await
    }

    pub(crate) async fn runtime_thread_process_parent(&self, cell: &Cell) -> rt::Result<String> {
        self.runtime_resource_parent(cell, true).await
    }

    async fn runtime_resource_parent(
        &self,
        cell: &Cell,
        thread_process: bool,
    ) -> rt::Result<String> {
        let runtime = self
            .runtime
            .as_ref()
            .ok_or_else(|| rt::Error::new(rt::ErrorCode::Unavailable, "Runtime unavailable"))?;
        let client = &runtime.client;
        // 普通工具使用短命令 Scope；获授权的 Thread 服务使用部署生命周期。
        // 子 Thread 必须继续继承父 Turn 的 Scope，不能借服务入口跳出其边界。
        let mut parent = runtime
            .command_scope
            .as_ref()
            .filter(|_| !thread_process)
            .map_or_else(
                || client.info().root_scope_id.clone(),
                |scope| scope.scope_id.clone(),
            );
        let parent_thread = cell.state.lock().await.thread.parent_thread_id.clone();
        if let Some(parent_id) = parent_thread {
            let owner = self
                .cell(&parent_id)
                .await
                .map_err(|e| rt::Error::new(rt::ErrorCode::Unavailable, e.to_string()))?;
            let inherited = owner
                .state
                .lock()
                .await
                .active
                .as_ref()
                .and_then(|active| active.base_scope.clone());
            if let Some(scope) = inherited {
                parent = scope;
            } else if thread_process {
                return Err(rt::Error::new(
                    rt::ErrorCode::Unavailable,
                    "parent Turn scope is unavailable for a child Thread service",
                ));
            }
        }
        let needed = {
            let state = cell.state.lock().await;
            let hooks = state.active.as_ref().map_or_else(
                || self.frozen_plugin_hooks(&state.thread),
                |active| active.hooks.clone(),
            );
            hooks.iter().any(|hook| {
                matches!(
                    hook.definition.handler,
                    areal_plugins::hooks::HookHandler::Command { .. }
                )
            })
        };
        let mut anchor = cell.hooks.task_scope.lock().await;
        match anchor.get(&parent) {
            Some(Anchor::Ready(scope)) => return Ok(scope.scope_id.clone()),
            Some(Anchor::Unknown { error, .. }) => return Err(error.clone()),
            Some(Anchor::Closed) => {
                return Err(rt::Error::new(
                    rt::ErrorCode::ScopeClosed,
                    "hook task scope closed",
                ));
            }
            None if !needed => return Ok(parent),
            None => {}
        }
        let info: rt::ScopeInfo = client.call("scope.get", json!({"scopeId":parent})).await?;
        let operation = client.operation_id();
        let result = client
            .create_participant_scope(rt::CreateParticipantScope {
                authority_scope_id: client.info().root_scope_id.clone(),
                scope: rt::CreateScope {
                    operation_id: operation.clone(),
                    parent_scope_id: parent.clone(),
                    owner: rt::Owner {
                        task_id: cell.id.clone(),
                        plugin_instance_id: None,
                    },
                    permissions: rt::PermissionRequest::default(),
                    limits: rt::LimitRequest::default(),
                },
                participation: rt::ScopeParticipation::Task {
                    admission_window_ms: info.limits.wall_time_ms.min(60_000),
                },
            })
            .await;
        match result {
            Ok(scope) => {
                let id = scope.scope_id.clone();
                anchor.insert(parent, Anchor::Ready(scope));
                Ok(id)
            }
            Err(error) if super::runner::uncertain(&error) => {
                anchor.insert(
                    parent,
                    Anchor::Unknown {
                        operation: Some(operation),
                        scope: None,
                        error: error.clone(),
                    },
                );
                drop(anchor);
                cell.state.lock().await.poisoned = true;
                Err(error)
            }
            Err(error) => Err(error),
        }
    }
    pub(crate) async fn hook_task_unknown(&self, cell: &Cell) -> Option<Value> {
        let anchor = cell.hooks.task_scope.lock().await;
        let scopes: Vec<_> = anchor
            .iter()
            .filter_map(|(parent, value)| match value {
                Anchor::Unknown {
                    operation, scope, ..
                } => Some(json!({"parentScopeId":parent,"operationId":operation,"scopeId":scope})),
                _ => None,
            })
            .collect();
        if scopes.is_empty() {
            return None;
        }
        Some(
            json!({"threadId":cell.id,"kind":"hookTaskScope","operationId":scopes[0]["operationId"],
            "scopeId":scopes[0]["scopeId"],"scopes":scopes}),
        )
    }
    pub(super) async fn close_hook_task_scope(&self, cell: &Cell) -> anyhow::Result<()> {
        let mut anchor = cell.hooks.task_scope.lock().await;
        if anchor.is_empty() {
            return Ok(());
        }
        let scopes: Vec<_> = anchor
            .iter()
            .filter_map(|(parent, value)| match value {
                Anchor::Ready(scope) => Some((parent.clone(), scope.scope_id.clone())),
                _ => None,
            })
            .collect();
        let client = &self.runtime.as_ref().context("Runtime unavailable")?.client;
        let mut failed = anchor
            .values()
            .any(|value| matches!(value, Anchor::Unknown { .. }));
        for (parent, scope) in scopes {
            match client.close_scope(&scope).await {
                Ok(closed)
                    if closed.state == rt::ScopeState::Closed
                        && closed.active_processes == 0
                        && closed.cleanup_error.is_none() =>
                {
                    anchor.insert(parent, Anchor::Closed);
                }
                _ => {
                    anchor.insert(
                        parent,
                        Anchor::Unknown {
                            operation: None,
                            scope: Some(scope),
                            error: rt::Error::new(
                                rt::ErrorCode::CleanupFailed,
                                "Runtime hook task scope cleanup unconfirmed",
                            ),
                        },
                    );
                    failed = true;
                }
            }
        }
        drop(anchor);
        if failed {
            cell.state.lock().await.poisoned = true;
            anyhow::bail!("UNKNOWN Runtime hook task scope cleanup; no replay");
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Message, Model, ModelStream};
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

    struct NoModel;
    #[async_trait::async_trait]
    impl Model for NoModel {
        fn name(&self) -> &str {
            "service-scope-fixture"
        }
        async fn stream(&self, _: Vec<Message>) -> anyhow::Result<ModelStream> {
            unreachable!()
        }
    }

    #[tokio::test]
    async fn persistent_services_do_not_change_command_limits_or_escape_child_ancestry() {
        let data = tempfile::tempdir().unwrap();
        let workspace = tempfile::tempdir().unwrap();
        let (pipe, peer) = tokio::io::duplex(8192);
        let (read, write) = tokio::io::split(pipe);
        let (peer_read, mut peer_write) = tokio::io::split(peer);
        let task = tokio::spawn(async move {
            let mut lines = BufReader::new(peer_read).lines();
            while let Some(line) = lines.next_line().await.unwrap() {
                let request: Value = serde_json::from_str(&line).unwrap();
                let result = match request["method"].as_str().unwrap() {
                    "connection.open" => {
                        json!({"protocolVersion":"areal.runtime.v0","runtimeEpoch":"fixture",
                        "connectionId":"fixture","rootScopeId":"deployment","capabilities":{"methods":["fs.execute"]}})
                    }
                    "runtime.status" => json!({"runtimeEpoch":"fixture","activeProcesses":0}),
                    "connection.close" => json!({"closed":true}),
                    _ => json!({}),
                };
                peer_write
                    .write_all(
                        format!("{}\n", json!({"id":request["id"],"result":result})).as_bytes(),
                    )
                    .await
                    .unwrap();
                if request["method"] == "connection.close" {
                    break;
                }
            }
        });
        let client = areal_runtime_client::Client::connect(read, write)
            .await
            .unwrap();
        let command: rt::ScopeInfo = serde_json::from_value(json!({"scopeId":"command-limit","parentScopeId":"deployment",
            "state":"active","owner":{"taskId":"core-command-tools"},"readRoots":[],"writeRoots":[],"network":"deny",
            "limits":{"wallTimeMs":500,"outputBytes":8388608,"maxProcesses":4},"activeProcesses":0,"outputBytes":0,"cleanupError":null})).unwrap();
        let engine = Engine::open_with_runtime(
            data.path(),
            Arc::new(NoModel),
            Limits::default(),
            crate::tools::RuntimeConfig {
                client: client.clone(),
                workspace: workspace.path().into(),
                writable: true,
                command_scope: Some(command),
                command_scratch: None,
            },
        )
        .unwrap();
        let parent = engine
            .create(workspace.path().to_string_lossy().into())
            .await
            .unwrap();
        let cell = engine.cell(&parent.id).await.unwrap();
        assert_eq!(
            engine.runtime_task_parent(&cell).await.unwrap(),
            "command-limit"
        );
        assert_eq!(
            engine.runtime_thread_process_parent(&cell).await.unwrap(),
            "deployment"
        );
        assert_eq!(
            engine.runtime_task_parent(&cell).await.unwrap(),
            "command-limit"
        );
        let child = engine
            .create(workspace.path().to_string_lossy().into())
            .await
            .unwrap();
        let child = engine.cell(&child.id).await.unwrap();
        child.state.lock().await.thread.parent_thread_id = Some(parent.id.clone());
        assert!(
            engine
                .runtime_thread_process_parent(&child)
                .await
                .unwrap_err()
                .message
                .contains("parent Turn scope")
        );
        // 两个生命周期分别记账；一个 UNKNOWN 不能让另一个未知回执从状态中消失。
        let mut anchors = cell.hooks.task_scope.lock().await;
        for name in ["command-limit", "deployment"] {
            anchors.insert(
                name.into(),
                Anchor::Unknown {
                    operation: Some(name.into()),
                    scope: None,
                    error: rt::Error::new(rt::ErrorCode::Unavailable, "fixture unknown"),
                },
            );
        }
        drop(anchors);
        assert_eq!(
            engine.hook_task_unknown(&cell).await.unwrap()["scopes"]
                .as_array()
                .unwrap()
                .len(),
            2
        );
        cell.hooks.task_scope.lock().await.clear();
        engine.shutdown().await;
        client.shutdown().await.unwrap();
        task.await.unwrap();
    }
}
