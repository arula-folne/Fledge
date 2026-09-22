//! Modrinth `.mrpack` helpers.

use crate::error::{CoreError, CoreResult};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::io::{Cursor, Read, Write};
use std::path::{Path, PathBuf};
use zip::ZipArchive;

#[derive(Debug, Clone)]
pub struct MrpackIndexFile {
    pub path: String,
    pub hashes_sha1: Option<String>,
    pub hashes_sha512: Option<String>,
    pub env: Option<Value>,
    pub downloads: Vec<String>,
    pub file_size: Option<u64>,
}

#[derive(Debug, Clone)]
pub struct MrpackIndex {
    pub name: Option<String>,
    #[allow(dead_code)]
    pub summary: Option<String>,
    pub files: Vec<MrpackIndexFile>,
    pub dependencies: HashMap<String, String>,
}

pub fn unzip_to_entries(bytes: &[u8]) -> CoreResult<HashMap<String, Vec<u8>>> {
    let cursor = Cursor::new(bytes);
    let mut archive = ZipArchive::new(cursor).map_err(|e| CoreError::msg(e.to_string()))?;
    let mut out = HashMap::new();
    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| CoreError::msg(e.to_string()))?;
        if file.is_dir() {
            continue;
        }
        let name = file.name().replace('\\', "/").to_string();
        let mut data = Vec::new();
        file.read_to_end(&mut data)?;
        out.insert(name, data);
    }
    Ok(out)
}

pub fn parse_mrpack_index(entries: &HashMap<String, Vec<u8>>) -> CoreResult<MrpackIndex> {
    let raw = entries
        .get("modrinth.index.json")
        .ok_or_else(|| CoreError::msg("modrinth.index.json が見つかりません"))?;
    let json: Value = serde_json::from_slice(raw)?;
    if let Some(v) = json.get("formatVersion").and_then(|v| v.as_u64()) {
        if v != 1 {
            return Err(CoreError::msg(format!(
                "未対応の mrpack formatVersion です: {v}"
            )));
        }
    }
    if let Some(game) = json.get("game").and_then(|v| v.as_str()) {
        if game != "minecraft" {
            return Err(CoreError::msg(format!(
                "Minecraft 用ではない mrpack です: {game}"
            )));
        }
    }
    let files_raw = json
        .get("files")
        .and_then(|v| v.as_array())
        .ok_or_else(|| CoreError::msg("不正な mrpack です"))?;
    let mut files = Vec::new();
    for file in files_raw {
        let path = file
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| CoreError::msg("mrpack のファイル情報が不正です"))?
            .to_string();
        let downloads: Vec<String> = file
            .get("downloads")
            .and_then(|v| v.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();
        if downloads.is_empty() {
            return Err(CoreError::msg("mrpack のファイル情報が不正です"));
        }
        files.push(MrpackIndexFile {
            path,
            hashes_sha1: file
                .pointer("/hashes/sha1")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            hashes_sha512: file
                .pointer("/hashes/sha512")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            env: file.get("env").cloned(),
            downloads,
            file_size: file.get("fileSize").and_then(|v| v.as_u64()),
        });
    }
    let mut dependencies = HashMap::new();
    if let Some(deps) = json.get("dependencies").and_then(|v| v.as_object()) {
        for (k, v) in deps {
            if let Some(s) = v.as_str() {
                dependencies.insert(k.clone(), s.to_string());
            }
        }
    }
    Ok(MrpackIndex {
        name: json
            .get("name")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        summary: json
            .get("summary")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        files,
        dependencies,
    })
}

pub fn client_files(index: &MrpackIndex) -> Vec<&MrpackIndexFile> {
    index
        .files
        .iter()
        .filter(|f| {
            let client = f
                .env
                .as_ref()
                .and_then(|e| e.get("client"))
                .and_then(|v| v.as_str())
                .unwrap_or("required");
            client != "unsupported"
        })
        .collect()
}

pub fn loader_from_mrpack(index: &MrpackIndex, version_loaders: &[String]) -> String {
    let deps = &index.dependencies;
    if deps.contains_key("fabric-loader") || version_loaders.iter().any(|l| l == "fabric") {
        return "fabric".into();
    }
    if deps.contains_key("quilt-loader") || version_loaders.iter().any(|l| l == "quilt") {
        return "quilt".into();
    }
    if deps.contains_key("neoforge") || version_loaders.iter().any(|l| l == "neoforge") {
        return "neoforge".into();
    }
    if deps.contains_key("forge") || version_loaders.iter().any(|l| l == "forge") {
        return "forge".into();
    }
    "vanilla".into()
}

pub fn minecraft_from_mrpack(index: &MrpackIndex, fallback: &[String]) -> Option<String> {
    index
        .dependencies
        .get("minecraft")
        .cloned()
        .or_else(|| fallback.first().cloned())
}

