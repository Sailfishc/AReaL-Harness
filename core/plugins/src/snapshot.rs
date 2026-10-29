use crate::{PluginDetail, PluginList, Store};
use anyhow::{Context, Result, ensure};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Clone, Debug, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PluginReadScope {
    User,
    Project { workspace: PathBuf },
}
#[derive(Clone, Debug, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PluginStoreSnapshot {
    pub revision: u64,
    pub scope: PluginReadScope,
    pub observed_at: u64,
    pub runtime_observed: bool,
    pub list: PluginList,
    pub detail: Option<PluginDetail>,
}
#[derive(Clone, Debug, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PluginDoctorReport {
    pub revision: u64,
    pub scope: PluginReadScope,
    pub observed_at: u64,
    pub runtime_observed: bool,
    pub data: Vec<PluginDoctorEntry>,
    pub errors: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PluginDoctorEntry {
    pub id: String,
    pub installed: bool,
    pub enabled: bool,
    pub installed_digest: Option<String>,
    pub candidate_digest: String,
    pub compatibility: Option<crate::ComponentCompatibility>,
    pub next_action: String,
}
impl Store {
    pub fn read_snapshot(
        root: PathBuf,
        workspace: Option<PathBuf>,
        user_home: Option<PathBuf>,
        selected_plugin_id: Option<&str>,
    ) -> Result<PluginStoreSnapshot> {
        ensure!(root.is_absolute(), "plugin root must be absolute");
        let workspace = workspace
            .map(|path| -> Result<PathBuf> {
                ensure!(path.is_absolute(), "workspace must be absolute");
                let path = path.canonicalize()?;
                ensure!(path.is_dir(), "workspace must be a directory");
                Ok(path)
            })
            .transpose()?;
        let scope = workspace
            .as_ref()
            .map(|workspace| PluginReadScope::Project {
                workspace: workspace.clone(),
            })
            .unwrap_or(PluginReadScope::User);
        let store = Self {
            component_cache: Default::default(),
            #[cfg(test)]
            component_reads: Default::default(),
            workspace: workspace.clone().unwrap_or_default(),
            root,
            user_home,
            discovery_workspaces: Some(workspace.into_iter().collect()),
        };
        let list = store.list()?;
        let detail = selected_plugin_id
            .map(|id| {
                list.data
                    .iter()
                    .find(|detail| detail.id == id)
                    .cloned()
                    .ok_or_else(|| anyhow::Error::from(crate::StoreError::NotFound(id.into())))
            })
            .transpose()?;
        let observed_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .context("system clock predates Unix epoch")?
            .as_millis()
            .try_into()?;
        Ok(PluginStoreSnapshot {
            revision: list.revision,
            scope,
            observed_at,
            runtime_observed: false,
            list,
            detail,
        })
    }
}
impl PluginStoreSnapshot {
    pub fn doctor(&self) -> PluginDoctorReport {
        PluginDoctorReport {
            revision: self.revision,
            scope: self.scope.clone(),
            observed_at: self.observed_at,
            runtime_observed: false,
            data: self
                .list
                .data
                .iter()
                .map(|detail| {
                    let support = detail
                        .installed_component_support
                        .as_ref()
                        .or(detail.component_support.as_ref());
                    let blocked = support.is_some_and(|support| !support.allowed());
                    PluginDoctorEntry {
                        id: detail.id.clone(),
                        installed: detail.installed,
                        enabled: detail.enabled,
                        installed_digest: detail.installed_digest.clone(),
                        candidate_digest: detail.review_digest().into(),
                        compatibility: support.map(|support| support.compatibility.clone()),
                        next_action: if blocked {
                            "inspectCompatibility"
                        } else if !detail.installed {
                            "install"
                        } else if !detail.enabled {
                            "enable"
                        } else {
                            "observeRuntime"
                        }
                        .into(),
                    }
                })
                .collect(),
            errors: self.list.errors.clone(),
        }
    }
}
