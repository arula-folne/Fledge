use crate::error::CoreResult;
use crate::paths::PathLayout;
use parking_lot::Mutex;
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;

fn default_settings() -> Value {
    json!({
      "selectedInstanceId": null,
      "lastPlayedInstanceId": null,
      "locale": "ja",
      "defaultMemoryMaxMb": 2048,
      "defaultJvmArgs": [],
      "minecraftInitialSettings": {},
      "showSnapshots": false,
      "gameFullscreen": false,
      "gameWindowWidth": 1280,
      "gameWindowHeight": 720,
      "launcherWindowWidth": 1280,
      "launcherWindowHeight": 720,
      "uiScale": "normal",
      "uiScaleVersion": 3,
      "startupPage": "home",
      "themeFamily": "standard",
      "themeMode": "light",
      "seasonThemeId": null,
      "themeColor": { "r": 255, "g": 255, "b": 255 },
      "themeAccentColor": { "r": 91, "g": 164, "b": 217 },
      "hardwareAcceleration": true,
      "minimizeOnLaunch": false,
      "discordRichPresence": false,
      "homeNewsVisible": true,
      "privacyNoticeAcknowledged": false,
      "installOnboardingCompleted": false,
      "termsAcceptedInApp": false,
      "updateAckPending": null,
      "javaPreferredMajors": [21, 17, 8],
      "concurrentDownloads": 10,
      "maxWriteConcurrency": 10,
      "selectedSkinId": "steve",
      "skinModel": "wide",
      "librarySortMode": "name",
      "libraryInstanceOrder": [],
      "contentFavorites": []
    })
}

pub struct SettingsStore {
    layout: PathLayout,
    cache: Mutex<Option<Value>>,
}

impl SettingsStore {
    pub fn new(layout: PathLayout) -> Self {
        Self {
            layout,
            cache: Mutex::new(None),
        }
    }

    fn file_path(&self) -> PathBuf {
        PathBuf::from(&self.layout.settings).join("settings.json")
    }

    pub fn get(&self) -> CoreResult<Value> {
        if let Some(cached) = self.cache.lock().clone() {
            return Ok(cached);
        }
        let path = self.file_path();
        let (settings, dirty) = match fs::read_to_string(&path) {
            Ok(raw) => {
                let mut parsed: Value = serde_json::from_str(&raw)?;
                let dirty = self.migrate_inplace(&mut parsed);
                (merge_defaults(default_settings(), parsed), dirty)
            }
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => (default_settings(), false),
            Err(err) => return Err(err.into()),
        };
        if dirty {
            self.save(&settings)?;
        } else {
            *self.cache.lock() = Some(settings.clone());
        }
        Ok(settings)
    }

    pub fn set(&self, partial: Value) -> CoreResult<Value> {
        let mut current = self.get()?;
        deep_merge(&mut current, &partial);
        let _ = self.migrate_inplace(&mut current);
        self.save(&current)?;
        Ok(current)
    }

    pub fn reset(&self) -> CoreResult<Value> {
        let settings = default_settings();
        self.save(&settings)?;
        Ok(settings)
    }

    pub fn clear_cache(&self) {
        *self.cache.lock() = None;
    }

    pub fn reload(&self) -> CoreResult<Value> {
        self.clear_cache();
        self.get()
    }

    fn save(&self, settings: &Value) -> CoreResult<()> {
        let path = self.file_path();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let pretty = serde_json::to_string_pretty(settings)?;
        fs::write(&path, pretty)?;
        *self.cache.lock() = Some(settings.clone());
        Ok(())
    }

