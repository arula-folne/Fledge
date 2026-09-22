//! Minecraft initial options.txt / debug.json helpers (faithful port of minecraftInitialOptions.ts).

use crate::error::{CoreError, CoreResult};
use serde_json::{json, Map, Value};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

pub const MINECRAFT_INITIAL_SETTINGS_APPLY_GENERATION: u64 = 12;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct SemVer {
    major: u32,
    minor: u32,
    patch: u32,
}

const KEY_MIN_VERSION: &[(&str, SemVer)] = &[
    ("autoJump", SemVer { major: 1, minor: 10, patch: 0 }),
    ("simulationDistance", SemVer { major: 1, minor: 18, patch: 0 }),
    ("inactivityFpsLimit", SemVer { major: 1, minor: 21, patch: 2 }),
    ("operatorItemsTab", SemVer { major: 1, minor: 19, patch: 3 }),
    ("key_key.swapOffhand", SemVer { major: 1, minor: 16, patch: 0 }),
    ("key_key.socialInteractions", SemVer { major: 1, minor: 16, patch: 4 }),
    ("key_key.saveToolbarActivator", SemVer { major: 1, minor: 12, patch: 0 }),
    ("key_key.loadToolbarActivator", SemVer { major: 1, minor: 12, patch: 0 }),
    ("key_key.quickActions", SemVer { major: 1, minor: 21, patch: 6 }),
    ("key_key.toggleGui", SemVer { major: 1, minor: 21, patch: 11 }),
    ("key_key.spectatorHotbar", SemVer { major: 1, minor: 21, patch: 9 }),
    ("key_key.friends", SemVer { major: 26, minor: 2, patch: 0 }),
];

const DEBUG_OVERLAY_MIN: SemVer = SemVer {
    major: 1,
    minor: 21,
    patch: 9,
};

const SNAPSHOT_FLOORS: &[(SemVer, u32, u32)] = &[
    (SemVer { major: 26, minor: 2, patch: 0 }, 26, 7),
    (SemVer { major: 26, minor: 1, patch: 0 }, 26, 1),
    (SemVer { major: 1, minor: 21, patch: 11 }, 25, 41),
    (SemVer { major: 1, minor: 21, patch: 9 }, 25, 31),
    (SemVer { major: 1, minor: 21, patch: 6 }, 25, 20),
    (SemVer { major: 1, minor: 21, patch: 2 }, 24, 33),
    (SemVer { major: 1, minor: 19, patch: 3 }, 22, 45),
    (SemVer { major: 1, minor: 18, patch: 0 }, 21, 37),
    (SemVer { major: 1, minor: 16, patch: 0 }, 20, 6),
    (SemVer { major: 1, minor: 12, patch: 0 }, 17, 6),
    (SemVer { major: 1, minor: 10, patch: 0 }, 16, 1),
];

enum ParsedVersion {
    Release(SemVer),
    Snapshot { year: u32, week: u32 },
    Unknown,
}

fn parse_minecraft_version(version: &str) -> ParsedVersion {
    let version = version.trim();
    if let Some(caps) = regex_release(version) {
        return ParsedVersion::Release(caps);
    }
    if let Some((year, week)) = regex_snapshot(version) {
        return ParsedVersion::Snapshot { year, week };
    }
    ParsedVersion::Unknown
}

fn regex_release(version: &str) -> Option<SemVer> {
    let mut chars = version.chars().peekable();
    let mut major = String::new();
    while let Some(c) = chars.peek() {
        if c.is_ascii_digit() {
            major.push(*c);
            chars.next();
        } else {
            break;
        }
    }
    if chars.next() != Some('.') {
        return None;
    }
    let mut minor = String::new();
    while let Some(c) = chars.peek() {
        if c.is_ascii_digit() {
            minor.push(*c);
            chars.next();
        } else {
            break;
        }
    }
    let mut patch = 0u32;
    if chars.peek() == Some(&'.') {
        chars.next();
        let mut p = String::new();
        while let Some(c) = chars.peek() {
            if c.is_ascii_digit() {
                p.push(*c);
                chars.next();
            } else {
                break;
            }
        }
        patch = p.parse().unwrap_or(0);
    }
    Some(SemVer {
        major: major.parse().ok()?,
        minor: minor.parse().ok()?,
        patch,
    })
}

