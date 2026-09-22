use super::LoaderVersion;
use crate::error::{CoreError, CoreResult};

pub async fn fetch_loader_versions(minecraft_version: &str) -> CoreResult<Vec<LoaderVersion>> {
    let url = format!("https://meta.quiltmc.org/v3/versions/loader/{minecraft_version}");
    let client = reqwest::Client::new();
    let artifacts: Vec<serde_json::Value> = client
        .get(&url)
        .send()
        .await
        .map_err(|e| CoreError::msg(e.to_string()))?
        .error_for_status()
        .map_err(|e| CoreError::msg(e.to_string()))?
        .json()
        .await
        .map_err(|e| CoreError::msg(e.to_string()))?;

    Ok(artifacts
        .into_iter()
        .filter_map(|a| {
            let loader = a.get("loader")?;
            let version = loader.get("version")?.as_str()?.to_string();
            let stable = loader.get("stable").and_then(|v| v.as_bool());
            Some(LoaderVersion {
                id: version.clone(),
                version,
                stable,
                recommended: None,
                version_type: None,
            })
        })
        .collect())
}

/// Quilt がローダーを提供している Minecraft バージョン一覧
pub async fn fetch_game_versions() -> CoreResult<Vec<String>> {
    let client = reqwest::Client::new();
    let entries: Vec<serde_json::Value> = client
        .get("https://meta.quiltmc.org/v3/versions/game")
        .send()
        .await
        .map_err(|e| CoreError::msg(e.to_string()))?
        .error_for_status()
        .map_err(|e| CoreError::msg(e.to_string()))?
        .json()
        .await
        .map_err(|e| CoreError::msg(e.to_string()))?;

    Ok(entries
        .into_iter()
        .filter_map(|e| e.get("version")?.as_str().map(|s| s.to_string()))
        .collect())
}
