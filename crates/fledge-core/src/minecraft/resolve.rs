//! Version JSON resolve / merge (inheritsFrom) and library/argument parsing.

use crate::error::{CoreError, CoreResult};
use serde_json::{json, Map, Value};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct AssetIndexInfo {
    pub id: String,
    pub url: String,
    pub sha1: Option<String>,
    pub total_size: Option<u64>,
}

#[derive(Debug, Clone)]
pub struct ResolvedLibrary {
    /// Original library JSON object.
    pub raw: Value,
    pub name: Option<String>,
    pub artifact_path: Option<String>,
    pub artifact_url: Option<String>,
    pub artifact_sha1: Option<String>,
    /// Native classifier jar (windows), if any.
    pub native_path: Option<String>,
    pub native_url: Option<String>,
    pub native_sha1: Option<String>,
    pub is_native_only: bool,
}

#[derive(Debug, Clone)]
pub struct ResolvedVersion {
    pub id: String,
    pub jar: Option<String>,
    pub minecraft_version: Option<String>,
    pub main_class: String,
    pub asset_index: Option<AssetIndexInfo>,
    pub assets: Option<String>,
    pub libraries: Vec<ResolvedLibrary>,
    pub jvm_args: Vec<String>,
    pub game_args: Vec<String>,
    pub version_type: Option<String>,
    /// Merged raw JSON (for debugging / javaVersion).
    pub raw: Value,
}

pub fn version_json_path(minecraft_root: &Path, version_id: &str) -> PathBuf {
    minecraft_root
        .join("versions")
        .join(version_id)
        .join(format!("{version_id}.json"))
}

pub fn load_version_json(minecraft_root: &Path, version_id: &str) -> CoreResult<Value> {
    let path = version_json_path(minecraft_root, version_id);
    let raw = fs::read_to_string(&path).map_err(|e| {
        CoreError::msg(format!(
            "version json missing {}: {e}",
            path.display()
        ))
    })?;
    Ok(serde_json::from_str(&raw)?)
}

pub fn load_resolved_version(minecraft_root: &Path, version_id: &str) -> CoreResult<ResolvedVersion> {
    let merged = merge_version_json(minecraft_root, version_id, &mut HashSet::new())?;
    parse_resolved(merged)
}

fn merge_version_json(
    minecraft_root: &Path,
    version_id: &str,
    visiting: &mut HashSet<String>,
) -> CoreResult<Value> {
    if !visiting.insert(version_id.to_string()) {
        return Err(CoreError::msg(format!(
            "circular inheritsFrom at {version_id}"
        )));
    }
    let mut child = load_version_json(minecraft_root, version_id)?;
    let inherits = child
        .get("inheritsFrom")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    if let Some(parent_id) = inherits {
        let parent = merge_version_json(minecraft_root, &parent_id, visiting)?;
        child = deep_merge_version(parent, child);
    }
    Ok(child)
}

/// Parent base, child overrides. Libraries concatenate; arguments concatenate.
fn deep_merge_version(parent: Value, child: Value) -> Value {
    let mut out = parent;
    let Some(child_obj) = child.as_object() else {
        return child;
    };
    let out_obj = out.as_object_mut().unwrap();

    for (key, value) in child_obj {
        match key.as_str() {
            "libraries" => {
                let mut libs = out_obj
                    .get("libraries")
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default();
                if let Some(extra) = value.as_array() {
                    libs.extend(extra.iter().cloned());
                }
                out_obj.insert("libraries".into(), Value::Array(libs));
            }
            "arguments" => {
                let mut args = out_obj
                    .get("arguments")
                    .cloned()
                    .unwrap_or_else(|| json!({}));
                merge_arguments(&mut args, value);
                out_obj.insert("arguments".into(), args);
            }
            "inheritsFrom" => {
                out_obj.remove("inheritsFrom");
            }
            _ => {
                out_obj.insert(key.clone(), value.clone());
            }
        }
    }
    out
}

