use crate::error::{CoreError, CoreResult};
use crate::paths::PathLayout;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use chrono::Utc;
use serde_json::{json, Map, Value};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

const ICON_EXTS: &[&str] = &[".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"];
const MAX_ICON_BYTES: usize = 8 * 1024 * 1024;
const SUBFOLDERS: &[&str] = &[
    "mods",
    "resourcepacks",
    "shaderpacks",
    "saves",
    "logs",
    "screenshots",
    "plugins",
];

pub struct InstanceStore {
    layout: PathLayout,
}

impl InstanceStore {
    pub fn new(layout: PathLayout) -> Self {
        Self { layout }
    }

    pub fn instance_dir(&self, id: &str) -> PathBuf {
        PathBuf::from(&self.layout.instances).join(id)
    }

    fn profile_path(&self, id: &str) -> PathBuf {
        self.instance_dir(id).join("profile.json")
    }

    pub fn list(&self) -> CoreResult<Vec<Value>> {
        let dir = PathBuf::from(&self.layout.instances);
        fs::create_dir_all(&dir)?;
        let mut out = Vec::new();
        for entry in fs::read_dir(&dir)? {
            let entry = entry?;
            if !entry.file_type()?.is_dir() {
                continue;
            }
            let id = entry.file_name().to_string_lossy().into_owned();
            if let Some(profile) = self.read_profile(&id)? {
                out.push(profile);
            }
        }
        out.sort_by(|a, b| {
            let an = a.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let bn = b.get("name").and_then(|v| v.as_str()).unwrap_or("");
            an.cmp(bn)
        });
        Ok(out)
    }

    pub fn get(&self, id: &str) -> CoreResult<Option<Value>> {
        self.read_profile(id)
    }

    fn read_profile(&self, id: &str) -> CoreResult<Option<Value>> {
        let file = self.profile_path(id);
        if !file.exists() {
            return Ok(None);
        }
        match fs::read_to_string(&file) {
            Ok(raw) => match serde_json::from_str::<Value>(&raw) {
                Ok(mut parsed) => {
                    let migrated = migrate_profile(&mut parsed);
                    // フォルダ名が正本。JSON 内 id がずれていると削除・一覧が壊れる
                    let id_mismatch = parsed.get("id").and_then(|v| v.as_str()) != Some(id);
                    if id_mismatch {
                        if let Some(obj) = parsed.as_object_mut() {
                            obj.insert("id".into(), json!(id));
                        }
                    }
                    if migrated || id_mismatch {
                        self.write_profile_file(id, &parsed)?;
                    }
                    Ok(Some(parsed))
                }
                Err(err) => {
                    tracing::warn!("skip invalid profile {}: {err}", file.display());
                    Ok(None)
                }
            },
            Err(err) => Err(err.into()),
        }
    }

    pub fn create(&self, input: &Value, defaults: CreateDefaults<'_>) -> CoreResult<Value> {
        let name = require_str(input, "name")?;
        if name.is_empty() || name.chars().count() > 64 {
            return Err(CoreError::msg("name must be 1-64 characters"));
        }
        let minecraft_version = require_str(input, "minecraftVersion")?;
        let loader = require_str(input, "loader")?;
        validate_loader(&loader)?;
        let loader_version = input
            .get("loaderVersion")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let memory_max = input
            .get("memoryMaxMb")
            .and_then(|v| v.as_u64())
            .unwrap_or(defaults.memory_max_mb.unwrap_or(2048));
        if memory_max == 0 {
            return Err(CoreError::msg("memoryMaxMb must be positive"));
        }
        let jvm_args = input
            .get("jvmArgs")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        let jvm_args = if jvm_args.is_empty() {
            defaults.jvm_args.to_vec()
        } else {
            jvm_args
        };

        let icon = input.get("icon").cloned();
        let has_icon = icon.as_ref().map(|v| !v.is_null()).unwrap_or(false);
        let icon_preset = if has_icon {
            None
        } else {
            Some(
                input
                    .get("iconPreset")
                    .cloned()
                    .unwrap_or_else(default_icon_preset),
            )
        };

        let id = self.allocate_id(&slugify(&name))?;
        let now = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        let mut profile = json!({
          "id": id,
          "name": name,
          "createdAt": now,
          "updatedAt": now,
          "minecraftVersion": minecraft_version,
          "loader": loader,
          "java": { "strategy": "auto" },
          "memory": { "maxMb": memory_max },
          "jvmArgs": jvm_args
        });
        if let Some(lv) = loader_version {
            profile
                .as_object_mut()
                .unwrap()
                .insert("loaderVersion".into(), json!(lv));
        }
        if let Some(preset) = icon_preset {
            profile
                .as_object_mut()
                .unwrap()
                .insert("iconPreset".into(), preset);
        }
        if defaults.seed_minecraft_initial_settings {
            let obj = profile.as_object_mut().unwrap();
            obj.insert("minecraftInitialSettingsSeeded".into(), json!(true));
            obj.insert("minecraftInitialSettingsApplied".into(), json!(false));
            obj.insert(
                "pendingMinecraftOptions".into(),
                defaults.pending_minecraft_options.clone(),
            );
            obj.insert(
                "pendingMinecraftDebugOverlay".into(),
                defaults.pending_minecraft_debug_overlay.clone(),
            );
        }

        self.write_instance(&profile)?;
        if let Some(icon_val) = icon.filter(|v| !v.is_null()) {
            let icon_file = self.write_icon_file(profile["id"].as_str().unwrap(), &icon_val)?;
            profile
                .as_object_mut()
                .unwrap()
                .insert("iconFile".into(), json!(icon_file));
            self.write_profile_file(profile["id"].as_str().unwrap(), &profile)?;
        }
        Ok(profile)
    }

