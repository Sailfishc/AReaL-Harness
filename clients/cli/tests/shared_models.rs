//! 公开配置命令契约：共享文件往返、无凭据管理、覆盖来源、并发冲突和失败不写入。
//! 主要失败模式：GUI/CLI 读到不同目录；临时覆盖被写回；过期保存覆盖外部编辑；
//! 无效目录损坏原文件；模型/供应商顺序和参数丢失；凭据泄漏到配置或输出。
use serde_json::{Value, json};
use std::{
    fs,
    io::Write,
    path::Path,
    process::{Command, Output, Stdio},
};

fn invoke(root: &Path, args: &[&str], input: Option<&Value>, env: &[(&str, &str)]) -> Output {
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("/usr/bin/python3");
        command.args(["-c", "import subprocess,sys; r=subprocess.run(sys.argv[1:]); sys.exit(r.returncode if r.returncode >= 0 else 128-r.returncode)", env!("CARGO_BIN_EXE_areal")]);
        command
    };
    #[cfg(not(target_os = "macos"))]
    let mut command = Command::new(env!("CARGO_BIN_EXE_areal"));
    let mut child = command
        .current_dir(root)
        .env_clear()
        .env("AREAL_HARNESS_HOME", root.join("home"))
        .envs(env.iter().copied())
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    if let Some(input) = input {
        child
            .stdin
            .take()
            .unwrap()
            .write_all(input.to_string().as_bytes())
            .unwrap();
    } else {
        drop(child.stdin.take());
    }
    child.wait_with_output().unwrap()
}
fn success(out: Output) -> Value {
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    serde_json::from_slice(&out.stdout).unwrap()
}
fn read(root: &Path) -> Value {
    success(invoke(root, &["config", "models", "read"], None, &[]))
}

#[test]
fn shared_catalog_round_trips_without_credentials_and_keeps_file_defaults_separate_from_overrides()
{
    let root = tempfile::tempdir().unwrap();
    let empty = read(root.path());
    assert_eq!(empty["data"], json!([]));
    assert!(empty["defaultModel"].is_null());
    assert!(
        !root.path().join("home").exists(),
        "读取默认配置不能创建文件"
    );
    let request = json!({"expectedRevision":empty["revision"], "defaultModel":{"providerId":"local","modelId":"second"}, "data":[{
        "id":"local", "name":"Local fixture", "enabled":true, "protocol":"chat-completions",
        "endpoint":"http://127.0.0.1:9/v1/chat/completions", "apiKeyEnv":"FIXTURE_API_KEY",
        "parameters":{"temperature":0.2}, "models":[
            {"id":"second","displayName":"Second model","enabled":true,"parameters":{"reasoningEffort":"high"}},
            {"id":"first","enabled":false,"parameters":{}}
        ]
    }]});
    let written = success(invoke(
        root.path(),
        &["config", "models", "write"],
        Some(&request),
        &[],
    ));
    assert_eq!(written["data"], request["data"]);
    assert_eq!(written["defaultModel"], request["defaultModel"]);
    let again = read(root.path());
    assert_eq!(again["revision"], written["revision"]);
    assert_eq!(again["data"], request["data"]);
    let overridden = success(invoke(
        root.path(),
        &["config", "models", "read"],
        None,
        &[
            ("AREAL_HARNESS_MODEL", "first"),
            ("FIXTURE_API_KEY", "private-fixture-key"),
        ],
    ));
    assert_eq!(overridden["defaultModel"]["modelId"], "second");
    assert_eq!(overridden["effective"]["model"]["name"], "first");
    assert_eq!(
        overridden["effective"]["sources"]["model.name"]["kind"],
        "env"
    );
    assert!(!overridden.to_string().contains("private-fixture-key"));
    let file = fs::read_to_string(root.path().join("home/config.toml")).unwrap();
    assert!(file.contains("FIXTURE_API_KEY"));
    assert!(!file.contains("private-fixture-key"));
    let resolved = success(invoke(
        root.path(),
        &["config", "show", "--sources"],
        None,
        &[("FIXTURE_API_KEY", "private-fixture-key")],
    ));
    assert_eq!(resolved["model"]["name"], "second");
    assert_eq!(resolved["model"]["temperature"], 0.2);
    assert_eq!(resolved["model"]["reasoning_effort"], "high");
}