fn regex_snapshot(version: &str) -> Option<(u32, u32)> {
    // 25w31a
    if version.len() < 5 {
        return None;
    }
    let bytes = version.as_bytes();
    if bytes.get(2) != Some(&b'w') {
        return None;
    }
    let year: u32 = version.get(0..2)?.parse().ok()?;
    let week: u32 = version.get(3..5)?.parse().ok()?;
    Some((year, week))
}

fn semver_gte(a: SemVer, b: SemVer) -> bool {
    if a.major != b.major {
        return a.major > b.major;
    }
    if a.minor != b.minor {
        return a.minor > b.minor;
    }
    a.patch >= b.patch
}

fn version_at_least(version: &str, min: SemVer) -> bool {
    match parse_minecraft_version(version) {
        ParsedVersion::Release(v) => semver_gte(v, min),
        ParsedVersion::Snapshot { year, week } => {
            let mut best: Option<(SemVer, u32, u32)> = None;
            for &(floor_min, fy, fw) in SNAPSHOT_FLOORS {
                if !semver_gte(min, floor_min) {
                    continue;
                }
                if best.map(|(bm, _, _)| semver_gte(floor_min, bm)).unwrap_or(true) {
                    best = Some((floor_min, fy, fw));
                }
            }
            let Some((_, by, bw)) = best else {
                return false;
            };
            year > by || (year == by && week >= bw)
        }
        ParsedVersion::Unknown => false,
    }
}

fn format_float(n: f64) -> String {
    let rounded = (n * 10000.0).round() / 10000.0;
    format!("{rounded}")
}

fn null_or_missing(v: Option<&Value>) -> bool {
    match v {
        None => true,
        Some(Value::Null) => true,
        _ => false,
    }
}

pub fn has_custom_minecraft_initial_settings(settings: &Value) -> bool {
    if let Some(lang) = settings.get("lang").and_then(|v| v.as_str()) {
        if !lang.trim().is_empty() {
            return true;
        }
    }
    for key in [
        "showSubtitles",
        "autoJump",
        "bobView",
        "operatorItemsTab",
        "fovDegrees",
        "masterVolume",
        "musicVolume",
        "weatherVolume",
        "recordVolume",
        "blockVolume",
        "maxFps",
        "enableVsync",
        "inactivityFpsLimit",
        "guiScale",
        "gamma",
        "renderDistance",
        "simulationDistance",
        "mouseSensitivity",
        "showFps",
        "fpsExtended",
        // fpsTextContrast はバニラ options にキーが無く書き込まないため、カスタム判定から除外
    ] {
        if !null_or_missing(settings.get(key)) {
            return true;
        }
    }
    if let Some(map) = settings.get("keybinds").and_then(|v| v.as_object()) {
        for (id, code) in map {
            if id.starts_with("key.") && code.as_str().map(|s| !s.is_empty()).unwrap_or(false) {
                return true;
            }
        }
    }
    false
}

/// GLFW ボタン n → -(100 + n)。Minecraft は割り当て可能なマウスが 8 まで（left/right/middle/4–8）。
const MODERN_MOUSE_KEY_TO_LEGACY: &[(&str, &str)] = &[
    ("key.mouse.left", "-100"),
    ("key.mouse.right", "-99"),
    ("key.mouse.middle", "-98"),
    ("key.mouse.4", "-97"),
    ("key.mouse.5", "-96"),
    ("key.mouse.6", "-95"),
    ("key.mouse.7", "-94"),
    ("key.mouse.8", "-93"),
];