    pub fn update(&self, id: &str, partial: &Value) -> CoreResult<Value> {
        let current = self
            .get(id)?
            .ok_or_else(|| CoreError::msg(format!("Instance not found: {id}")))?;
        let mut merged = current.clone();
        let icon = partial.get("icon").cloned();

        if let Some(obj) = partial.as_object() {
            for (k, v) in obj {
                if k == "id" || k == "createdAt" || k == "icon" {
                    continue;
                }
                merged.as_object_mut().unwrap().insert(k.clone(), v.clone());
            }
        }
        merged
            .as_object_mut()
            .unwrap()
            .insert("id".into(), json!(id));
        merged.as_object_mut().unwrap().insert(
            "updatedAt".into(),
            json!(Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)),
        );

        if let Some(icon_val) = icon {
            if icon_val.is_null() {
                self.remove_icon_files(id, current.get("iconFile").and_then(|v| v.as_str()))?;
                merged.as_object_mut().unwrap().remove("iconFile");
            } else {
                self.remove_icon_files(id, current.get("iconFile").and_then(|v| v.as_str()))?;
                let icon_file = self.write_icon_file(id, &icon_val)?;
                merged
                    .as_object_mut()
                    .unwrap()
                    .insert("iconFile".into(), json!(icon_file));
            }
        }

