use crate::error::{CoreError, CoreResult};
use reqwest::Client;
use serde::Deserialize;
use serde_json::json;
use std::time::Duration;
use url::form_urlencoded;

pub const DEFAULT_MSA_CLIENT_ID: &str = "00000000402b5328";
pub const MSA_REDIRECT_URI: &str = "https://login.live.com/oauth20_desktop.srf";

const FETCH_TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Debug, Clone)]
pub struct MsTokens {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: u64,
}

#[derive(Debug, Clone)]
pub struct MinecraftSession {
    pub access_token: String,
    pub uuid: String,
    pub name: String,
    pub expires_at_ms: u64,
}

pub fn auth_authorize_url(client_id: &str) -> String {
    let redirect = form_urlencoded::byte_serialize(MSA_REDIRECT_URI.as_bytes()).collect::<String>();
    format!(
        "https://login.live.com/oauth20_authorize.srf?client_id={client_id}&response_type=code&redirect_uri={redirect}&scope=XboxLive.signin%20offline_access&prompt=select_account&mkt=ja-JP"
    )
}

pub fn extract_code_from_url(raw: &str) -> Option<String> {
    if let Ok(url) = url::Url::parse(raw) {
        return url.query_pairs().find(|(k, _)| k == "code").map(|(_, v)| v.to_string());
    }
    let q = raw.split_once('?').map(|(_, rest)| rest).unwrap_or(raw);
    url::form_urlencoded::parse(q.as_bytes())
        .find(|(k, _)| k == "code")
        .map(|(_, v)| v.to_string())
}

fn client() -> Client {
    Client::builder()
        .timeout(FETCH_TIMEOUT)
        .build()
        .expect("reqwest client")
}

pub async fn exchange_auth_code(client_id: &str, code: &str) -> CoreResult<MsTokens> {
    let body = form_urlencoded::Serializer::new(String::new())
        .append_pair("client_id", client_id)
        .append_pair("code", code)
        .append_pair("grant_type", "authorization_code")
        .append_pair("redirect_uri", MSA_REDIRECT_URI)
        .finish();
    post_ms_token(&body).await
}

pub async fn exchange_refresh_token(client_id: &str, refresh_token: &str) -> CoreResult<MsTokens> {
    let body = form_urlencoded::Serializer::new(String::new())
        .append_pair("client_id", client_id)
        .append_pair("refresh_token", refresh_token)
        .append_pair("grant_type", "refresh_token")
        .finish();
    post_ms_token(&body).await
}

async fn post_ms_token(body: &str) -> CoreResult<MsTokens> {
    let res = client()
        .post("https://login.live.com/oauth20_token.srf")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(body.to_string())
        .send()
        .await
        .map_err(|e| CoreError::msg(format!("error.auth.microsoft: {e}")))?;
    let status = res.status();
    let json: serde_json::Value = res
        .json()
        .await
        .map_err(|e| CoreError::msg(format!("error.auth.microsoft: {e}")))?;
    let access = json
        .get("access_token")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let refresh = json
        .get("refresh_token")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if !status.is_success() || access.is_empty() || refresh.is_empty() {
        return Err(CoreError::msg("error.auth.microsoft"));
    }
    Ok(MsTokens {
        access_token: access.to_string(),
        refresh_token: refresh.to_string(),
        expires_in: json.get("expires_in").and_then(|v| v.as_u64()).unwrap_or(3600),
    })
}

async fn xbox_user_token(ms_access: &str) -> CoreResult<String> {
    let res = client()
        .post("https://user.auth.xboxlive.com/user/authenticate")
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&json!({
          "Properties": {
            "AuthMethod": "RPS",
            "SiteName": "user.auth.xboxlive.com",
            "RpsTicket": format!("d={ms_access}")
          },
          "RelyingParty": "http://auth.xboxlive.com",
          "TokenType": "JWT"
        }))
        .send()
        .await
        .map_err(|e| CoreError::msg(format!("error.auth.xboxLive: {e}")))?;
    let json: serde_json::Value = res
        .json()
        .await
        .map_err(|e| CoreError::msg(format!("error.auth.xboxLive: {e}")))?;
    json.get("Token")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| CoreError::msg("error.auth.xboxLive"))
}

fn xsts_error_message(xerr: Option<i64>) -> &'static str {
    match xerr {
        Some(2148916233) => "error.auth.xsts.noXboxAccount",
        Some(2148916235) => "error.auth.xsts.region",
        Some(2148916236) | Some(2148916237) => "error.auth.xsts.adultVerification",
        Some(2148916238) => "error.auth.xsts.childAccount",
        _ => "error.auth.xsts",
    }
}

async fn minecraft_identity_token(xbl_token: &str) -> CoreResult<String> {
    let res = client()
        .post("https://xsts.auth.xboxlive.com/xsts/authorize")
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&json!({
          "Properties": {
            "SandboxId": "RETAIL",
            "UserTokens": [xbl_token]
          },
          "RelyingParty": "rp://api.minecraftservices.com/",
          "TokenType": "JWT"
        }))
        .send()
        .await
        .map_err(|e| CoreError::msg(format!("error.auth.xsts: {e}")))?;
    let status = res.status();
    let json: serde_json::Value = res
        .json()
        .await
        .map_err(|e| CoreError::msg(format!("error.auth.xsts: {e}")))?;
    let uhs = json
        .pointer("/DisplayClaims/xui/0/uhs")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let token = json.get("Token").and_then(|v| v.as_str()).unwrap_or("");
    if !status.is_success() || uhs.is_empty() || token.is_empty() {
        let xerr = json.get("XErr").and_then(|v| v.as_i64());
        return Err(CoreError::msg(xsts_error_message(xerr)));
    }
    Ok(format!("XBL3.0 x={uhs};{token}"))
}

