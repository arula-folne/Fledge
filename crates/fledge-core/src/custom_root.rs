use crate::error::CoreResult;
use serde_json::json;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct CustomRootState {
    pub settings_root: PathBuf,
    pub default_config_root: PathBuf,
    pub active_config_root: PathBuf,
    pub configured_config_root: PathBuf,
    pub is_custom: bool,
}

impl CustomRootState {
    pub fn resolve(settings_root: &Path, default_config_root: &Path) -> Self {
        let configured = read_custom_root(settings_root)
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or_else(|| default_config_root.to_path_buf());
        let is_custom = configured != *default_config_root;
        Self {
            settings_root: settings_root.to_path_buf(),
            default_config_root: default_config_root.to_path_buf(),
            active_config_root: configured.clone(),
            configured_config_root: configured,
            is_custom,
        }
    }

    pub fn info_json(&self, restart_required: bool) -> serde_json::Value {
        json!({
          "configured": self.configured_config_root.to_string_lossy(),
          "active": self.active_config_root.to_string_lossy(),
          "defaultPath": self.default_config_root.to_string_lossy(),
          "isCustom": self.is_custom,
          "restartRequired": restart_required
        })
    }

    /// Persist pointer. Active path stays until process restart (matches 0.4.x).
    pub fn set_directory(&mut self, next: Option<&str>) -> CoreResult<serde_json::Value> {
        let default = self.default_config_root.clone();
        let configured = match next {
            None => {
                clear_custom_root(&self.settings_root)?;
                default.clone()
            }
            Some(path) => {
                let trimmed = path.trim();
                if trimmed.is_empty() {
                    return Err(crate::error::CoreError::msg("path must be a non-empty string"));
                }
                let resolved = PathBuf::from(trimmed);
                if resolved == default {
                    clear_custom_root(&self.settings_root)?;
                    default.clone()
                } else {
                    write_custom_root(&self.settings_root, &resolved)?;
                    resolved
                }
            }
        };
        let restart_required = configured != self.active_config_root;
        self.configured_config_root = configured.clone();
        self.is_custom = configured != default;
        write_install_pointer(&self.active_config_root, &configured)?;
        Ok(json!({
          "configured": configured.to_string_lossy(),
          "active": self.active_config_root.to_string_lossy(),
          "defaultPath": default.to_string_lossy(),
          "isCustom": self.is_custom,
          "restartRequired": restart_required
        }))
    }
}

fn custom_root_file(settings_root: &Path) -> PathBuf {
    settings_root.join("custom-root.json")
}

fn read_custom_root(settings_root: &Path) -> Option<PathBuf> {
    let file = custom_root_file(settings_root);
    let raw = fs::read_to_string(file).ok()?;
    let parsed: serde_json::Value = serde_json::from_str(&raw).ok()?;
    parsed
        .get("root")
        .and_then(|v| v.as_str())
        .map(PathBuf::from)
}

fn write_custom_root(settings_root: &Path, root: &Path) -> CoreResult<()> {
    fs::create_dir_all(settings_root)?;
    let payload = json!({ "root": root.to_string_lossy() });
    fs::write(
        custom_root_file(settings_root),
        serde_json::to_string_pretty(&payload)?,
    )?;
    Ok(())
}

fn clear_custom_root(settings_root: &Path) -> CoreResult<()> {
    let file = custom_root_file(settings_root);
    if file.exists() {
        fs::remove_file(file)?;
    }
    Ok(())
}

fn write_install_pointer(active_config_root: &Path, configured: &Path) -> CoreResult<()> {
    // Redundant pointer beside active data root (0.4.x data-root.json)
    let parent = active_config_root;
    if parent.exists() || fs::create_dir_all(parent).is_ok() {
        let pointer = parent.join("data-root.json");
        let payload = json!({ "root": configured.to_string_lossy() });
        let _ = fs::write(pointer, serde_json::to_string_pretty(&payload)?);
    }
    Ok(())
}