fn merge_arguments(base: &mut Value, child: &Value) {
    let base_obj = match base.as_object_mut() {
        Some(o) => o,
        None => {
            *base = child.clone();
            return;
        }
    };
    let Some(child_obj) = child.as_object() else {
        return;
    };
    for key in ["jvm", "game"] {
        let mut list = base_obj
            .get(key)
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        if let Some(extra) = child_obj.get(key).and_then(|v| v.as_array()) {
            list.extend(extra.iter().cloned());
        }
        base_obj.insert(key.to_string(), Value::Array(list));
    }
}

fn parse_resolved(merged: Value) -> CoreResult<ResolvedVersion> {
    let id = merged
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let main_class = merged
        .get("mainClass")
        .and_then(|v| v.as_str())
        .unwrap_or("net.minecraft.client.main.Main")
        .to_string();
    let jar = merged
        .get("jar")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let minecraft_version = merged
        .get("inheritsFrom")
        .and_then(|v| v.as_str())
        .or_else(|| merged.get("jar").and_then(|v| v.as_str()))
        .map(|s| s.to_string())
        .or_else(|| {
            // fabric profiles often set id like fabric-loader-x-mc
            None
        });
    // After merge inheritsFrom is removed; use client jar id heuristics
    let minecraft_version = minecraft_version.or_else(|| jar.clone()).or_else(|| {
        if id.contains("fabric-loader-") {
            id.rsplit('-').next().map(|s| s.to_string())
        } else {
            Some(id.clone())
        }
    });

    let asset_index = merged.get("assetIndex").and_then(|ai| {
        Some(AssetIndexInfo {
            id: ai.get("id")?.as_str()?.to_string(),
            url: ai.get("url")?.as_str()?.to_string(),
            sha1: ai.get("sha1").and_then(|v| v.as_str()).map(|s| s.to_string()),
            total_size: ai.get("totalSize").and_then(|v| v.as_u64()),
        })
    });
    let assets = merged
        .get("assets")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let libraries = merged
        .get("libraries")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|lib| parse_library(lib))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let (jvm_args, game_args) = parse_arguments(&merged);

    Ok(ResolvedVersion {
        id,
        jar,
        minecraft_version,
        main_class,
        asset_index,
        assets,
        libraries,
        jvm_args,
        game_args,
        version_type: merged
            .get("type")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        raw: merged,
    })
}

