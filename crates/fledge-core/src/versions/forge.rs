use super::LoaderVersion;
use crate::error::{CoreError, CoreResult};

/// Forge maven-metadata.json — map of MC version → forge versions.
const FORGE_METADATA: &str =
    "https://files.minecraftforge.net/maven/net/minecraftforge/forge/maven-metadata.json";
const FORGE_PROMOTIONS: &str =
    "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json";

pub async fn fetch_loader_versions(minecraft_version: &str) -> CoreResult<Vec<LoaderVersion>> {
    let client = reqwest::Client::builder()
        .user_agent("Fledge/0.5.0 (forge-versions)")
        .build()
        .map_err(|e| CoreError::msg(e.to_string()))?;

    let recommended = fetch_recommended(&client, minecraft_version).await;

    let metadata: serde_json::Value = client
        .get(FORGE_METADATA)
        .send()
        .await
        .map_err(|e| CoreError::msg(e.to_string()))?
        .error_for_status()
        .map_err(|e| CoreError::msg(e.to_string()))?
        .json()
        .await
        .map_err(|e| CoreError::msg(e.to_string()))?;

    // Shape A: { "1.20.1": ["1.20.1-47.2.0", ...] } or ["47.2.0", ...]
    // Shape B: { "versions": { "1.20.1": [...] } } or array of "mc-forge"
    let mut versions: Vec<String> = Vec::new();
    if let Some(arr) = metadata.get(minecraft_version).and_then(|v| v.as_array()) {
        versions = arr
            .iter()
            .filter_map(|v| v.as_str())
            .map(|s| normalize_forge_version(s, minecraft_version))
            .collect();
    } else if let Some(arr) = metadata
        .pointer(&format!("/versions/{minecraft_version}"))
        .and_then(|v| v.as_array())
    {
        versions = arr
            .iter()
            .filter_map(|v| v.as_str())
            .map(|s| normalize_forge_version(s, minecraft_version))
            .collect();
    } else if let Some(arr) = metadata.as_array() {
        let prefix = format!("{minecraft_version}-");
        versions = arr
            .iter()
            .filter_map(|v| v.as_str())
            .filter_map(|s| s.strip_prefix(&prefix).map(|x| x.to_string()))
            .collect();
    } else if let Some(obj) = metadata.as_object() {
        // Some mirrors nest under "number" etc.
        if let Some(arr) = obj
            .get("number")
            .and_then(|n| n.get(minecraft_version))
            .and_then(|v| v.as_array())
        {
            versions = arr
                .iter()
                .filter_map(|v| {
                    if let Some(s) = v.as_str() {
                        Some(normalize_forge_version(s, minecraft_version))
                    } else {
                        v.get("version")
                            .and_then(|x| x.as_str())
                            .map(|s| normalize_forge_version(s, minecraft_version))
                    }
                })
                .collect();
        }
    }

    // Newest first
    versions.reverse();

    Ok(versions
        .into_iter()
        .map(|version| {
            let is_rec = recommended.as_ref() == Some(&version);
            LoaderVersion {
                id: version.clone(),
                version,
                stable: Some(is_rec),
                recommended: if is_rec { Some(true) } else { None },
                version_type: if is_rec {
                    Some("recommended".into())
                } else {
                    Some("latest".into())
                },
            }
        })
        .collect())
}

fn normalize_forge_version(raw: &str, minecraft_version: &str) -> String {
    let prefix = format!("{minecraft_version}-");
    raw.strip_prefix(&prefix)
        .unwrap_or(raw)
        .to_string()
}

async fn fetch_recommended(client: &reqwest::Client, minecraft_version: &str) -> Option<String> {
    let promo: serde_json::Value = client
        .get(FORGE_PROMOTIONS)
        .send()
        .await
        .ok()?
        .error_for_status()
        .ok()?
        .json()
        .await
        .ok()?;
    let key = format!("{minecraft_version}-recommended");
    promo
        .get("promos")
        .and_then(|p| p.get(&key))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

/// Forge ビルドが存在する Minecraft バージョン一覧
pub async fn fetch_game_versions() -> CoreResult<Vec<String>> {
    let client = reqwest::Client::builder()
        .user_agent("Fledge/0.5.0 (forge-versions)")
        .build()
        .map_err(|e| CoreError::msg(e.to_string()))?;

    let metadata: serde_json::Value = client
        .get(FORGE_METADATA)
        .send()
        .await
        .map_err(|e| CoreError::msg(e.to_string()))?
        .error_for_status()
        .map_err(|e| CoreError::msg(e.to_string()))?
        .json()
        .await
        .map_err(|e| CoreError::msg(e.to_string()))?;

    let mut versions: Vec<String> = Vec::new();

    if let Some(obj) = metadata.as_object() {
        // Shape A: { "1.20.1": ["47.2.0", ...] }
        for (key, value) in obj {
            if key == "versions" || key == "number" {
                continue;
            }
            if value.as_array().is_some_and(|a| !a.is_empty()) {
                versions.push(key.clone());
            }
        }
        if versions.is_empty() {
            if let Some(nested) = obj.get("versions").and_then(|v| v.as_object()) {
                for (key, value) in nested {
                    if value.as_array().is_some_and(|a| !a.is_empty()) {
                        versions.push(key.clone());
                    }
                }
            }
            if versions.is_empty() {
                if let Some(nested) = obj.get("number").and_then(|v| v.as_object()) {
                    for (key, value) in nested {
                        if value.as_array().is_some_and(|a| !a.is_empty()) {
                            versions.push(key.clone());
                        }
                    }
                }
            }
        }
    } else if let Some(arr) = metadata.as_array() {
        // Array of "1.20.1-47.2.0"
        let mut seen = std::collections::BTreeSet::new();
        for v in arr {
            if let Some(s) = v.as_str() {
                if let Some((mc, _)) = s.split_once('-') {
                    seen.insert(mc.to_string());
                }
            }
        }
        versions.extend(seen);
    }

    versions.sort_by(|a, b| compare_mc_version_desc(a, b));
    Ok(versions)
}

fn compare_mc_version_desc(a: &str, b: &str) -> std::cmp::Ordering {
    fn parts(s: &str) -> Vec<u32> {
        s.split('.')
            .filter_map(|p| p.parse::<u32>().ok())
            .collect()
    }
    parts(b).cmp(&parts(a))
}
