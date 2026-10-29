use crate::{ComponentKind, package};
use anyhow::{Context, Result, ensure};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ComponentIdentity {
    pub plugin_id: String,
    pub component_id: String,
    pub installed_digest: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct InstalledCommand {
    pub identity: ComponentIdentity,
    pub name: String,
    pub description: String,
    pub argument_hint: Option<String>,
    pub body: String,
}
impl InstalledCommand {
    pub fn expand(&self, arguments: &str) -> Result<String> {
        ensure!(
            arguments.len() <= 64 * 1024,
            "command arguments exceed 64 KiB"
        );
        let mut result = String::new();
        let mut rest = self.body.as_str();
        let mut substituted = false;
        while let Some(index) = rest.find("$ARGUMENTS") {
            result.push_str(&rest[..index]);
            result.push_str(arguments);
            rest = &rest[index + "$ARGUMENTS".len()..];
            substituted = true;
        }
        result.push_str(rest);
        if !substituted && !arguments.is_empty() {
            result.push_str("\n\n");
            result.push_str(arguments);
        }
        Ok(result)
    }
}
#[derive(Clone, Debug, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct InstalledAgent {
    pub identity: ComponentIdentity,
    pub name: String,
    pub description: String,
    pub instructions: String,
    pub model: Option<String>,
    pub tool_allowlist: Option<Vec<String>>,
    pub read_only: bool,
    pub approval_tools: Vec<String>,
}
pub(crate) struct TemplateSelection {
    pub commands: Vec<InstalledCommand>,
    pub agents: Vec<InstalledAgent>,
    pub reports: Vec<(ComponentKind, String, Option<&'static str>)>,
}
fn markdown(text: &str) -> Result<(serde_json::Map<String, Value>, String)> {
    ensure!(text.len() <= 256 * 1024, "template exceeds 256 KiB");
    let Some(rest) = text.strip_prefix("---\n") else {
        return Ok((Default::default(), text.into()));
    };
    let end = rest
        .find("\n---\n")
        .context("unterminated template frontmatter")?;
    ensure!(end <= 32768, "template frontmatter exceeds 32 KiB");
    let metadata: Value = serde_yaml_ng::from_str(&rest[..end])?;
    Ok((
        metadata
            .as_object()
            .context("template frontmatter must be an object")?
            .clone(),
        rest[end + 5..].into(),
    ))
}
fn optional_text(metadata: &serde_json::Map<String, Value>, key: &str) -> Result<Option<String>> {
    metadata
        .get(key)
        .map(|v| {
            v.as_str()
                .map(str::to_owned)
                .context("template field must be a string")
        })
        .transpose()
}
fn paths(
    files: &package::Files,
    declaration: Option<&Value>,
    directory: &str,
    defaults: bool,
) -> Result<Vec<String>> {
    let mut roots = Vec::new();
    if defaults || declaration.is_none() {
        roots.push(directory.to_owned());
    }
    if let Some(value) = declaration {
        match value {
            Value::String(path) => roots.push(package::relative(path)?),
            Value::Array(values) => {
                for value in values {
                    roots.push(package::relative(
                        value.as_str().context("template path must be a string")?,
                    )?);
                }
            }
            _ => anyhow::bail!("template declaration must be paths"),
        }
    }
    let mut result = std::collections::BTreeSet::new();
    for root in roots {
        if files.contains_key(&root) {
            result.insert(root);
        } else {
            result.extend(
                files
                    .keys()
                    .filter(|p| p.starts_with(&format!("{root}/")) && p.ends_with(".md"))
                    .cloned(),
            );
        }
    }
    Ok(result.into_iter().collect())
}
pub(crate) fn discover(
    files: &package::Files,
    overlay: &Value,
    claude_defaults: bool,
    id: &str,
    digest: &str,
) -> TemplateSelection {
    let mut result = TemplateSelection {
        commands: vec![],
        agents: vec![],
        reports: vec![],
    };
    for (kind, directory) in [
        (ComponentKind::Commands, "commands"),
        (ComponentKind::Agents, "agents"),
    ] {
        let selected = match paths(files, overlay.get(directory), directory, claude_defaults) {
            Ok(paths) => paths,
            Err(_) => {
                result.reports.push((
                    kind,
                    directory.into(),
                    Some("templateDeclarationUnsupported"),
                ));
                continue;
            }
        };
        for path in selected {
            let parsed = (|| -> Result<()> {
                ensure!(path.ends_with(".md"), "template must be Markdown");
                let text =
                    std::str::from_utf8(&files.get(&path).context("template missing")?.bytes)?;
                let (metadata, body) = markdown(text)?;
                ensure!(
                    !body.contains("!`") && !body.contains("$(") && !body.contains("${"),
                    "template execution or interpolation is unsupported"
                );
                ensure!(
                    !body
                        .as_bytes()
                        .windows(2)
                        .any(|w| w[0] == b'$' && w[1].is_ascii_digit()),
                    "positional parameters are unsupported"
                );
                let supported = if kind == ComponentKind::Commands {
                    &["description", "argument-hint"][..]
                } else {
                    &["name", "description", "model", "tools"][..]
                };
                ensure!(
                    metadata.keys().all(|key| supported.contains(&key.as_str())),
                    "template frontmatter is unsupported"
                );
                let stem = path
                    .strip_suffix(".md")
                    .unwrap()
                    .strip_prefix(&format!("{directory}/"))
                    .unwrap_or(path.strip_suffix(".md").unwrap())
                    .replace('/', ":");
                let plugin_name = id.split('@').next().unwrap_or(id);
                let name = format!("{plugin_name}:{stem}");
                let identity = ComponentIdentity {
                    plugin_id: id.into(),
                    component_id: path.clone(),
                    installed_digest: digest.into(),
                };
                let description = optional_text(&metadata, "description")?.unwrap_or_default();
                if kind == ComponentKind::Commands {
                    result.commands.push(InstalledCommand {
                        identity,
                        name,
                        description,
                        argument_hint: optional_text(&metadata, "argument-hint")?,
                        body,
                    });
                } else {
                    let model = optional_text(&metadata, "model")?;
                    let tool_allowlist = optional_text(&metadata, "tools")?.map(|tools| {
                        tools
                            .split(',')
                            .map(|tool| tool.trim().to_owned())
                            .collect::<Vec<_>>()
                    });
                    if let Some(tools) = &tool_allowlist {
                        ensure!(
                            tools
                                .iter()
                                .all(|tool| !tool.is_empty() && tool.len() <= 256),
                            "invalid agent tools"
                        );
                    }
                    result.agents.push(InstalledAgent {
                        identity,
                        name,
                        description,
                        instructions: body,
                        model,
                        tool_allowlist,
                        read_only: false,
                        approval_tools: vec![],
                    });
                }
                Ok(())
            })();
            result.reports.push((
                kind,
                path,
                parsed.err().map(|_| "templateSemanticsUnsupported"),
            ));
        }
    }
    result
}