pub async fn minecraft_from_ms_tokens(ms: &MsTokens) -> CoreResult<MinecraftSession> {
    let xbl = xbox_user_token(&ms.access_token).await?;
    let identity = minecraft_identity_token(&xbl).await?;

    let login = client()
        .post("https://api.minecraftservices.com/authentication/login_with_xbox")
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&json!({ "identityToken": identity }))
        .send()
        .await
        .map_err(|e| CoreError::msg(format!("error.auth.minecraft.login: {e}")))?;
    let login_json: serde_json::Value = login
        .json()
        .await
        .map_err(|e| CoreError::msg(format!("error.auth.minecraft.login: {e}")))?;
    let access_token = login_json
        .get("access_token")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if access_token.is_empty() {
        return Err(CoreError::msg("error.auth.minecraft.login"));
    }

    let profile = client()
        .get("https://api.minecraftservices.com/minecraft/profile")
        .header("Accept", "application/json")
        .header("Authorization", format!("Bearer {access_token}"))
        .send()
        .await
        .map_err(|e| CoreError::msg(format!("error.auth.minecraft.profile: {e}")))?;
    let profile_status = profile.status();
    let profile_json: serde_json::Value = profile
        .json()
        .await
        .unwrap_or(json!({}));
    let id = profile_json
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let name = profile_json
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    if profile_status.is_success() && !id.is_empty() && !name.is_empty() {
        let now = chrono::Utc::now().timestamp_millis() as u64;
        // Minecraft セッショントークンは通常約24時間。MSA expires_in(約1h)より長く持つ。
        let mc_ttl_ms = 23 * 60 * 60 * 1000;
        let ms_ttl_ms = ms.expires_in.saturating_mul(1000).saturating_sub(60_000);
        return Ok(MinecraftSession {
            access_token,
            uuid: id,
            name,
            expires_at_ms: now + mc_ttl_ms.max(ms_ttl_ms),
        });
    }

    let entitlements = client()
        .get("https://api.minecraftservices.com/entitlements/mcstore")
        .header("Accept", "application/json")
        .header("Authorization", format!("Bearer {access_token}"))
        .send()
        .await
        .map_err(|e| CoreError::msg(format!("error.auth.minecraft.notOwned: {e}")))?;
    #[derive(Deserialize)]
    struct Store {
        items: Option<Vec<Item>>,
    }
    #[derive(Deserialize)]
    struct Item {
        name: Option<String>,
    }
    let store: Store = entitlements.json().await.unwrap_or(Store { items: None });
    let owned = store
        .items
        .unwrap_or_default()
        .into_iter()
        .any(|i| matches!(i.name.as_deref(), Some("game_minecraft" | "product_minecraft")));
    if !owned {
        return Err(CoreError::msg("error.auth.minecraft.notOwned"));
    }

    let now = chrono::Utc::now().timestamp_millis() as u64;
    let mc_ttl_ms = 23 * 60 * 60 * 1000;
    let ms_ttl_ms = ms.expires_in.saturating_mul(1000).saturating_sub(60_000);
    Ok(MinecraftSession {
        access_token,
        uuid: if id.is_empty() { "unknown".into() } else { id },
        name: if name.is_empty() { "Player".into() } else { name },
        expires_at_ms: now + mc_ttl_ms.max(ms_ttl_ms),
    })
}

pub async fn login_with_code(client_id: &str, code: &str) -> CoreResult<(MsTokens, MinecraftSession)> {
    let ms = exchange_auth_code(client_id, code).await?;
    let mc = minecraft_from_ms_tokens(&ms).await?;
    Ok((ms, mc))
}

pub async fn refresh_session(
    client_id: &str,
    refresh_token: &str,
) -> CoreResult<(MsTokens, MinecraftSession)> {
    let ms = exchange_refresh_token(client_id, refresh_token).await?;
    let mc = minecraft_from_ms_tokens(&ms).await?;
    Ok((ms, mc))
}

pub fn map_auth_error(err: &CoreError) -> (&'static str, &'static str) {
    let msg = err.to_string();
    if msg.contains("error.auth.xsts.noXboxAccount") {
        return ("failed", "auth.error.noXboxAccount");
    }
    if msg.contains("error.auth.xsts.childAccount") {
        return ("failed", "auth.error.childAccount");
    }
    if msg.contains("error.auth.xsts.adultVerification") {
        return ("failed", "auth.error.adultVerification");
    }
    if msg.contains("error.auth.xsts.region") {
        return ("failed", "auth.error.region");
    }
    if msg.contains("error.auth.xsts") || msg.contains("error.auth.xboxLive") {
        return ("failed", "auth.error.xbox");
    }
    if msg.contains("error.auth.minecraft.notOwned") {
        return ("minecraft_not_owned", "auth.error.notOwned");
    }
    if msg.contains("error.auth.minecraft") {
        return ("failed", "auth.error.mcLogin");
    }
    if msg.contains("error.auth.microsoft") {
        return ("failed", "auth.error.microsoft");
    }
    if msg.contains("cancel") || msg.contains("close") || msg.contains("closed") {
        return ("cancelled", "auth.error.cancelled");
    }
    ("failed", "auth.error.failed")
}
