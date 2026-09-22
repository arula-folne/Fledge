//! Local skin library + Minecraft services upload.

use crate::auth::AuthProvider;
use crate::error::{CoreError, CoreResult};
use crate::paths::PathLayout;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use parking_lot::Mutex;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use uuid::Uuid;

const MAX_UPLOADED_SKINS: usize = 10;
const SKIN_THUMB_VERSION: u32 = 3;
const SKIN_UPLOAD_URL: &str = "https://api.minecraftservices.com/minecraft/profile/skins";
const PROFILE_URL: &str = "https://api.minecraftservices.com/minecraft/profile";
const CAPE_ACTIVE_URL: &str = "https://api.minecraftservices.com/minecraft/profile/capes/active";
const UA_UPLOAD: &str = "Fledge/0.5.0 (skin-upload)";
const UA_PROFILE: &str = "Fledge/0.5.0 (skin-profile)";
const UA_TEXTURE: &str = "Fledge/0.5.0 (skin-texture)";
const UA_CAPE: &str = "Fledge/0.5.0 (cape)";

fn default_skins() -> Vec<Value> {
    vec![
        json!({"id":"steve","name":"Steve","source":"default","model":"wide","previewColor":"#8B6B4A"}),
        json!({"id":"alex","name":"Alex","source":"default","model":"slim","previewColor":"#C48A5A"}),
        json!({"id":"ari","name":"Ari","source":"default","model":"wide","previewColor":"#6B8E6B"}),
        json!({"id":"efe","name":"Efe","source":"default","model":"wide","previewColor":"#4A4A4A"}),
        json!({"id":"kai","name":"Kai","source":"default","model":"wide","previewColor":"#5A7A9A"}),
        json!({"id":"makena","name":"Makena","source":"default","model":"slim","previewColor":"#9A6B5A"}),
        json!({"id":"noor","name":"Noor","source":"default","model":"slim","previewColor":"#7A5A8A"}),
        json!({"id":"sunny","name":"Sunny","source":"default","model":"wide","previewColor":"#D4A84A"}),
        json!({"id":"zuri","name":"Zuri","source":"default","model":"wide","previewColor":"#5A8A7A"}),
    ]
}

pub struct SkinStore {
    layout: PathLayout,
    default_skins_dir: Option<PathBuf>,
    meta_lock: Mutex<()>,
}

impl SkinStore {
    pub fn new(layout: PathLayout, default_skins_dir: Option<PathBuf>) -> Self {
        Self {
            layout,
            default_skins_dir,
            meta_lock: Mutex::new(()),
        }
    }

    fn meta_path(&self) -> PathBuf {
        PathBuf::from(&self.layout.skins).join("uploaded.json")
    }

    fn thumbs_dir(&self) -> PathBuf {
        PathBuf::from(&self.layout.skins).join("thumbs")
    }

    pub fn list(&self) -> CoreResult<Value> {
        let uploaded = self.read_uploaded()?;
        let mut out = default_skins();
        for u in uploaded {
            out.push(to_upload_entry(&u));
        }
        Ok(Value::Array(out))
    }

