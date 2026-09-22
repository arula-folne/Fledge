use crate::error::{CoreError, CoreResult};
use crate::settings::SettingsStore;
use serde_json::{json, Map, Value};
use std::fs;

const FORMAT: &str = "fledge-option";
const VERSION: u64 = 1;

const EXCLUDED_KEYS: &[&str] = &[
    "selectedInstanceId",
    "lastPlayedInstanceId",
    "libraryInstanceOrder",
    "msaClientId",
    "updateAckPending",
    "lastAppVersion",
    "fullscreen",
    "windowWidth",
    "windowHeight",
    "minecraftInitialSettingsLocked",
];

fn is_excluded(key: &str) -> bool {
    EXCLUDED_KEYS.iter().any(|k| *k == key)
}

fn pick_portable(settings: &Value) -> Value {
    let Some(obj) = settings.as_object() else {
        return json!({});
    };
    let mut out = Map::new();
    for (key, value) in obj {
        if is_excluded(key) {
            continue;
        }
        out.insert(key.clone(), value.clone());
    }
    Value::Object(out)
}

/// 現在の設定から option.flg テキストを生成
pub fn build_options_flg_text(settings: &Value) -> CoreResult<String> {
    let envelope = json!({
      "format": FORMAT,
      "version": VERSION,
      "exportedAt": chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
      "settings": pick_portable(settings),
    });
    let mut text = serde_json::to_string_pretty(&envelope)?;
    text.push('\n');
    Ok(text)
}

/// .flg テキストを Partial settings に変換
pub fn parse_options_flg_text(raw: &str) -> CoreResult<Value> {
    let trimmed = raw.trim_start_matches('\u{feff}').trim();
    if trimmed.is_empty() {
        return Err(CoreError::msg("設定ファイルが空です"));
    }
    let parsed: Value = serde_json::from_str(trimmed).map_err(|_| {
        CoreError::msg("設定ファイルの形式が正しくありません（JSON テキストである必要があります）")
    })?;

    let settings_raw = if parsed.get("format").and_then(|v| v.as_str()) == Some(FORMAT) {
        let version = parsed
            .get("version")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        if version == 0 {
            return Err(CoreError::msg("設定ファイルの version が不正です"));
        }
        if version > VERSION {
            return Err(CoreError::msg(format!(
                "この設定ファイルは新しい形式（version {version}）です。アプリを更新してください。"
            )));
        }
        parsed
            .get("settings")
            .cloned()
            .ok_or_else(|| CoreError::msg("設定ファイルに settings がありません"))?
    } else if parsed.is_object() {
        parsed
    } else {
        return Err(CoreError::msg("設定ファイルの内容を読めませんでした"));
    };

    let Some(obj) = settings_raw.as_object() else {
        return Err(CoreError::msg("設定ファイルの内容を読めませんでした"));
    };
    let mut cleaned = Map::new();
    for (key, value) in obj {
        if is_excluded(key) {
            continue;
        }
        cleaned.insert(key.clone(), value.clone());
    }
    Ok(Value::Object(cleaned))
}

pub fn write_options_flg_file(store: &SettingsStore, path: &str) -> CoreResult<()> {
    let settings = store.get()?;
    let text = build_options_flg_text(&settings)?;
    fs::write(path, text)?;
    Ok(())
}

pub fn read_and_import_options_flg_file(store: &SettingsStore, path: &str) -> CoreResult<Value> {
    let raw = fs::read_to_string(path)?;
    let partial = parse_options_flg_text(&raw)?;
    store.set(partial)
}