pub fn format_options_keybind_value(code: &str) -> String {
    for &(modern, legacy) in MODERN_MOUSE_KEY_TO_LEGACY {
        if code == modern {
            return legacy.to_string();
        }
    }
    if let Some(rest) = code.strip_prefix("key.mouse.") {
        if let Ok(n) = rest.parse::<i32>() {
            // mouse.N（N≥4）→ GLFW (N-1) → -100+(N-1) = N-101
            if (4..=8).contains(&n) {
                return (n - 101).to_string();
            }
        }
    }
    code.to_string()
}

fn keybind_values_equal(expected: &str, actual: Option<&str>) -> bool {
    let Some(actual) = actual else {
        return false;
    };
    if actual == expected {
        return true;
    }
    let legacy = MODERN_MOUSE_KEY_TO_LEGACY
        .iter()
        .find(|(m, _)| *m == expected)
        .map(|(_, l)| *l);
    if let Some(legacy) = legacy {
        if actual == legacy {
            return true;
        }
    }
    let modern_of_expected = MODERN_MOUSE_KEY_TO_LEGACY
        .iter()
        .find(|(_, l)| *l == expected)
        .map(|(m, _)| *m);
    if modern_of_expected == Some(actual) {
        return true;
    }
    if let Some(legacy) = legacy {
        let modern_of_actual = MODERN_MOUSE_KEY_TO_LEGACY
            .iter()
            .find(|(_, l)| *l == actual)
            .map(|(m, _)| *m);
        if modern_of_actual == Some(expected) || (legacy == actual) {
            return true;
        }
        // last clause from TS: legacy && LEGACY_MOUSE_KEY_TO_MODERN[actual] === expected
        if let Some(m) = MODERN_MOUSE_KEY_TO_LEGACY
            .iter()
            .find(|(_, l)| *l == actual)
            .map(|(m, _)| *m)
        {
            if m == expected {
                return true;
            }
        }
    }
    false
}

fn key_min(key: &str) -> Option<SemVer> {
    KEY_MIN_VERSION.iter().find(|(k, _)| *k == key).map(|(_, v)| *v)
}

pub fn snapshot_minecraft_initial_options(
    settings: &Value,
    minecraft_version: &str,
) -> HashMap<String, String> {
    if !has_custom_minecraft_initial_settings(settings) {
        return HashMap::new();
    }
    let mut out = HashMap::new();
    let mut put = |key: &str, value: String| {
        if let Some(min) = key_min(key) {
            if !version_at_least(minecraft_version, min) {
                return;
            }
        }
        out.insert(key.to_string(), value);
    };

    if let Some(lang) = settings.get("lang").and_then(|v| v.as_str()) {
        let t = lang.trim();
        if !t.is_empty() {
            put("lang", t.to_string());
        }
    }
    if let Some(v) = settings.get("showSubtitles").and_then(|v| v.as_bool()) {
        put("showSubtitles", v.to_string());
    }
    if let Some(v) = settings.get("autoJump").and_then(|v| v.as_bool()) {
        put("autoJump", v.to_string());
    }
    if let Some(v) = settings.get("bobView").and_then(|v| v.as_bool()) {
        put("bobView", v.to_string());
    }
    if let Some(v) = settings.get("operatorItemsTab").and_then(|v| v.as_bool()) {
        put("operatorItemsTab", v.to_string());
    }
    if let Some(v) = settings.get("fovDegrees").and_then(|v| v.as_f64()) {
        put("fov", format_float((v - 70.0) / 40.0));
    }
    if let Some(v) = settings.get("masterVolume").and_then(|v| v.as_f64()) {
        put("soundCategory_master", format_float(v));
    }
    if let Some(v) = settings.get("musicVolume").and_then(|v| v.as_f64()) {
        put("soundCategory_music", format_float(v));
    }
    if let Some(v) = settings.get("weatherVolume").and_then(|v| v.as_f64()) {
        put("soundCategory_weather", format_float(v));
    }
    if let Some(v) = settings.get("recordVolume").and_then(|v| v.as_f64()) {
        put("soundCategory_record", format_float(v));
    }
    if let Some(v) = settings.get("blockVolume").and_then(|v| v.as_f64()) {
        put("soundCategory_block", format_float(v));
    }
    if let Some(v) = settings.get("maxFps").and_then(|v| v.as_i64()) {
        put("maxFps", v.to_string());
    }
    if let Some(v) = settings.get("enableVsync").and_then(|v| v.as_bool()) {
        put("enableVsync", v.to_string());
    }
    if let Some(v) = settings.get("inactivityFpsLimit").and_then(|v| v.as_str()) {
        put("inactivityFpsLimit", v.to_string());
    }
    if let Some(v) = settings.get("guiScale").and_then(|v| v.as_i64()) {
        put("guiScale", v.to_string());
    }
    if let Some(v) = settings.get("gamma").and_then(|v| v.as_f64()) {
        put("gamma", format_float(v));
    }
    if let Some(v) = settings.get("renderDistance").and_then(|v| v.as_i64()) {
        put("renderDistance", v.to_string());
    }
    if let Some(v) = settings.get("simulationDistance").and_then(|v| v.as_i64()) {
        put("simulationDistance", v.to_string());
    }
    if let Some(v) = settings.get("mouseSensitivity").and_then(|v| v.as_f64()) {
        put("mouseSensitivity", format_float(v));
    }
    if let Some(map) = settings.get("keybinds").and_then(|v| v.as_object()) {
        for (id, code) in map {
            let Some(code) = code.as_str() else { continue };
            if !id.starts_with("key.") || code.is_empty() {
                continue;
            }
            put(
                &format!("key_{id}"),
                format_options_keybind_value(code),
            );
        }
    }
    out.insert("onboardAccessibility".into(), "false".into());
    out
}