    pub fn upload(
        &self,
        name: &str,
        model: &str,
        bytes: &[u8],
        original_name: &str,
        thumb: Option<(& [u8], &str)>,
        prepend: bool,
    ) -> CoreResult<Value> {
        let _guard = self.meta_lock.lock();
        fs::create_dir_all(&self.layout.skins)?;
        let mut list = self.read_uploaded()?;
        if list.len() >= MAX_UPLOADED_SKINS {
            if prepend {
                if let Some(evicted) = list.pop() {
                    let file = evicted
                        .get("fileName")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    let _ = fs::remove_file(PathBuf::from(&self.layout.skins).join(file));
                    if let Some(id) = evicted.get("id").and_then(|v| v.as_str()) {
                        let _ = self.remove_thumbs(id);
                    }
                }
            } else {
                return Err(CoreError::msg(format!(
                    "Maximum of {MAX_UPLOADED_SKINS} uploaded skins"
                )));
            }
        }
        let id = Uuid::new_v4().to_string();
        let ext = Path::new(original_name)
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| format!(".{}", e.to_ascii_lowercase()))
            .unwrap_or_else(|| ".png".into());
        let file_name = format!("{id}{ext}");
        fs::write(PathBuf::from(&self.layout.skins).join(&file_name), bytes)?;
        let fallback = Path::new(original_name)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Skin");
        let entry = json!({
          "id": id,
          "name": sanitize_skin_name(name, fallback),
          "model": model,
          "fileName": file_name
        });
        if prepend {
            list.insert(0, entry.clone());
        } else {
            list.push(entry.clone());
        }
        fs::write(self.meta_path(), serde_json::to_string_pretty(&list)?)?;
        if let Some((thumb_bytes, ext)) = thumb {
            self.write_thumb(&id, model, thumb_bytes, ext)?;
        }
        Ok(to_upload_entry(&entry))
    }

    pub fn update(
        &self,
        id: &str,
        name: Option<&str>,
        model: Option<&str>,
        bytes: Option<&[u8]>,
        original_name: Option<&str>,
    ) -> CoreResult<Value> {
        let _guard = self.meta_lock.lock();
        let mut list = self.read_uploaded()?;
        let target = list
            .iter_mut()
            .find(|s| s.get("id").and_then(|v| v.as_str()) == Some(id))
            .ok_or_else(|| CoreError::msg(format!("Skin not found: {id}")))?;
        if let Some(name) = name {
            let fallback = target
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("Skin")
                .to_string();
            target
                .as_object_mut()
                .unwrap()
                .insert("name".into(), json!(sanitize_skin_name(name, &fallback)));
        }
        if let Some(model) = model {
            target
                .as_object_mut()
                .unwrap()
                .insert("model".into(), json!(model));
        }
        let mut replaced_png = false;
        if let Some(bytes) = bytes {
            let original = original_name.unwrap_or("skin.png");
            let ext = Path::new(original)
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| format!(".{}", e.to_ascii_lowercase()))
                .unwrap_or_else(|| ".png".into());
            let next_file_name = format!("{id}{ext}");
            let prev_file = target
                .get("fileName")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            if prev_file.as_deref() != Some(next_file_name.as_str()) {
                if let Some(prev) = prev_file {
                    let _ = fs::remove_file(PathBuf::from(&self.layout.skins).join(prev));
                }
                target
                    .as_object_mut()
                    .unwrap()
                    .insert("fileName".into(), json!(next_file_name.clone()));
            }
            fs::write(
                PathBuf::from(&self.layout.skins).join(&next_file_name),
                bytes,
            )?;
            replaced_png = true;
        }
        if replaced_png || model.is_some() {
            self.remove_thumbs(id)?;
        }
        let out = to_upload_entry(target);
        fs::write(self.meta_path(), serde_json::to_string_pretty(&list)?)?;
        Ok(out)
    }

    pub fn remove(&self, id: &str) -> CoreResult<()> {
        let _guard = self.meta_lock.lock();
        let mut list = self.read_uploaded()?;
        let Some(pos) = list
            .iter()
            .position(|s| s.get("id").and_then(|v| v.as_str()) == Some(id))
        else {
            return Ok(());
        };
        let target = list.remove(pos);
        fs::write(self.meta_path(), serde_json::to_string_pretty(&list)?)?;
        if let Some(file) = target.get("fileName").and_then(|v| v.as_str()) {
            let _ = fs::remove_file(PathBuf::from(&self.layout.skins).join(file));
        }
        let _ = self.remove_thumbs(id);
        Ok(())
    }

    pub fn read_png_bytes(&self, id: &str) -> CoreResult<Option<Vec<u8>>> {
        let Some(path) = self.resolve_png_path(id)? else {
            return Ok(None);
        };
        Ok(Some(fs::read(path)?))
    }

    /// WebView の asset プロトコル用。画像本体は IPC せずパスだけ返す。
    pub fn resolve_png_path(&self, id: &str) -> CoreResult<Option<String>> {
        let skins = self.list()?;
        let skin = skins
            .as_array()
            .and_then(|arr| {
                arr.iter()
                    .find(|s| s.get("id").and_then(|v| v.as_str()) == Some(id))
            })
            .cloned();
        let Some(skin) = skin else {
            return Ok(None);
        };
        let source = skin.get("source").and_then(|v| v.as_str()).unwrap_or("");
        if source == "upload" {
            if let Some(file) = skin.get("fileName").and_then(|v| v.as_str()) {
                let path = PathBuf::from(&self.layout.skins).join(file);
                if path.exists() {
                    return Ok(Some(path.to_string_lossy().into_owned()));
                }
            }
        }
        if source == "default" {
            if let Some(dir) = &self.default_skins_dir {
                let path = dir.join(format!("{id}.png"));
                if path.exists() {
                    return Ok(Some(path.to_string_lossy().into_owned()));
                }
            }
        }
        Ok(None)
    }

    pub fn hash_uploaded_png(&self, id: &str) -> CoreResult<Option<String>> {
        let Some(bytes) = self.read_png_bytes(id)? else {
            return Ok(None);
        };
        let mut hasher = Sha256::new();
        hasher.update(&bytes);
        Ok(Some(hex::encode(hasher.finalize())))
    }

    pub fn read_data_url(&self, id: &str) -> CoreResult<Option<String>> {
        let Some(bytes) = self.read_png_bytes(id)? else {
            return Ok(None);
        };
        Ok(Some(format!(
            "data:image/png;base64,{}",
            B64.encode(bytes)
        )))
    }

    pub fn resolve_thumb_path(&self, id: &str, model: &str) -> CoreResult<Option<String>> {
        for ext in ["webp", "png"] {
            let path = self.thumb_file(id, model, ext)?;
            if path.exists() {
                return Ok(Some(path.to_string_lossy().into_owned()));
            }
        }
        Ok(None)
    }

    pub fn read_thumb_data_url(&self, id: &str, model: &str) -> CoreResult<Option<String>> {
        for (ext, mime) in [("webp", "image/webp"), ("png", "image/png")] {
            let path = self.thumb_file(id, model, ext)?;
            if path.exists() {
                let buf = fs::read(path)?;
                return Ok(Some(format!("data:{mime};base64,{}", B64.encode(buf))));
            }
        }
        Ok(None)
    }

    pub fn write_thumb(&self, id: &str, model: &str, bytes: &[u8], ext: &str) -> CoreResult<()> {
        fs::create_dir_all(self.thumbs_dir())?;
        fs::write(self.thumb_file(id, model, ext)?, bytes)?;
        Ok(())
    }

    fn thumb_file(&self, id: &str, model: &str, ext: &str) -> CoreResult<PathBuf> {
        if !id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        {
            return Err(CoreError::msg(format!("Invalid skin id: {id}")));
        }
        Ok(self
            .thumbs_dir()
            .join(format!("{id}.{model}.v{SKIN_THUMB_VERSION}.{ext}")))
    }

    fn remove_thumbs(&self, id: &str) -> CoreResult<()> {
        for model in ["wide", "slim"] {
            for ext in ["webp", "png"] {
                let path = self.thumb_file(id, model, ext)?;
                let _ = fs::remove_file(path);
            }
        }
        Ok(())
    }

    fn read_uploaded(&self) -> CoreResult<Vec<Value>> {
        match fs::read_to_string(self.meta_path()) {
            Ok(raw) => Ok(serde_json::from_str(&raw).unwrap_or_default()),
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
            Err(err) => Err(err.into()),
        }
    }
}

