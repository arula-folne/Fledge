use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Two-layer layout matching 0.4.x (`packages/core/src/app/paths.ts`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PathLayout {
    pub root: String,
    pub data: String,
    pub settings: String,
    pub accounts: String,
    pub cache: String,
    pub minecraft: String,
    pub java: String,
    pub logs: String,
    pub news: String,
    pub temp: String,
    pub instances: String,
    pub skins: String,
}

pub fn resolve_path_layout(root: &Path, settings_root: &Path) -> PathLayout {
    let root_s = root.to_string_lossy().into_owned();
    let settings_root_s = settings_root.to_string_lossy().into_owned();
    PathLayout {
        root: root_s.clone(),
        data: root_s.clone(),
        settings: PathBuf::from(&settings_root_s)
            .join("Settings")
            .to_string_lossy()
            .into_owned(),
        accounts: PathBuf::from(&settings_root_s)
            .join("Accounts")
            .to_string_lossy()
            .into_owned(),
        cache: PathBuf::from(&root_s)
            .join("caches")
            .to_string_lossy()
            .into_owned(),
        minecraft: PathBuf::from(&root_s)
            .join("meta")
            .to_string_lossy()
            .into_owned(),
        java: PathBuf::from(&root_s)
            .join("meta")
            .join("java")
            .to_string_lossy()
            .into_owned(),
        logs: PathBuf::from(&settings_root_s)
            .join("logs")
            .to_string_lossy()
            .into_owned(),
        news: PathBuf::from(&settings_root_s)
            .join("news")
            .to_string_lossy()
            .into_owned(),
        temp: PathBuf::from(&root_s)
            .join("temp")
            .to_string_lossy()
            .into_owned(),
        skins: PathBuf::from(&root_s)
            .join("skins")
            .to_string_lossy()
            .into_owned(),
        instances: PathBuf::from(&root_s)
            .join("instances")
            .to_string_lossy()
            .into_owned(),
    }
}

pub fn ensure_path_layout(layout: &PathLayout) -> std::io::Result<()> {
    let dirs = [
        &layout.settings,
        &layout.accounts,
        &layout.cache,
        &layout.minecraft,
        &layout.java,
        &layout.logs,
        &layout.news,
        &layout.temp,
        &layout.skins,
        &layout.instances,
    ];
    for dir in dirs {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::create_dir_all(PathBuf::from(&layout.minecraft).join("assets"))?;
    std::fs::create_dir_all(PathBuf::from(&layout.minecraft).join("libraries"))?;
    std::fs::create_dir_all(PathBuf::from(&layout.minecraft).join("versions"))?;
    Ok(())
}

pub fn default_config_root(dev_root: Option<&Path>) -> PathBuf {
    if let Ok(env) = std::env::var("FLEDGE_ROOT") {
        let p = PathBuf::from(env);
        if !p.as_os_str().is_empty() {
            return p;
        }
    }
    if let Some(dev) = dev_root {
        return dev.join("data");
    }
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|p| p.join("data")))
        .unwrap_or_else(|| PathBuf::from("data"))
}

/// settingsRoot: `%APPDATA%/fledge` in production, or `FLEDGE_SETTINGS_ROOT` / dev `.fledge-root`.
pub fn default_settings_root(dev_root: Option<&Path>) -> PathBuf {
    if let Ok(env) = std::env::var("FLEDGE_SETTINGS_ROOT") {
        let p = PathBuf::from(env);
        if !p.as_os_str().is_empty() {
            return p;
        }
    }
    if let Some(dev) = dev_root {
        return dev.to_path_buf();
    }
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("fledge")
}
