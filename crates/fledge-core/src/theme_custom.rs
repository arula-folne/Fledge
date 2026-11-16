//! カスタムテーマ背景（ユーザー画像・最大5件。追加時は手動削除が必要）。

use crate::error::{CoreError, CoreResult};
use crate::paths::PathLayout;
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub const CUSTOM_THEME_HISTORY_MAX: usize = 5;

const ALLOWED_EXT: &[&str] = &["png", "jpg", "jpeg", "webp", "gif"];

pub fn custom_themes_dir(layout: &PathLayout) -> PathBuf {
    PathBuf::from(&layout.settings)
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| PathBuf::from(&layout.settings))
        .join("themes")
        .join("custom")
}

fn sanitize_ext(path: &Path) -> CoreResult<&'static str> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    ALLOWED_EXT
        .iter()
        .find(|e| **e == ext)
        .copied()
        .ok_or_else(|| CoreError::msg("対応していない画像形式です（png / jpg / webp / gif）"))
}

pub fn resolve_custom_image_path(layout: &PathLayout, id: &str) -> CoreResult<PathBuf> {
    let id = id.trim();
    if id.is_empty() || id.contains(['/', '\\', '.', ':']) {
        return Err(CoreError::msg("invalid custom theme image id"));
    }
    let dir = custom_themes_dir(layout);
    for ext in ALLOWED_EXT {
        let candidate = dir.join(format!("{id}.{ext}"));
        if candidate.is_file() {
            return Ok(candidate);
        }
    }
    Err(CoreError::msg("カスタム背景画像が見つかりません"))
}

/// 画像を取り込み履歴先頭へ。上限に達している場合はエラー（自動削除しない）。
pub fn import_custom_image(
    layout: &PathLayout,
    source: &Path,
    current_settings: &Value,
) -> CoreResult<Value> {
    if !source.is_file() {
        return Err(CoreError::msg("画像ファイルが見つかりません"));
    }
    let history_len = current_settings
        .get("customThemeHistory")
        .and_then(|v| v.as_array())
        .map(|a| a.len())
        .unwrap_or(0);
    if history_len >= CUSTOM_THEME_HISTORY_MAX {
        return Err(CoreError::msg(format!(
            "カスタム背景は最大{CUSTOM_THEME_HISTORY_MAX}件です。追加するにはどれかを削除してください"
        )));
    }

    let ext = sanitize_ext(source)?;
    let dir = custom_themes_dir(layout);
    fs::create_dir_all(&dir)?;

    let id = Uuid::new_v4().to_string();
    let dest = dir.join(format!("{id}.{ext}"));
    fs::copy(source, &dest)?;

    let mut history: Vec<Value> = current_settings
        .get("customThemeHistory")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    // 旧データに fileName があっても id のみ残す
    for entry in &mut history {
        if let Some(obj) = entry.as_object_mut() {
            obj.remove("fileName");
        }
    }

    history.retain(|e| e.get("id").and_then(|v| v.as_str()) != Some(id.as_str()));
    history.insert(0, json!({ "id": id }));

    let selected_id = history
        .first()
        .and_then(|e| e.get("id").and_then(|v| v.as_str()))
        .unwrap_or(&id)
        .to_string();

    Ok(json!({
      "themeFamily": "custom",
      "customThemeImageId": selected_id,
      "customThemeHistory": history,
      "seasonThemeId": null,
    }))
}

pub fn remove_custom_image(
    layout: &PathLayout,
    image_id: &str,
    current_settings: &Value,
) -> CoreResult<Value> {
    let image_id = image_id.trim();
    if image_id.is_empty() {
        return Err(CoreError::msg("id required"));
    }
    let dir = custom_themes_dir(layout);
    let _ = delete_image_files(&dir, image_id);

    let mut history: Vec<Value> = current_settings
        .get("customThemeHistory")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    history.retain(|e| e.get("id").and_then(|v| v.as_str()) != Some(image_id));

    let current = current_settings
        .get("customThemeImageId")
        .and_then(|v| v.as_str());
    let next_id = if current == Some(image_id) {
        history
            .first()
            .and_then(|e| e.get("id").and_then(|v| v.as_str()))
            .map(|s| s.to_string())
    } else {
        current.map(|s| s.to_string())
    };

    let family = if next_id.is_some() {
        current_settings
            .get("themeFamily")
            .and_then(|v| v.as_str())
            .unwrap_or("custom")
    } else {
        "standard"
    };

    let mut patch = json!({
      "themeFamily": if next_id.is_none() { "standard" } else { family },
      "customThemeImageId": next_id,
      "customThemeHistory": history,
    });
    // 最後の1枚を消したときは、選んでいた色がそのまま見えるようカラーへ
    if next_id.is_none() {
        patch
            .as_object_mut()
            .unwrap()
            .insert("themeMode".into(), Value::from("color"));
    }
    Ok(patch)
}

fn delete_image_files(dir: &Path, id: &str) -> CoreResult<()> {
    for ext in ALLOWED_EXT {
        let path = dir.join(format!("{id}.{ext}"));
        if path.is_file() {
            let _ = fs::remove_file(path);
        }
    }
    Ok(())
}