pub fn snapshot_minecraft_debug_overlay(
    settings: &Value,
    minecraft_version: &str,
) -> HashMap<String, String> {
    if !version_at_least(minecraft_version, DEBUG_OVERLAY_MIN) {
        return HashMap::new();
    }
    let mut out = HashMap::new();
    if let Some(v) = settings.get("showFps").and_then(|v| v.as_bool()) {
        out.insert(
            "minecraft:fps".into(),
            if v { "always_on" } else { "never" }.into(),
        );
    }
    if let Some(v) = settings.get("fpsExtended").and_then(|v| v.as_bool()) {
        let vis = if v { "always_on" } else { "never" };
        out.insert("minecraft:memory".into(), vis.into());
        out.insert("minecraft:gpu_utilization".into(), vis.into());
    }
    out
}

fn strip_bom(text: &str) -> &str {
    text.strip_prefix('\u{feff}').unwrap_or(text)
}

fn parse_options_map(text: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for line in strip_bom(text).lines() {
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some(idx) = line.find(':') else { continue };
        if idx == 0 {
            continue;
        }
        let key = line[..idx].trim().to_string();
        let value = line[idx + 1..].to_string();
        map.insert(key, value);
    }
    map
}

fn option_values_equal(key: &str, expected: &str, actual: Option<&str>) -> bool {
    let Some(actual) = actual else {
        return false;
    };
    if key.starts_with("key_key.") {
        return keybind_values_equal(expected, Some(actual));
    }
    if actual == expected {
        return true;
    }
    if let (Ok(en), Ok(an)) = (expected.parse::<f64>(), actual.parse::<f64>()) {
        return (en - an).abs() < 1e-6;
    }
    let el = expected.to_ascii_lowercase();
    let al = actual.to_ascii_lowercase();
    if (el == "true" || el == "false") && (al == "true" || al == "false") {
        return el == al;
    }
    false
}

pub fn verify_minecraft_options_file(
    instance_dir: &Path,
    patch: &HashMap<String, String>,
) -> bool {
    if patch.is_empty() {
        return true;
    }
    let text = match fs::read_to_string(instance_dir.join("options.txt")) {
        Ok(t) => t,
        Err(_) => return false,
    };
    let map = parse_options_map(&text);
    patch
        .iter()
        .all(|(k, v)| option_values_equal(k, v, map.get(k).map(|s| s.as_str())))
}

