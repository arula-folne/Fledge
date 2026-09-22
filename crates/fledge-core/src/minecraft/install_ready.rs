//! Ready markers and version completeness checks (ports `installReady.ts`).

use crate::error::CoreResult;
use crate::minecraft::resolve::{library_artifact_rel_path, load_resolved_version, ResolvedVersion};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadyRecord {
    pub version_id: String,
    pub minecraft_version: String,
    pub loader: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loader_version: Option<String>,
    pub ready_at: String,
}

fn ready_dir(minecraft_root: &Path) -> PathBuf {
    minecraft_root.join(".fledge-ready")
}

pub fn ready_key(minecraft_version: &str, loader: &str, loader_version: Option<&str>) -> String {
    let loader_version = if loader == "vanilla" {
        String::new()
    } else {
        loader_version.unwrap_or("default").to_string()
    };
    format!("{minecraft_version}__{loader}__{loader_version}")
}

fn ready_path(
    minecraft_root: &Path,
    minecraft_version: &str,
    loader: &str,
    loader_version: Option<&str>,
) -> PathBuf {
    let safe = ready_key(minecraft_version, loader, loader_version)
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect::<String>();
    ready_dir(minecraft_root).join(format!("{safe}.json"))
}

pub fn natives_root(minecraft_root: &Path, version_id: &str) -> PathBuf {
    let safe: String = version_id
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect();
    minecraft_root.join("natives").join(safe)
}

pub fn version_json_exists(minecraft_root: &Path, version_id: &str) -> bool {
    minecraft_root
        .join("versions")
        .join(version_id)
        .join(format!("{version_id}.json"))
        .is_file()
}

fn file_exists(path: &Path) -> bool {
    path.is_file()
}

/// Version JSON plus client jar and libraries are present.
pub fn is_version_complete(minecraft_root: &Path, version_id: &str) -> bool {
    if !version_json_exists(minecraft_root, version_id) {
        return false;
    }
    let resolved = match load_resolved_version(minecraft_root, version_id) {
        Ok(v) => v,
        Err(_) => return false,
    };
    let jar_id = resolved
        .jar
        .as_deref()
        .or(resolved.minecraft_version.as_deref())
        .unwrap_or(version_id);
    let jar_path = minecraft_root
        .join("versions")
        .join(jar_id)
        .join(format!("{jar_id}.jar"));
    if !file_exists(&jar_path) {
        return false;
    }
    for lib in &resolved.libraries {
        let Some(rel) = library_artifact_rel_path(lib) else {
            continue;
        };
        if !file_exists(&minecraft_root.join("libraries").join(&rel)) {
            return false;
        }
    }
    true
}

/// Expected version ids for ready detection.
pub fn expected_version_ids(
    minecraft_version: &str,
    loader: &str,
    loader_version: Option<&str>,
) -> Vec<String> {
    let mc = minecraft_version;
    if loader == "vanilla" {
        return vec![mc.to_string()];
    }
    let Some(lv) = loader_version else {
        return vec![];
    };
    match loader {
        "fabric" => vec![
            format!("{mc}-fabric{lv}"),
            format!("fabric-loader-{lv}-{mc}"),
        ],
        "quilt" => vec![
            format!("{mc}-quilt{lv}"),
            format!("quilt-loader-{lv}-{mc}"),
        ],
        "forge" => vec![format!("{mc}-forge-{lv}")],
        "neoforge" => vec![format!("{mc}-neoforge-{lv}"), format!("neoforge-{lv}")],
        _ => vec![],
    }
}

pub fn find_installed_version_id(
    minecraft_root: &Path,
    minecraft_version: &str,
    loader: &str,
    loader_version: Option<&str>,
) -> Option<String> {
    if let Ok(raw) = fs::read_to_string(ready_path(
        minecraft_root,
        minecraft_version,
        loader,
        loader_version,
    )) {
        if let Ok(parsed) = serde_json::from_str::<ReadyRecord>(&raw) {
            if !parsed.version_id.is_empty()
                && version_json_exists(minecraft_root, &parsed.version_id)
            {
                return Some(parsed.version_id);
            }
        }
    }
    for id in expected_version_ids(minecraft_version, loader, loader_version) {
        if version_json_exists(minecraft_root, &id) {
            return Some(id);
        }
    }
    None
}

pub fn find_ready_version_id(
    minecraft_root: &Path,
    minecraft_version: &str,
    loader: &str,
    loader_version: Option<&str>,
) -> Option<String> {
    if let Ok(raw) = fs::read_to_string(ready_path(
        minecraft_root,
        minecraft_version,
        loader,
        loader_version,
    )) {
        if let Ok(parsed) = serde_json::from_str::<ReadyRecord>(&raw) {
            if !parsed.version_id.is_empty()
                && is_version_complete(minecraft_root, &parsed.version_id)
            {
                return Some(parsed.version_id);
            }
        }
    }
    for id in expected_version_ids(minecraft_version, loader, loader_version) {
        if is_version_complete(minecraft_root, &id) {
            return Some(id);
        }
    }
    None
}

pub fn write_ready_record(
    minecraft_root: &Path,
    minecraft_version: &str,
    loader: &str,
    loader_version: Option<&str>,
    version_id: &str,
) -> CoreResult<()> {
    fs::create_dir_all(ready_dir(minecraft_root))?;
    let record = ReadyRecord {
        version_id: version_id.to_string(),
        minecraft_version: minecraft_version.to_string(),
        loader: loader.to_string(),
        loader_version: loader_version.map(|s| s.to_string()),
        ready_at: chrono::Utc::now().to_rfc3339(),
    };
    let path = ready_path(minecraft_root, minecraft_version, loader, loader_version);
    fs::write(path, serde_json::to_string_pretty(&record)?)?;
    Ok(())
}

pub fn profile_fields(profile: &Value) -> Option<(String, String, Option<String>)> {
    let mc = profile.get("minecraftVersion")?.as_str()?.to_string();
    let loader = profile
        .get("loader")
        .and_then(|v| v.as_str())
        .unwrap_or("vanilla")
        .to_string();
    let lv = profile
        .get("loaderVersion")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    Some((mc, loader, lv))
}

/// Convenience: jar id used by a resolved version.
pub fn jar_id_of(resolved: &ResolvedVersion, fallback: &str) -> String {
    resolved
        .jar
        .clone()
        .or_else(|| resolved.minecraft_version.clone())
        .unwrap_or_else(|| fallback.to_string())
}
