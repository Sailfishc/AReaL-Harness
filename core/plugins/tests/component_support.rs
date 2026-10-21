use areal_plugins::Store;
use serde_json::{Value, json};
use std::{fs, path::Path};

const ID: &str = "sample@local";
fn write(root: &Path, path: &str, value: &str) {
    let path = root.join(path);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, value).unwrap();
}
fn fixture(manifest_path: &str, manifest: Value) -> tempfile::TempDir {
    let temp = tempfile::tempdir().unwrap();
    write(
        temp.path(),
        ".agents/plugins/marketplace.json",
        &json!({"name":"local","plugins":[{"name":"sample","source":"./pkg"}]}).to_string(),
    );
    write(
        temp.path(),
        &format!("pkg/{manifest_path}"),
        &manifest.to_string(),
    );
    write(
        temp.path(),
        "pkg/skills/example/SKILL.md",
        "---\nname: Example\ndescription: Fixture skill\n---\nbody",
    );
    temp
}
fn portable(extension: Value) -> Value {
    json!({"$schema":"https://agent-plugins.org/schemas/1.0.0/plugin.schema.json","name":"sample","extensions":extension})
}
fn open(temp: &tempfile::TempDir) -> Store {
    Store::open(temp.path().join("state"), temp.path().to_owned(), None).unwrap()
}
fn read(store: &Store) -> Value {
    serde_json::to_value(store.read(ID).unwrap()).unwrap()
}
fn install(store: &Store) -> Value {
    let detail = store.read(ID).unwrap();
    serde_json::to_value(
        store
            .install(
                ID,
                "user",
                detail.revision,
                &detail.source,
                &detail.source_digest,
            )
            .unwrap(),
    )
    .unwrap()
}
fn rows(detail: &Value, field: &str) -> Vec<Value> {
    detail[field]["components"]
        .as_array()
        .expect("exact-byte component report missing")
        .clone()
}

#[test]
fn supported_formats_have_digest_bound_skill_reports() {
    for (path, manifest, format) in [
        ("plugin.json", portable(json!({})), "portable1"),
        (
            ".codex-plugin/plugin.json",
            json!({"name":"sample"}),
            "codex",
        ),
        (
            ".claude-plugin/plugin.json",
            json!({"name":"sample"}),
            "claude",
        ),
        (
            ".cursor-plugin/plugin.json",
            json!({"name":"sample"}),
            "cursor",
        ),
    ] {
        let temp = fixture(path, manifest);
        let store = open(&temp);
        let detail = read(&store);
        assert_eq!(detail["componentSupport"]["digest"], detail["sourceDigest"]);
        assert_eq!(detail["componentSupport"]["manifestFormat"], format);
        assert_eq!(rows(&detail, "componentSupport")[0]["kind"], "skills");
        assert_eq!(rows(&detail, "componentSupport")[0]["status"], "supported");
        assert_eq!(
            detail["componentSupport"]["compatibility"]["state"],
            "allowed"
        );
        assert_eq!(detail["installedComponentSupport"], Value::Null);
        let installed = install(&store);
        assert_eq!(
            installed["installedComponentSupport"]["digest"],
            installed["installedDigest"]
        );
        assert_eq!(store.enabled_skills().unwrap().len(), 1);
    }
}

#[test]
fn unsupported_declarations_stay_individual_opaque_and_optional() {
    let temp = fixture(
        ".claude-plugin/plugin.json",
        json!({"name":"sample","commands":{"review":{"command":"SECRET_COMMAND"},"build":"commands/build.md"},"agents":[{"prompt":"SECRET_AGENT"},"agents/reviewer.md"],"ui":{"surfaces":{"panel":{"token":"SECRET_UI"},"toolbar":false}}}),
    );
    write(temp.path(), "pkg/commands/build.md", "build");
    write(temp.path(), "pkg/agents/reviewer.md", "review");
    let store = open(&temp);
    let detail = install(&store);
    let report = rows(&detail, "installedComponentSupport");
    for kind in ["commands", "agents", "uiSurfaces"] {
        let selected: Vec<_> = report.iter().filter(|row| row["kind"] == kind).collect();
        assert_eq!(selected.len(), 2, "lost {kind} declaration");
        assert!(selected.iter().all(|row| row["status"] == "unsupported"));
        assert!(
            selected
                .iter()
                .all(|row| !row["reasonCodes"].as_array().unwrap().is_empty())
        );
    }
    let serialized = serde_json::to_string(&detail["installedComponentSupport"]).unwrap();
    for secret in ["SECRET_COMMAND", "SECRET_AGENT", "SECRET_UI"] {
        assert!(!serialized.contains(secret));
    }
    assert_eq!(
        detail["installedComponentSupport"]["compatibility"]["state"],
        "allowed"
    );
    assert_eq!(store.enabled_skills().unwrap().len(), 1);
    assert_eq!(store.installed_snapshot().unwrap().enabled_skills.len(), 1);
}