pub fn verify_minecraft_debug_overlay_file(
    instance_dir: &Path,
    patch: &HashMap<String, String>,
) -> bool {
    if patch.is_empty() {
        return true;
    }
    let text = match fs::read_to_string(instance_dir.join("debug.json")) {
        Ok(t) => t,
        Err(_) => return false,
    };
    let existing: Value = match serde_json::from_str(&text) {
        Ok(v) => v,
        Err(_) => return false,
    };
    let entries = existing
        .get("entries")
        .and_then(|v| v.as_object())
        .or_else(|| existing.as_object());
    let Some(entries) = entries else {
        return false;
    };
    patch.iter().all(|(k, v)| {
        entries
            .get(k)
            .and_then(|x| x.as_str())
            == Some(v.as_str())
    })
}

fn write_text_atomic(file: &Path, body: &str) -> CoreResult<()> {
    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent)?;
    }
    let payload = if body.ends_with('\n') {
        body.to_string()
    } else {
        format!("{body}\n")
    };
    fs::write(file, payload)?;
    Ok(())
}

pub fn merge_minecraft_options_file(
    instance_dir: &Path,
    patch: &HashMap<String, String>,
) -> CoreResult<()> {
    if patch.is_empty() {
        return Ok(());
    }
    let file = instance_dir.join("options.txt");
    let existing = fs::read_to_string(&file)
        .map(|t| strip_bom(&t).to_string())
        .unwrap_or_default();

    if existing.trim().is_empty() {
        let mut keys: Vec<_> = patch.keys().cloned().collect();
        keys.sort();
        let body = keys
            .iter()
            .map(|k| format!("{k}:{}", patch[k]))
            .collect::<Vec<_>>()
            .join("\n");
        return write_text_atomic(&file, &body);
    }

    let lines: Vec<&str> = existing.lines().collect();
    let mut used = HashSet::new();
    let mut next_lines: Vec<String> = Vec::new();

    for line in lines {
        if line.is_empty() || line.starts_with('#') {
            next_lines.push(line.to_string());
            continue;
        }
        let Some(idx) = line.find(':') else {
            next_lines.push(line.to_string());
            continue;
        };
        if idx == 0 {
            next_lines.push(line.to_string());
            continue;
        }
        let key = line[..idx].trim();
        if patch.contains_key(key) {
            if used.contains(key) {
                continue;
            }
            next_lines.push(format!("{key}:{}", patch[key]));
            used.insert(key.to_string());
            continue;
        }
        next_lines.push(line.to_string());
    }

    let mut keys: Vec<_> = patch.keys().cloned().collect();
    keys.sort();
    for key in keys {
        if used.contains(&key) {
            continue;
        }
        next_lines.push(format!("{key}:{}", patch[&key]));
    }

    while next_lines.last().map(|s| s.is_empty()).unwrap_or(false) {
        next_lines.pop();
    }
    write_text_atomic(&file, &next_lines.join("\n"))
}

pub fn merge_minecraft_debug_overlay_file(
    instance_dir: &Path,
    patch: &HashMap<String, String>,
) -> CoreResult<()> {
    if patch.is_empty() {
        return Ok(());
    }
    let file = instance_dir.join("debug.json");
    let existing: Value = fs::read_to_string(&file)
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_else(|| json!({}));

    let next = if let Some(entries) = existing.get("entries").and_then(|v| v.as_object()) {
        let mut base = existing.as_object().cloned().unwrap_or_default();
        let mut merged = entries.clone();
        for (k, v) in patch {
            merged.insert(k.clone(), Value::String(v.clone()));
        }
        base.insert("entries".into(), Value::Object(merged));
        Value::Object(base)
    } else {
        let mut base = existing.as_object().cloned().unwrap_or_default();
        for (k, v) in patch {
            base.insert(k.clone(), Value::String(v.clone()));
        }
        Value::Object(base)
    };
    write_text_atomic(&file, &format!("{}\n", serde_json::to_string_pretty(&next)?))
}