pub struct SkinApplier {
    skins: Arc<SkinStore>,
    auth: Arc<AuthProvider>,
}

impl SkinApplier {
    pub fn new(skins: Arc<SkinStore>, auth: Arc<AuthProvider>) -> Self {
        Self { skins, auth }
    }

    pub async fn apply(&self, skin_id: &str, model: &str, account_id: &str) -> CoreResult<()> {
        let png = self
            .skins
            .read_png_bytes(skin_id)?
            .ok_or_else(|| CoreError::msg("スキン画像が見つかりません"))?;
        // Force refresh: drop cache entry then ensure
        self.auth.invalidate_cache(Some(account_id));
        let creds = self.auth.ensure_credentials(Some(account_id)).await?;
        let token = creds
            .get("accessToken")
            .and_then(|v| v.as_str())
            .ok_or_else(|| CoreError::msg("auth.error.refreshFailed"))?;
        let variant = if model == "slim" { "slim" } else { "classic" };
        upload_minecraft_skin(token, &png, variant).await?;
        Ok(())
    }

    pub async fn list_capes(&self, account_id: &str) -> CoreResult<Value> {
        let creds = self.auth.ensure_credentials(Some(account_id)).await?;
        let token = creds
            .get("accessToken")
            .and_then(|v| v.as_str())
            .ok_or_else(|| CoreError::msg("auth.error.refreshFailed"))?;
        fetch_minecraft_capes(token).await
    }

    pub async fn select_cape(&self, account_id: &str, cape_id: Option<&str>) -> CoreResult<Value> {
        self.auth.invalidate_cache(Some(account_id));
        let creds = self.auth.ensure_credentials(Some(account_id)).await?;
        let token = creds
            .get("accessToken")
            .and_then(|v| v.as_str())
            .ok_or_else(|| CoreError::msg("auth.error.refreshFailed"))?;
        set_active_minecraft_cape(token, cape_id).await?;
        fetch_minecraft_capes(token).await
    }
}