#[test]
fn required_static_compatibility_gates_every_existing_effective_selection() {
    for (required, extra) in [
        (
            json!(["commands"]),
            json!({"commands":{"run":{"command":"do not execute"}}}),
        ),
        (json!(["mcp"]), json!({})),
    ] {
        let mut manifest = portable(
            json!({"org.areal":{"componentRequirements":{"version":1,"requiredKinds":required}}}),
        );
        manifest["extensions"]["com.openai"] = extra;
        let temp = fixture("plugin.json", manifest);
        let store = open(&temp);
        let detail = install(&store);
        assert_eq!(detail["enabled"], true, "scope intent is retained");
        assert_eq!(
            detail["installedComponentSupport"]["compatibility"]["state"],
            "blocked"
        );
        assert!(
            !detail["installedComponentSupport"]["compatibility"]["reasonCodes"]
                .as_array()
                .unwrap()
                .is_empty()
        );
        assert_eq!(detail["installedSkills"].as_array().unwrap().len(), 1);
        assert_eq!(store.installed_components().unwrap().len(), 1);
        assert_eq!(store.enabled_components().unwrap().len(), 0);
        assert!(store.enabled_component(ID).is_err());
        assert_eq!(store.enabled_revisions().unwrap().len(), 0);
        assert_eq!(store.enabled_skills().unwrap().len(), 0);
        let snapshot = store.installed_snapshot().unwrap();
        assert_eq!(snapshot.enabled_skills.len(), 0);
        assert_eq!(snapshot.enabled_ids.len(), 0);
        let skill = &detail["installedSkills"][0];
        assert!(
            !store
                .is_skill_enabled(
                    skill["id"].as_str().unwrap(),
                    skill["revision"].as_str().unwrap()
                )
                .unwrap()
        );
    }
}