    /// 移行で値が変わったら true（TS SettingsStore と揃える）
    fn migrate_inplace(&self, parsed: &mut Value) -> bool {
        let Some(obj) = parsed.as_object_mut() else {
            return false;
        };
        let mut dirty = false;

        // 旧ランチャー窓設定キーを Minecraft 表示設定へ移行
        if obj.get("gameFullscreen").is_none() {
            if let Some(v) = obj.get("fullscreen").cloned() {
                obj.insert("gameFullscreen".into(), v);
                dirty = true;
            }
        }
        if obj.get("gameWindowWidth").is_none() {
            if let Some(v) = obj.get("windowWidth").cloned() {
                obj.insert("gameWindowWidth".into(), v);
                dirty = true;
            }
        }
        if obj.get("gameWindowHeight").is_none() {
            if let Some(v) = obj.get("windowHeight").cloned() {
                obj.insert("gameWindowHeight".into(), v);
                dirty = true;
            }
        }
        for key in ["fullscreen", "windowWidth", "windowHeight"] {
            if obj.remove(key).is_some() {
                dirty = true;
            }
        }

        if let Some(mem) = obj.get("defaultMemoryMaxMb").and_then(|v| v.as_u64()) {
            if mem > 49152 {
                obj.insert("defaultMemoryMaxMb".into(), Value::from(49152u64));
                dirty = true;
            }
        }

        for key in [
            "curseforgeApiKey",
            "curseforgeApiKeyConfigured",
            "curseforgeApiKeyFromEnv",
            "useOsWindowChrome",
        ] {
            if obj.remove(key).is_some() {
                dirty = true;
            }
        }

        // 旧既定（同時DL 8 / 書き込み 4）は両方 10 へ
        let concurrent = obj.get("concurrentDownloads").and_then(|v| v.as_u64());
        let write = obj.get("maxWriteConcurrency").and_then(|v| v.as_u64());
        if concurrent == Some(8) && write == Some(4) {
            obj.insert("concurrentDownloads".into(), Value::from(10u64));
            obj.insert("maxWriteConcurrency".into(), Value::from(10u64));
            dirty = true;
        }

        const LAUNCHER_MIN_W: u64 = 960;
        const LAUNCHER_MIN_H: u64 = 540;
        const GAME_MIN_W: u64 = 1280;
        const GAME_MIN_H: u64 = 720;
        if let Some(w) = obj.get("launcherWindowWidth").and_then(|v| v.as_u64()) {
            if w < LAUNCHER_MIN_W {
                obj.insert("launcherWindowWidth".into(), Value::from(LAUNCHER_MIN_W));
                dirty = true;
            }
        }
        if let Some(h) = obj.get("launcherWindowHeight").and_then(|v| v.as_u64()) {
            if h < LAUNCHER_MIN_H {
                obj.insert("launcherWindowHeight".into(), Value::from(LAUNCHER_MIN_H));
                dirty = true;
            }
        }
        if let Some(w) = obj.get("gameWindowWidth").and_then(|v| v.as_u64()) {
            if w < GAME_MIN_W {
                obj.insert("gameWindowWidth".into(), Value::from(GAME_MIN_W));
                dirty = true;
            }
        }
        if let Some(h) = obj.get("gameWindowHeight").and_then(|v| v.as_u64()) {
            if h < GAME_MIN_H {
                obj.insert("gameWindowHeight".into(), Value::from(GAME_MIN_H));
                dirty = true;
            }
        }

        // カラーテーマにアクセントが無い旧設定へ既定値を足す
        if obj.get("themeMode").and_then(|v| v.as_str()) == Some("color")
            && (obj.get("themeAccentColor").is_none()
                || obj.get("themeAccentColor").map(|v| v.is_null()).unwrap_or(false))
        {
            obj.insert(
                "themeAccentColor".into(),
                json!({ "r": 91, "g": 164, "b": 217 }),
            );
            dirty = true;
        }

        // 既存ユーザーの settings.json にはインストールチュートリアル未実施扱いにしない
        if !obj.contains_key("installOnboardingCompleted") {
            obj.insert("installOnboardingCompleted".into(), Value::Bool(true));
            dirty = true;
        }

        // UIサイズ: minimal→compact / 旧 normal(1.0)→一時 large → 標準を normal(1.0) に戻す
        let version = obj
            .get("uiScaleVersion")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        if version < 2 {
            match obj.get("uiScale").and_then(|v| v.as_str()) {
                Some("minimal") => {
                    obj.insert("uiScale".into(), Value::String("compact".into()));
                }
                Some("normal") => {
                    obj.insert("uiScale".into(), Value::String("large".into()));
                }
                _ => {}
            }
            obj.insert("uiScaleVersion".into(), Value::from(2));
            dirty = true;
        }
        let version = obj
            .get("uiScaleVersion")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        if version < 3 {
            // v2 で標準サイズ扱いだった large を、新しい標準 normal へ寄せる
            if obj.get("uiScale").and_then(|v| v.as_str()) == Some("large") {
                obj.insert("uiScale".into(), Value::String("normal".into()));
            }
            obj.insert("uiScaleVersion".into(), Value::from(3));
            dirty = true;
        }
        dirty
    }
}

fn merge_defaults(mut defaults: Value, overlay: Value) -> Value {
    deep_merge(&mut defaults, &overlay);
    defaults
}

fn deep_merge(target: &mut Value, patch: &Value) {
    match (target, patch) {
        (Value::Object(t), Value::Object(p)) => {
            for (k, v) in p {
                if v.is_null() {
                    t.insert(k.clone(), Value::Null);
                    continue;
                }
                match t.get_mut(k) {
                    Some(existing) if existing.is_object() && v.is_object() => {
                        deep_merge(existing, v);
                    }
                    _ => {
                        t.insert(k.clone(), v.clone());
                    }
                }
            }
        }
        (t, p) => *t = p.clone(),
    }
}
