use super::VersionInfo;
use crate::error::{CoreError, CoreResult};

const MANIFEST_URL: &str = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";

pub async fn fetch_minecraft_versions() -> CoreResult<Vec<VersionInfo>> {
    let client = reqwest::Client::new();
    let manifest: serde_json::Value = client
        .get(MANIFEST_URL)
        .send()
        .await
        .map_err(|e| CoreError::msg(e.to_string()))?
        .error_for_status()
        .map_err(|e| CoreError::msg(e.to_string()))?
        .json()
        .await
        .map_err(|e| CoreError::msg(e.to_string()))?;

    let versions = manifest
        .get("versions")
        .and_then(|v| v.as_array())
        .ok_or_else(|| CoreError::msg("invalid version manifest"))?;

    Ok(versions
        .iter()
        .filter_map(|v| {
            Some(VersionInfo {
                id: v.get("id")?.as_str()?.to_string(),
                version_type: v.get("type")?.as_str()?.to_string(),
                release_time: v
                    .get("releaseTime")
                    .and_then(|t| t.as_str())
                    .unwrap_or("")
                    .to_string(),
            })
        })
        .collect())
}