#[test]
fn edits_preserve_other_settings_reject_stale_invalid_and_manual_disabled_defaults() {
    let root = tempfile::tempdir().unwrap();
    fs::create_dir(root.path().join("home")).unwrap();
    let path = root.path().join("home/config.toml");
    fs::write(&path, "# keep this comment\nschema_version = 1\n[limits]\nmax_active_turns = 7 # keep this budget\n").unwrap();
    let initial = read(root.path());
    let provider = json!({"id":"local","name":"Local","endpoint":"http://127.0.0.1:9/complete","protocol":"responses","models":[{"id":"one"},{"id":"two"}]});
    let request = json!({"expectedRevision":initial["revision"],"data":[provider],"defaultModel":{"providerId":"local","modelId":"one"}});
    let saved = success(invoke(
        root.path(),
        &["config", "models", "write"],
        Some(&request),
        &[],
    ));
    let before = fs::read_to_string(&path).unwrap();
    assert!(
        before.contains("# keep this comment")
            && before.contains("max_active_turns = 7 # keep this budget")
    );
    let stale = invoke(
        root.path(),
        &["config", "models", "write"],
        Some(&request),
        &[],
    );
    assert!(!stale.status.success());
    for patch in [
        json!({"providerId":"local","modelId":"missing"}),
        json!({"providerId":"missing","modelId":"one"}),
    ] {
        let mut invalid = request.clone();
        invalid["expectedRevision"] = saved["revision"].clone();
        invalid["defaultModel"] = patch;
        assert!(
            !invoke(
                root.path(),
                &["config", "models", "write"],
                Some(&invalid),
                &[]
            )
            .status
            .success()
        );
    }
    assert_eq!(fs::read_to_string(&path).unwrap(), before);
    fs::write(&path, before.replace("enabled = true", "enabled = false")).unwrap();
    assert!(
        !invoke(root.path(), &["config", "models", "read"], None, &[])
            .status
            .success(),
        "disabled file default must not run through the legacy default model"
    );
}

#[test]
fn account_default_is_a_reference_and_standalone_cli_reports_unavailable() {
    let root = tempfile::tempdir().unwrap();
    let initial = read(root.path());
    let request = json!({"expectedRevision":initial["revision"],"data":[],"defaultModel":{"providerId":"areal_openai","modelId":"account-model"}});
    let saved = success(invoke(
        root.path(),
        &["config", "models", "write"],
        Some(&request),
        &[],
    ));
    assert_eq!(saved["defaultModel"], request["defaultModel"]);
    assert_eq!(saved["data"], json!([]));
    assert!(
        !invoke(root.path(), &["config", "show"], None, &[])
            .status
            .success()
    );
    assert!(
        invoke(root.path(), &["config", "show", "--management"], None, &[])
            .status
            .success()
    );
}

#[test]
fn shared_metadata_rejects_inline_url_credentials_without_echoing_them() {
    let root = tempfile::tempdir().unwrap();
    fs::create_dir(root.path().join("home")).unwrap();
    fs::write(root.path().join("home/config.toml"), "schema_version=1\n[model]\nprovider='local'\nname='one'\n[model.providers.local]\nendpoint='https://example.invalid/v1/responses?key=private-query-key'\nprotocol='responses'\n").unwrap();
    let output = invoke(root.path(), &["config", "models", "read"], None, &[]);
    assert!(!output.status.success());
    assert!(!String::from_utf8_lossy(&output.stdout).contains("private-query-key"));
    assert!(!String::from_utf8_lossy(&output.stderr).contains("private-query-key"));
}