#[test]
fn partial_mcp_envelope_blocks_only_when_required_and_dynamic_gates_are_separate() {
    let temp = fixture(
        "plugin.json",
        portable(
            json!({"org.areal":{"componentRequirements":{"version":1,"requiredKinds":["mcp"]}}}),
        ),
    );
    write(temp.path(), "pkg/mcp.json", r#"{"mcpServers":42}"#);
    let store = open(&temp);
    let detail = install(&store);
    let report = rows(&detail, "installedComponentSupport");
    assert_eq!(
        report.iter().find(|row| row["kind"] == "mcp").unwrap()["status"],
        "partial"
    );
    assert_eq!(
        detail["installedComponentSupport"]["compatibility"]["state"],
        "blocked"
    );
    let temp = fixture(
        "plugin.json",
        portable(
            json!({"org.areal":{"componentRequirements":{"version":1,"requiredKinds":["mcp"]}}}),
        ),
    );
    write(
        temp.path(),
        "pkg/mcp.json",
        r#"{"mcpServers":{"local":{"command":"NEVER_EXECUTE","required":true}}}"#,
    );
    let store = open(&temp);
    let detail = install(&store);
    let row = rows(&detail, "installedComponentSupport")
        .into_iter()
        .find(|row| row["kind"] == "mcp")
        .unwrap();
    assert_eq!(row["status"], "supported");
    assert!(
        row["activationRequirements"]
            .as_array()
            .unwrap()
            .contains(&json!("explicitMcpTrust"))
    );
    assert_eq!(
        detail["installedComponentSupport"]["compatibility"]["state"],
        "allowed"
    );
    assert_eq!(store.enabled_components().unwrap().len(), 1);
}

#[test]
fn required_extension_is_strict_portable_only() {
    for requirements in [
        json!({"version":2,"requiredKinds":[]}),
        json!({"version":1,"requiredKinds":["mystery"]}),
        json!({"version":1,"requiredKinds":["skills","skills"]}),
        json!({"version":1,"requiredKinds":"skills"}),
        json!({"version":1,"requiredKinds":[],"unknown":true}),
        json!({"requiredKinds":[]}),
        json!(null),
    ] {
        let temp = fixture(
            "plugin.json",
            portable(json!({"org.areal":{"componentRequirements":requirements}})),
        );
        let list = open(&temp).list().unwrap();
        assert_eq!(
            list.data.len(),
            0,
            "invalid requirements accepted: {requirements}"
        );
        assert!(!list.errors.is_empty());
    }
    let temp = fixture(
        ".codex-plugin/plugin.json",
        json!({"name":"sample","required":["commands"],"extensions":{"org.areal":{"componentRequirements":{"version":99}}}}),
    );
    let store = open(&temp);
    assert_eq!(
        install(&store)["installedComponentSupport"]["compatibility"]["state"],
        "allowed"
    );
}

#[test]
fn candidate_change_restart_old_state_and_missing_source_keep_exact_installed_report() {
    let temp = fixture("plugin.json", portable(json!({})));
    let store = open(&temp);
    let installed = install(&store);
    let installed_digest = installed["installedDigest"].clone();
    let mut state: Value =
        serde_json::from_slice(&fs::read(temp.path().join("state/state.json")).unwrap()).unwrap();
    for detail in state["installed"].as_object_mut().unwrap().values_mut() {
        detail.as_object_mut().unwrap().remove("componentSupport");
        detail
            .as_object_mut()
            .unwrap()
            .remove("installedComponentSupport");
    }
    fs::write(
        temp.path().join("state/state.json"),
        serde_json::to_vec(&state).unwrap(),
    )
    .unwrap();
    write(
        temp.path(),
        "pkg/plugin.json",
        &portable(json!({"com.openai":{"commands":{"new":{"command":"SECRET_NEW"}}}})).to_string(),
    );
    let detail = read(&open(&temp));
    assert_ne!(detail["sourceDigest"], installed_digest);
    assert_eq!(detail["componentSupport"]["digest"], detail["sourceDigest"]);
    assert_eq!(
        detail["installedComponentSupport"]["digest"],
        installed_digest
    );
    assert_eq!(rows(&detail, "installedComponentSupport").len(), 1);
    assert_eq!(rows(&detail, "componentSupport").len(), 2);
    fs::remove_file(temp.path().join("pkg/plugin.json")).unwrap();
    let detail = read(&open(&temp));
    assert_eq!(detail["componentSupport"], Value::Null);
    assert_eq!(
        detail["installedComponentSupport"]["digest"],
        installed_digest
    );
    assert_eq!(open(&temp).enabled_skills().unwrap().len(), 1);
}

#[test]
fn formats_paths_and_cache_integrity_fail_closed() {
    let temp = fixture(
        "plugin.json",
        json!({"$schema":"https://agent-plugins.org/schemas/99/plugin.schema.json","name":"sample"}),
    );
    write(
        temp.path(),
        "pkg/.claude-plugin/plugin.json",
        r#"{"name":"sample"}"#,
    );
    assert_eq!(open(&temp).list().unwrap().data.len(), 0);
    let temp = fixture(".zcode-plugin/plugin.json", json!({"name":"sample"}));
    let list = open(&temp).list().unwrap();
    assert_eq!(list.data.len(), 0);
    assert!(
        list.errors
            .join(" ")
            .contains("unsupported .zcode-plugin manifest")
    );
    for key in ["commands", "agents"] {
        let mut manifest = json!({"name":"sample"});
        manifest[key] = json!(["../escape.md"]);
        let temp = fixture(".claude-plugin/plugin.json", manifest);
        assert_eq!(open(&temp).list().unwrap().data.len(), 0);
    }
    let temp = fixture("plugin.json", portable(json!({})));
    let store = open(&temp);
    let detail = install(&store);
    #[cfg(unix)]
    {
        let cache = temp
            .path()
            .join("state/cache")
            .join(detail["installedDigest"].as_str().unwrap())
            .join("plugin.json");
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&cache, fs::Permissions::from_mode(0o644)).unwrap();
        fs::write(&cache, "{}").unwrap();
        assert!(open(&temp).read(ID).is_err());
        assert!(open(&temp).enabled_revisions().is_err());
    }
}

#[test]
fn unresolved_remote_report_is_unknown_and_implicit_unsupported_files_are_visible() {
    let temp = fixture("plugin.json", portable(json!({})));
    write(temp.path(), "pkg/commands/one.md", "opaque");
    write(temp.path(), "pkg/agents/one.md", "opaque");
    let detail = read(&open(&temp));
    let report = rows(&detail, "componentSupport");
    for kind in ["commands", "agents"] {
        assert_eq!(report.iter().filter(|row| row["kind"] == kind).count(), 1);
    }
    write(temp.path(),".agents/plugins/marketplace.json",&json!({"name":"local","plugins":[{"name":"sample","source":{"source":"git","url":"https://invalid.example/package.git"}}]}).to_string());
    let detail = read(&open(&temp));
    assert_eq!(detail["sourceDigest"], "");
    assert_eq!(detail["componentSupport"], Value::Null);
}