pub fn loader_version_from_mrpack(index: &MrpackIndex, loader: &str) -> Option<String> {
    let deps = &index.dependencies;
    match loader {
        "fabric" => deps.get("fabric-loader").cloned(),
        "quilt" => deps.get("quilt-loader").cloned(),
        "neoforge" => deps.get("neoforge").cloned(),
        "forge" => deps.get("forge").cloned(),
        _ => None,
    }
}

pub fn project_id_from_download_url(url: &str, file_path: &str) -> String {
    if let Some(cap) = extract_after(url, "cdn.modrinth.com/data/") {
        let id = cap.split('/').next().unwrap_or("");
        if !id.is_empty() {
            return id.to_string();
        }
    }
    format!("pack:{}", file_path.replace('\\', "/"))
}

pub fn version_id_from_download_url(url: &str) -> Option<String> {
    let after = extract_after(url, "cdn.modrinth.com/data/")?;
    let mut parts = after.split('/');
    let _ = parts.next()?;
    if parts.next() != Some("versions") {
        return None;
    }
    parts.next().map(|s| s.to_string())
}

pub fn pack_file_category(file_path: &str) -> String {
    let lower = file_path.replace('\\', "/").to_lowercase();
    if lower.starts_with("mods/") {
        "mod".into()
    } else if lower.starts_with("resourcepacks/") {
        "resourcepack".into()
    } else if lower.starts_with("shaderpacks/") {
        "shader".into()
    } else if lower.contains("datapacks/") {
        "datapack".into()
    } else {
        "mod".into()
    }
}

pub fn write_mrpack_overrides(
    instance_dir: &Path,
    entries: &HashMap<String, Vec<u8>>,
) -> CoreResult<()> {
    let prefixes = ["overrides/", "client-overrides/"];
    let root = instance_dir
        .canonicalize()
        .unwrap_or_else(|_| instance_dir.to_path_buf());
    for (name, data) in entries {
        let normalized = name.replace('\\', "/");
        let Some(prefix) = prefixes.iter().find(|p| normalized.starts_with(*p)) else {
            continue;
        };
        let rel = &normalized[prefix.len()..];
        if rel.is_empty() || rel.ends_with('/') || rel.split('/').any(|p| p == "..") {
            continue;
        }
        let dest = instance_dir.join(rel);
        let resolved = dest.canonicalize().unwrap_or_else(|_| dest.clone());
        if resolved != root && !resolved.starts_with(&root) {
            // may not exist yet — check parent path safety via components
            if rel.split('/').any(|p| p == "..") {
                continue;
            }
        }
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&dest, data)?;
    }
    Ok(())
}

pub fn write_zip_entries(destination: &Path, entries: &HashMap<String, Vec<u8>>) -> CoreResult<()> {
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)?;
    }
    let tmp = destination.with_extension(format!(
        "part-{}",
        uuid::Uuid::new_v4()
    ));
    let file = fs::File::create(&tmp)?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    let mut names: Vec<_> = entries.keys().cloned().collect();
    names.sort();
    for name in names {
        let data = &entries[&name];
        zip.start_file(name, options)
            .map_err(|e| CoreError::msg(e.to_string()))?;
        zip.write_all(data)?;
    }
    zip.finish().map_err(|e| CoreError::msg(e.to_string()))?;
    let _ = fs::remove_file(destination);
    fs::rename(&tmp, destination).or_else(|_| {
        fs::copy(&tmp, destination)?;
        fs::remove_file(&tmp)?;
        Ok::<(), std::io::Error>(())
    })?;
    Ok(())
}

pub fn safe_instance_path(instance_dir: &Path, rel: &str) -> Option<PathBuf> {
    let normalized = rel.replace('\\', "/").trim_start_matches('/').to_string();
    if normalized.is_empty() || normalized.ends_with('/') || normalized.contains("..") {
        return None;
    }
    let dest = instance_dir.join(&normalized);
    let root = instance_dir
        .canonicalize()
        .unwrap_or_else(|_| instance_dir.to_path_buf());
    // Dest may not exist; check component-wise
    let mut check = root.clone();
    for part in Path::new(&normalized).components() {
        use std::path::Component;
        match part {
            Component::Normal(p) => check.push(p),
            Component::CurDir => {}
            _ => return None,
        }
    }
    if check.starts_with(&root) {
        Some(dest)
    } else {
        None
    }
}

fn extract_after<'a>(haystack: &'a str, needle: &str) -> Option<&'a str> {
    let lower = haystack.to_ascii_lowercase();
    let needle_l = needle.to_ascii_lowercase();
    let idx = lower.find(&needle_l)?;
    Some(&haystack[idx + needle.len()..])
}