const INITIAL_SETTINGS_SPAWN_SETTLE_MS: u64 = 300;
const INITIAL_SETTINGS_SPAWN_BURST_PASSES: u32 = 4;
const INITIAL_SETTINGS_SPAWN_BURST_GAP_MS: u64 = 40;

pub async fn apply_minecraft_initial_patch_to_instance(
    instance_dir: &Path,
    options: &HashMap<String, String>,
    overlay: &HashMap<String, String>,
) -> CoreResult<()> {
    if options.is_empty() && overlay.is_empty() {
        return Ok(());
    }

    if !options.is_empty() {
        for pass in 0..INITIAL_SETTINGS_SPAWN_BURST_PASSES {
            merge_minecraft_options_file(instance_dir, options)?;
            if !verify_minecraft_options_file(instance_dir, options) {
                merge_minecraft_options_file(instance_dir, options)?;
            }
            if !verify_minecraft_options_file(instance_dir, options) {
                return Err(CoreError::msg(format!(
                    "Failed to persist Minecraft options.txt at {}",
                    instance_dir.join("options.txt").display()
                )));
            }
            if pass + 1 < INITIAL_SETTINGS_SPAWN_BURST_PASSES {
                tokio::time::sleep(std::time::Duration::from_millis(
                    INITIAL_SETTINGS_SPAWN_BURST_GAP_MS,
                ))
                .await;
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(
            INITIAL_SETTINGS_SPAWN_SETTLE_MS,
        ))
        .await;
        if !verify_minecraft_options_file(instance_dir, options) {
            merge_minecraft_options_file(instance_dir, options)?;
        }
        if !verify_minecraft_options_file(instance_dir, options) {
            return Err(CoreError::msg(format!(
                "Failed to persist Minecraft options.txt at {}",
                instance_dir.join("options.txt").display()
            )));
        }
    }

    if !overlay.is_empty() {
        merge_minecraft_debug_overlay_file(instance_dir, overlay)?;
        if !verify_minecraft_debug_overlay_file(instance_dir, overlay) {
            merge_minecraft_debug_overlay_file(instance_dir, overlay)?;
        }
    }
    Ok(())
}

pub fn is_minecraft_initial_patch_empty(
    options: &HashMap<String, String>,
    overlay: &HashMap<String, String>,
) -> bool {
    options.is_empty() && overlay.is_empty()
}

pub async fn ensure_minecraft_initial_settings_applied(
    instance_dir: &Path,
    pending_options: &HashMap<String, String>,
    pending_overlay: &HashMap<String, String>,
    already_committed: bool,
) -> CoreResult<(bool, HashMap<String, String>, HashMap<String, String>)> {
    if already_committed {
        return Ok((false, HashMap::new(), HashMap::new()));
    }
    if is_minecraft_initial_patch_empty(pending_options, pending_overlay) {
        return Ok((false, HashMap::new(), HashMap::new()));
    }
    apply_minecraft_initial_patch_to_instance(instance_dir, pending_options, pending_overlay)
        .await?;
    Ok((
        true,
        pending_options.clone(),
        pending_overlay.clone(),
    ))
}

pub fn hashmap_to_json(map: &HashMap<String, String>) -> Value {
    let mut obj = Map::new();
    for (k, v) in map {
        obj.insert(k.clone(), Value::String(v.clone()));
    }
    Value::Object(obj)
}

pub fn json_to_hashmap(value: Option<&Value>) -> HashMap<String, String> {
    value
        .and_then(|v| v.as_object())
        .map(|obj| {
            obj.iter()
                .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                .collect()
        })
        .unwrap_or_default()
}

pub fn options_txt_path(instance_dir: &Path) -> PathBuf {
    instance_dir.join("options.txt")
}

pub fn latest_log_path(instance_dir: &Path) -> PathBuf {
    instance_dir.join("logs").join("latest.log")
}