        validate_profile_basic(&merged)?;
        self.write_profile_file(id, &merged)?;
        Ok(merged)
    }

    pub fn duplicate(&self, id: &str) -> CoreResult<Value> {
        let source = self
            .get(id)?
            .ok_or_else(|| CoreError::msg(format!("Instance not found: {id}")))?;
        let source_name = source
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("instance");
        let copy_name = format!("{source_name} のコピー");
        let new_id = self.allocate_id(&slugify(&copy_name))?;
        let now = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);

        let mut profile = source.clone();
        let obj = profile.as_object_mut().unwrap();
        obj.insert("id".into(), json!(new_id));
        obj.insert("name".into(), json!(copy_name));
        obj.insert("createdAt".into(), json!(now));
        obj.insert("updatedAt".into(), json!(now));
        obj.remove("lastPlayedAt");
        obj.insert("minecraftInitialSettingsApplied".into(), json!(false));
        obj.insert("minecraftInitialSettingsApplyGeneration".into(), json!(0));

        self.write_instance(&profile)?;
        self.copy_instance_contents(&self.instance_dir(id), &self.instance_dir(&new_id))?;
        self.write_profile_file(&new_id, &profile)?;
        Ok(profile)
    }

    pub fn remove(&self, id: &str) -> CoreResult<()> {
        let dir = self.instance_dir(id);
        if dir.exists() {
            fs::remove_dir_all(&dir)?;
        }
        Ok(())
    }

    pub fn get_icon_data_url(&self, id: &str) -> CoreResult<Option<String>> {
        let profile = match self.get(id)? {
            Some(p) => p,
            None => return Ok(None),
        };
        let Some(icon_file) = profile.get("iconFile").and_then(|v| v.as_str()) else {
            return Ok(None);
        };
        let file = Path::new(icon_file)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("");
        if file != icon_file {
            return Ok(None);
        }
        let ext = Path::new(file)
            .extension()
            .map(|e| format!(".{}", e.to_string_lossy().to_lowercase()))
            .unwrap_or_default();
        if !ICON_EXTS.contains(&ext.as_str()) {
            return Ok(None);
        }
        let full = self.instance_dir(id).join(file);
        match fs::read(&full) {
            Ok(buf) => Ok(Some(format!(
                "data:{};base64,{}",
                mime_for_ext(&ext),
                B64.encode(buf)
            ))),
            Err(_) => Ok(None),
        }
    }

    pub fn open_subfolder_path(&self, id: &str, subfolder: &str) -> CoreResult<PathBuf> {
        if !SUBFOLDERS.contains(&subfolder) {
            return Err(CoreError::msg("Invalid subfolder"));
        }
        let path = self.instance_dir(id).join(subfolder);
        fs::create_dir_all(&path)?;
        Ok(path)
    }

    fn write_instance(&self, profile: &Value) -> CoreResult<()> {
        let id = profile
            .get("id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| CoreError::msg("profile id missing"))?;
        let dir = self.instance_dir(id);
        let subdirs = [
            "mods",
            "resourcepacks",
            "shaderpacks",
            "saves",
            "config",
            "screenshots",
            "logs",
            "plugins",
        ];
        fs::create_dir_all(&dir)?;
        for s in subdirs {
            fs::create_dir_all(dir.join(s))?;
        }
        fs::create_dir_all(dir.join("world").join("datapacks"))?;
        self.write_profile_file(id, profile)
    }

    fn write_profile_file(&self, id: &str, profile: &Value) -> CoreResult<()> {
        let pretty = serde_json::to_string_pretty(profile)?;
        fs::write(self.profile_path(id), pretty)?;
        Ok(())
    }

    fn write_icon_file(&self, id: &str, icon: &Value) -> CoreResult<String> {
        let bytes = icon_bytes(icon)?;
        if bytes.len() > MAX_ICON_BYTES {
            return Err(CoreError::msg("Instance icon is too large"));
        }
        let original = icon
            .get("originalName")
            .and_then(|v| v.as_str())
            .unwrap_or("icon.png");
        let ext = icon_ext(original).ok_or_else(|| CoreError::msg("Unsupported instance icon format"))?;
        let file_name = format!("icon{ext}");
        fs::write(self.instance_dir(id).join(&file_name), bytes)?;
        Ok(file_name)
    }

    fn remove_icon_files(&self, id: &str, known: Option<&str>) -> CoreResult<()> {
        let dir = self.instance_dir(id);
        let mut names = HashSet::new();
        if let Some(known) = known {
            names.insert(Path::new(known).file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default());
        }
        for ext in ICON_EXTS {
            names.insert(format!("icon{ext}"));
        }
        for name in names {
            if name.is_empty() {
                continue;
            }
            let _ = fs::remove_file(dir.join(name));
        }
        Ok(())
    }

    fn allocate_id(&self, base: &str) -> CoreResult<String> {
        // 同名インスタンスでも必ず別フォルダになるよう、十分長い一意サフィックスを付ける
        for _ in 0..32 {
            let suffix = &Uuid::new_v4().simple().to_string()[..12];
            let candidate = format!("{base}-{suffix}");
            if !self.instance_dir(&candidate).exists() {
                return Ok(candidate);
            }
        }
        Err(CoreError::msg("Failed to allocate instance id"))
    }

    fn copy_instance_contents(&self, from: &Path, to: &Path) -> CoreResult<()> {
        // ユーザー進行データ＋初期設定適用対象はコピーしない（コピー先で初期設定をやり直す）
        let excluded: HashSet<&str> = [
            "saves",
            "logs",
            "screenshots",
            "crash-reports",
            "backups",
            "options.txt",
            "debug.json",
        ]
        .into_iter()
        .collect();
        for entry in fs::read_dir(from)? {
            let entry = entry?;
            let name = entry.file_name();
            let name_s = name.to_string_lossy();
            if name_s == "profile.json" || excluded.contains(name_s.to_lowercase().as_str()) {
                continue;
            }
            let src = entry.path();
            let dest = to.join(&name);
            if entry.file_type()?.is_dir() {
                copy_dir_recursive(&src, &dest)?;
            } else {
                fs::copy(&src, &dest)?;
            }
        }
        Ok(())
    }
}