pub async fn fetch_active_minecraft_skin(access_token: &str) -> CoreResult<Option<(Vec<u8>, String)>> {
    let client = reqwest::Client::new();
    let profile_res = client
        .get(PROFILE_URL)
        .header("Authorization", format!("Bearer {access_token}"))
        .header("Accept", "application/json")
        .header("User-Agent", UA_PROFILE)
        .send()
        .await
        .map_err(|e| CoreError::msg(e.to_string()))?;
    if !profile_res.status().is_success() {
        return Ok(None);
    }
    let json: Value = profile_res
        .json()
        .await
        .map_err(|e| CoreError::msg(e.to_string()))?;
    let active = json
        .get("skins")
        .and_then(|v| v.as_array())
        .and_then(|arr| {
            arr.iter().find(|s| {
                s.get("state").and_then(|v| v.as_str()) == Some("ACTIVE")
                    && s.get("url").and_then(|v| v.as_str()).is_some()
            })
        });
    let Some(active) = active else {
        return Ok(None);
    };
    let url = active.get("url").and_then(|v| v.as_str()).unwrap();
    let tex = client
        .get(url)
        .header("User-Agent", UA_TEXTURE)
        .send()
        .await
        .map_err(|e| CoreError::msg(e.to_string()))?;
    if !tex.status().is_success() {
        return Ok(None);
    }
    let buf = tex
        .bytes()
        .await
        .map_err(|e| CoreError::msg(e.to_string()))?
        .to_vec();
    if buf.len() < 64 {
        return Ok(None);
    }
    let variant = active
        .get("variant")
        .and_then(|v| v.as_str())
        .unwrap_or("CLASSIC")
        .to_ascii_uppercase();
    let model = if variant == "SLIM" { "slim" } else { "wide" };
    Ok(Some((buf, model.to_string())))
}

pub fn hash_skin_png(png: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(png);
    hex::encode(hasher.finalize())
}

async fn upload_minecraft_skin(access_token: &str, png: &[u8], variant: &str) -> CoreResult<()> {
    let part = reqwest::multipart::Part::bytes(png.to_vec())
        .file_name("skin.png")
        .mime_str("image/png")
        .map_err(|e| CoreError::msg(e.to_string()))?;
    let form = reqwest::multipart::Form::new()
        .text("variant", variant.to_string())
        .part("file", part);
    let client = reqwest::Client::new();
    let res = client
        .post(SKIN_UPLOAD_URL)
        .header("Authorization", format!("Bearer {access_token}"))
        .header("Accept", "application/json")
        .header("User-Agent", UA_UPLOAD)
        .multipart(form)
        .send()
        .await
        .map_err(|e| CoreError::msg(e.to_string()))?;
    let status = res.status();
    if status.is_success() {
        return Ok(());
    }
    let detail = res.text().await.unwrap_or_default();
    if status.as_u16() == 401 || status.as_u16() == 403 {
        return Err(CoreError::msg(
            "スキンの適用に失敗しました。再ログインしてからやり直してください。",
        ));
    }
    if status.as_u16() == 429 {
        return Err(CoreError::msg(
            "スキン変更の回数制限に達しました。しばらく待ってからやり直してください。",
        ));
    }
    Err(CoreError::msg(if detail.is_empty() {
        format!("スキンの適用に失敗しました ({status})")
    } else {
        format!(
            "スキンの適用に失敗しました ({status}): {}",
            detail.chars().take(180).collect::<String>()
        )
    }))
}

async fn fetch_minecraft_capes(access_token: &str) -> CoreResult<Value> {
    let client = reqwest::Client::new();
    let profile_res = client
        .get(PROFILE_URL)
        .header("Authorization", format!("Bearer {access_token}"))
        .header("Accept", "application/json")
        .header("User-Agent", UA_CAPE)
        .send()
        .await
        .map_err(|e| CoreError::msg(e.to_string()))?;
    if !profile_res.status().is_success() {
        let status = profile_res.status();
        return Err(CoreError::msg(format!(
            "マントの取得に失敗しました ({status})"
        )));
    }
    let json: Value = profile_res
        .json()
        .await
        .map_err(|e| CoreError::msg(e.to_string()))?;
    let mut out = Vec::new();
    if let Some(arr) = json.get("capes").and_then(|v| v.as_array()) {
        for c in arr {
            let Some(id) = c.get("id").and_then(|v| v.as_str()) else {
                continue;
            };
            let active = c
                .get("state")
                .and_then(|v| v.as_str())
                .map(|s| s.eq_ignore_ascii_case("ACTIVE"))
                .unwrap_or(false);
            out.push(json!({
                "id": id,
                "alias": c.get("alias").and_then(|v| v.as_str()),
                "url": c.get("url").and_then(|v| v.as_str()),
                "active": active,
            }));
        }
    }
    Ok(Value::Array(out))
}