fn parse_library(lib: &Value) -> Option<ResolvedLibrary> {
    if !library_allowed(lib) {
        return None;
    }
    let name = lib.get("name").and_then(|v| v.as_str()).map(|s| s.to_string());
    let downloads = lib.get("downloads");

    let artifact = downloads.and_then(|d| d.get("artifact"));
    let mut artifact_path = artifact
        .and_then(|a| a.get("path"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let mut artifact_url = artifact
        .and_then(|a| a.get("url"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let artifact_sha1 = artifact
        .and_then(|a| a.get("sha1"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    if artifact_path.is_none() {
        if let Some(n) = &name {
            artifact_path = Some(maven_path_from_name(n, None));
        }
    }
    if artifact_url.is_none() {
        if let Some(path) = &artifact_path {
            let base = lib
                .get("url")
                .and_then(|v| v.as_str())
                .unwrap_or("https://libraries.minecraft.net/");
            let base = base.trim_end_matches('/');
            artifact_url = Some(format!("{base}/{path}"));
        }
    }

    // Legacy natives classifiers
    let mut native_path = None;
    let mut native_url = None;
    let mut native_sha1 = None;
    let natives = lib.get("natives");
    if let Some(natives) = natives {
        let classifier = natives
            .get("windows")
            .and_then(|v| v.as_str())
            .map(|s| s.replace("${arch}", "64"));
        if let Some(classifier) = classifier {
            let classifiers = downloads.and_then(|d| d.get("classifiers"));
            if let Some(entry) = classifiers.and_then(|c| c.get(&classifier)) {
                native_path = entry
                    .get("path")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                native_url = entry
                    .get("url")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                native_sha1 = entry
                    .get("sha1")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
            }
            if native_path.is_none() {
                if let Some(n) = &name {
                    let path = maven_path_from_name(n, Some(&classifier));
                    native_path = Some(path.clone());
                    native_url = Some(format!("https://libraries.minecraft.net/{path}"));
                }
            }
        }
    }

    // Modern: library name itself may be a natives jar (e.g. :natives-windows)
    let is_native_candidate = name
        .as_deref()
        .map(|n| n.contains(":natives-") || n.ends_with(":natives-windows"))
        .unwrap_or(false)
        || (artifact_path
            .as_deref()
            .map(|p| p.contains("natives-windows") || p.contains("natives-windows-arm64") || p.contains("natives-windows-x86"))
            .unwrap_or(false)
            && natives.is_none());

    let is_native_only = is_native_candidate
        && native_classifier_matches_host(
            name.as_deref().unwrap_or(""),
            artifact_path.as_deref().unwrap_or(""),
        );

    if is_native_only && native_path.is_none() {
        native_path = artifact_path.clone();
        native_url = artifact_url.clone();
        native_sha1 = artifact_sha1.clone();
    }

    // ホストと不一致の natives は捨てる（フラット展開時の誤アーチ上書き防止）
    if is_native_candidate && !is_native_only {
        return None;
    }

    Some(ResolvedLibrary {
        raw: lib.clone(),
        name,
        artifact_path,
        artifact_url,
        artifact_sha1,
        native_path,
        native_url,
        native_sha1,
        is_native_only,
    })
}

/// Windows natives classifier がこのホスト向けか。
fn native_classifier_matches_host(name: &str, path: &str) -> bool {
    let hay = format!("{name} {path}").to_ascii_lowercase();
    let is_arm64 = hay.contains("natives-windows-arm64") || hay.contains("natives-windows-aarch64");
    let is_x86 = hay.contains("natives-windows-x86")
        && !hay.contains("natives-windows-x86_64")
        && !is_arm64;
    let is_windows_native = hay.contains("natives-windows") || hay.contains("natives-windows-x86_64");

    if !is_windows_native && !is_arm64 && !is_x86 {
        // 非 Windows や判定不能はそのまま通す（rules で既に絞っている想定）
        return true;
    }

    #[cfg(all(target_os = "windows", target_arch = "aarch64"))]
    {
        return is_arm64;
    }
    #[cfg(all(target_os = "windows", target_arch = "x86"))]
    {
        return is_x86;
    }
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    {
        // 汎用 natives-windows は x64 向け。arm64 / x86 専用は除外。
        return !is_arm64 && !is_x86;
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (is_arm64, is_x86);
        true
    }
}

pub fn library_artifact_rel_path(lib: &ResolvedLibrary) -> Option<String> {
    if lib.is_native_only {
        return None;
    }
    lib.artifact_path.clone()
}

pub fn library_allowed(lib: &Value) -> bool {
    let Some(rules) = lib.get("rules").and_then(|v| v.as_array()) else {
        return true;
    };
    let mut allowed = false;
    for rule in rules {
        if rule_applies(rule) {
            allowed = rule.get("action").and_then(|v| v.as_str()) == Some("allow");
        }
    }
    allowed
}

fn rule_applies(rule: &Value) -> bool {
    if let Some(features) = rule.get("features").and_then(|v| v.as_object()) {
        // Feature-gated rules: only apply when we explicitly enable them elsewhere.
        // For library selection we ignore feature-only rules (don't match).
        if !features.is_empty() {
            return false;
        }
    }
    if let Some(os) = rule.get("os") {
        if let Some(name) = os.get("name").and_then(|v| v.as_str()) {
            if name != "windows" {
                return false;
            }
        }
        if let Some(arch) = os.get("arch").and_then(|v| v.as_str()) {
            if arch == "x86" {
                // We target x64; skip x86-only
                return false;
            }
        }
    }
    true
}

/// Maven coordinates → relative path under libraries/.
pub fn maven_path_from_name(name: &str, classifier: Option<&str>) -> String {
    let parts: Vec<&str> = name.split(':').collect();
    if parts.len() < 3 {
        return name.replace(':', "/");
    }
    let group = parts[0].replace('.', "/");
    let artifact = parts[1];
    let version = parts[2];
    let file = if let Some(c) = classifier {
        format!("{artifact}-{version}-{c}.jar")
    } else if parts.len() >= 4 {
        // name:artifact:version:classifier
        format!("{artifact}-{version}-{}.jar", parts[3])
    } else {
        format!("{artifact}-{version}.jar")
    };
    format!("{group}/{artifact}/{version}/{file}")
}

fn parse_arguments(merged: &Value) -> (Vec<String>, Vec<String>) {
    if let Some(args) = merged.get("arguments") {
        let jvm = expand_arg_list(args.get("jvm"), default_jvm_features());
        let game = expand_arg_list(args.get("game"), default_game_features());
        return (jvm, game);
    }
    if let Some(legacy) = merged.get("minecraftArguments").and_then(|v| v.as_str()) {
        let game: Vec<String> = legacy.split_whitespace().map(|s| s.to_string()).collect();
        return (default_legacy_jvm_args(), game);
    }
    (default_legacy_jvm_args(), vec![])
}

fn default_jvm_features() -> Map<String, Value> {
    let mut m = Map::new();
    m.insert("has_custom_resolution".into(), json!(true));
    m
}

fn default_game_features() -> Map<String, Value> {
    let mut m = Map::new();
    m.insert("has_custom_resolution".into(), json!(true));
    m.insert("is_demo_user".into(), json!(false));
    m.insert("has_quick_plays_support".into(), json!(false));
    m.insert("is_quick_play_singleplayer".into(), json!(false));
    m.insert("is_quick_play_multiplayer".into(), json!(false));
    m.insert("is_quick_play_realms".into(), json!(false));
    m
}

fn expand_arg_list(value: Option<&Value>, features: Map<String, Value>) -> Vec<String> {
    let Some(arr) = value.and_then(|v| v.as_array()) else {
        return vec![];
    };
    let mut out = Vec::new();
    for item in arr {
        if let Some(s) = item.as_str() {
            out.push(s.to_string());
            continue;
        }
        if let Some(obj) = item.as_object() {
            if let Some(rules) = obj.get("rules").and_then(|v| v.as_array()) {
                if !arg_rules_allow(rules, &features) {
                    continue;
                }
            }
            match obj.get("value") {
                Some(Value::String(s)) => out.push(s.clone()),
                Some(Value::Array(a)) => {
                    for v in a {
                        if let Some(s) = v.as_str() {
                            out.push(s.to_string());
                        }
                    }
                }
                _ => {}
            }
        }
    }
    out
}

fn arg_rules_allow(rules: &[Value], features: &Map<String, Value>) -> bool {
    let mut allowed = false;
    for rule in rules {
        if arg_rule_applies(rule, features) {
            allowed = rule.get("action").and_then(|v| v.as_str()) == Some("allow");
        }
    }
    allowed
}

fn arg_rule_applies(rule: &Value, features: &Map<String, Value>) -> bool {
    if let Some(os) = rule.get("os") {
        if let Some(name) = os.get("name").and_then(|v| v.as_str()) {
            if name != "windows" {
                return false;
            }
        }
    }
    if let Some(req) = rule.get("features").and_then(|v| v.as_object()) {
        for (k, v) in req {
            let want = v.as_bool().unwrap_or(false);
            let have = features.get(k).and_then(|x| x.as_bool()).unwrap_or(false);
            if want != have {
                return false;
            }
        }
    }
    true
}

fn default_legacy_jvm_args() -> Vec<String> {
    vec![
        "-Djava.library.path=${natives_directory}".into(),
        "-Dminecraft.launcher.brand=${launcher_name}".into(),
        "-Dminecraft.launcher.version=${launcher_version}".into(),
        "-cp".into(),
        "${classpath}".into(),
    ]
}