pub struct CreateDefaults<'a> {
    pub memory_max_mb: Option<u64>,
    pub jvm_args: &'a [String],
    pub seed_minecraft_initial_settings: bool,
    pub pending_minecraft_options: Value,
    pub pending_minecraft_debug_overlay: Value,
}

fn copy_dir_recursive(from: &Path, to: &Path) -> CoreResult<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let dest = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_recursive(&entry.path(), &dest)?;
        } else {
            fs::copy(entry.path(), dest)?;
        }
    }
    Ok(())
}

fn slugify(name: &str) -> String {
    // 表示名は日本語可。フォルダ ID は ASCII のみ（パス混乱・同名衝突を防ぐ）
    let mut out = String::new();
    for c in name.trim().chars() {
        let lower = c.to_ascii_lowercase();
        if lower.is_ascii_alphanumeric() {
            out.push(lower);
        } else if !out.is_empty() && !out.ends_with('-') {
            out.push('-');
        }
    }
    let trimmed = out.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "instance".into()
    } else {
        trimmed
    }
}

fn default_icon_preset() -> Value {
    json!({
      "variant": "cube",
      "color": "#f4f7fa",
      "backdrop": "plain"
    })
}

fn validate_loader(loader: &str) -> CoreResult<()> {
    match loader {
        "vanilla" | "fabric" | "forge" | "neoforge" | "quilt" => Ok(()),
        _ => Err(CoreError::msg(format!("unsupported loader: {loader}"))),
    }
}

fn validate_profile_basic(profile: &Value) -> CoreResult<()> {
    let name = require_str(profile, "name")?;
    if name.is_empty() || name.chars().count() > 64 {
        return Err(CoreError::msg("name must be 1-64 characters"));
    }
    require_str(profile, "minecraftVersion")?;
    let loader = require_str(profile, "loader")?;
    validate_loader(&loader)?;
    let max = profile
        .pointer("/memory/maxMb")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    if max == 0 {
        return Err(CoreError::msg("memory.maxMb must be positive"));
    }
    Ok(())
}

fn migrate_profile(parsed: &mut Value) -> bool {
    let Some(obj) = parsed.as_object_mut() else {
        return false;
    };
    let mut migrated = false;
    if !obj.contains_key("jvmArgs") {
        obj.insert("jvmArgs".into(), json!([]));
        migrated = true;
    }
    if obj.get("java").and_then(|v| v.get("strategy")).is_none() {
        let mut java = Map::new();
        java.insert("strategy".into(), json!("auto"));
        obj.insert("java".into(), Value::Object(java));
        migrated = true;
    }
    if obj
        .get("memory")
        .and_then(|v| v.get("maxMb"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0)
        == 0
    {
        let mut memory = Map::new();
        memory.insert("maxMb".into(), json!(2048));
        obj.insert("memory".into(), Value::Object(memory));
        migrated = true;
    }
    migrated
}

fn require_str(value: &Value, key: &str) -> CoreResult<String> {
    value
        .get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| CoreError::msg(format!("{key} required")))
}

fn icon_ext(original_name: &str) -> Option<String> {
    let ext = Path::new(original_name)
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy().to_lowercase()))?;
    if ICON_EXTS.contains(&ext.as_str()) {
        Some(ext)
    } else {
        None
    }
}

fn mime_for_ext(ext: &str) -> &'static str {
    match ext {
        ".jpg" | ".jpeg" => "image/jpeg",
        ".gif" => "image/gif",
        ".webp" => "image/webp",
        ".bmp" => "image/bmp",
        _ => "image/png",
    }
}

fn icon_bytes(icon: &Value) -> CoreResult<Vec<u8>> {
    let arr = icon
        .get("bytes")
        .and_then(|v| v.as_array())
        .ok_or_else(|| CoreError::msg("icon.bytes required"))?;
    let mut out = Vec::with_capacity(arr.len());
    for v in arr {
        let n = v
            .as_u64()
            .ok_or_else(|| CoreError::msg("icon.bytes must be numbers"))?;
        if n > 255 {
            return Err(CoreError::msg("icon.bytes out of range"));
        }
        out.push(n as u8);
    }
    Ok(out)
}