/// WebView から textures.minecraft.net を直接読むと CORS で落ちることがあるため、
/// ランチャー側で取得して data URL にする。
pub async fn fetch_cape_texture_data_url(url: &str) -> CoreResult<String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err(CoreError::msg("empty cape texture url"));
    }
    // Mojang はしばしば http://textures.minecraft.net/... を返す。https に揃える。
    let normalized = if trimmed.starts_with("http://") {
        format!("https://{}", &trimmed["http://".len()..])
    } else {
        trimmed.to_string()
    };
    let mut parsed = reqwest::Url::parse(&normalized).map_err(|e| CoreError::msg(e.to_string()))?;
    if parsed.scheme() == "http" {
        let _ = parsed.set_scheme("https");
    }
    let host = parsed.host_str().unwrap_or("");
    let allowed = host.eq_ignore_ascii_case("textures.minecraft.net")
        || host.eq_ignore_ascii_case("launchercontent.mojang.com");
    if parsed.scheme() != "https" || !allowed {
        return Err(CoreError::msg("unsupported cape texture host"));
    }
    let client = reqwest::Client::new();
    let res = client
        .get(parsed)
        .header("User-Agent", UA_TEXTURE)
        .header("Accept", "image/png,image/*,*/*")
        .send()
        .await
        .map_err(|e| CoreError::msg(e.to_string()))?;
    if !res.status().is_success() {
        return Err(CoreError::msg(format!(
            "cape texture fetch failed ({})",
            res.status()
        )));
    }
    let bytes = res
        .bytes()
        .await
        .map_err(|e| CoreError::msg(e.to_string()))?;
    if bytes.len() < 64 {
        return Err(CoreError::msg("cape texture too small"));
    }
    let mime = "image/png";
    Ok(format!("data:{mime};base64,{}", B64.encode(bytes)))
}

async fn set_active_minecraft_cape(access_token: &str, cape_id: Option<&str>) -> CoreResult<()> {
    let client = reqwest::Client::new();
    let res = if let Some(id) = cape_id {
        client
            .put(CAPE_ACTIVE_URL)
            .header("Authorization", format!("Bearer {access_token}"))
            .header("Accept", "application/json")
            .header("Content-Type", "application/json")
            .header("User-Agent", UA_CAPE)
            .json(&json!({ "capeId": id }))
            .send()
            .await
            .map_err(|e| CoreError::msg(e.to_string()))?
    } else {
        client
            .delete(CAPE_ACTIVE_URL)
            .header("Authorization", format!("Bearer {access_token}"))
            .header("Accept", "application/json")
            .header("User-Agent", UA_CAPE)
            .send()
            .await
            .map_err(|e| CoreError::msg(e.to_string()))?
    };
    if res.status().is_success() || res.status().as_u16() == 404 {
        return Ok(());
    }
    let status = res.status();
    let detail = res.text().await.unwrap_or_default();
    Err(CoreError::msg(if detail.is_empty() {
        format!("マントの適用に失敗しました ({status})")
    } else {
        format!(
            "マントの適用に失敗しました ({status}): {}",
            detail.chars().take(180).collect::<String>()
        )
    }))
}

fn to_upload_entry(entry: &Value) -> Value {
    json!({
      "id": entry.get("id"),
      "name": entry.get("name"),
      "source": "upload",
      "model": entry.get("model"),
      "fileName": entry.get("fileName")
    })
}

fn sanitize_skin_name(name: &str, fallback: &str) -> String {
    let trimmed: String = name.trim().chars().take(32).collect();
    if !trimmed.is_empty() {
        return trimmed;
    }
    let fb: String = fallback.trim().chars().take(32).collect();
    if fb.is_empty() {
        "Skin".into()
    } else {
        fb
    }
}

pub fn decode_thumb_data_url(data_url: &str) -> CoreResult<(Vec<u8>, String)> {
    let (meta, b64) = data_url
        .split_once(',')
        .ok_or_else(|| CoreError::msg("Invalid thumb data URL"))?;
    let ext = if meta.contains("image/webp") {
        "webp"
    } else {
        "png"
    };
    let bytes = B64
        .decode(b64.trim())
        .map_err(|e| CoreError::msg(e.to_string()))?;
    Ok((bytes, ext.to_string()))
}
