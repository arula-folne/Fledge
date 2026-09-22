use super::LoaderVersion;
use crate::error::{CoreError, CoreResult};

const METADATA_URL: &str =
    "https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml";

pub async fn fetch_loader_versions(minecraft_version: &str) -> CoreResult<Vec<LoaderVersion>> {
    let Some(prefix) = neo_forge_prefix(minecraft_version) else {
        return Ok(vec![]);
    };
    let client = reqwest::Client::builder()
        .user_agent("Fledge/0.5.0 (neoforge-versions)")
        .build()
        .map_err(|e| CoreError::msg(e.to_string()))?;
    let xml = client
        .get(METADATA_URL)
        .send()
        .await
        .map_err(|e| CoreError::msg(e.to_string()))?
        .error_for_status()
        .map_err(|e| CoreError::msg(e.to_string()))?
        .text()
        .await
        .map_err(|e| CoreError::msg(e.to_string()))?;

    let mut versions: Vec<String> = Vec::new();
    let mut rest = xml.as_str();
    while let Some(start) = rest.find("<version>") {
        rest = &rest[start + "<version>".len()..];
        if let Some(end) = rest.find("</version>") {
            let v = rest[..end].trim();
            if v.starts_with(&prefix) {
                versions.push(v.to_string());
            }
            rest = &rest[end + "</version>".len()..];
        } else {
            break;
        }
    }
    versions.reverse();
    Ok(versions
        .into_iter()
        .map(|version| {
            let stable = !version.to_ascii_lowercase().contains("-beta");
            LoaderVersion {
                id: version.clone(),
                version,
                stable: Some(stable),
                recommended: None,
                version_type: None,
            }
        })
        .collect())
}

/// 1.21.1 → "21.1." / 1.20.1 → "20.1."
pub fn neo_forge_prefix(minecraft_version: &str) -> Option<String> {
    let parts: Vec<&str> = minecraft_version.split('-').next()?.split('.').collect();
    if parts.first() != Some(&"1") {
        return None;
    }
    match parts.len() {
        2 => Some(format!("{}.0.", parts[1])),
        n if n >= 3 => Some(format!("{}.{}.", parts[1], parts[2])),
        _ => None,
    }
}

/// NeoForge バージョン接頭辞 → Minecraft バージョン候補（"21.1." → "1.21.1" / "21.0." → "1.21" と "1.21.0"）
fn prefix_to_minecraft_ids(prefix: &str) -> Vec<String> {
    let trimmed = prefix.trim_end_matches('.');
    let parts: Vec<&str> = trimmed.split('.').collect();
    match parts.as_slice() {
        [minor, patch] if *patch == "0" => {
            vec![format!("1.{minor}"), format!("1.{minor}.0")]
        }
        [minor, patch] => vec![format!("1.{minor}.{patch}")],
        [minor] => vec![format!("1.{minor}")],
        _ => vec![],
    }
}

/// NeoForge ビルドが存在する Minecraft バージョン一覧
pub async fn fetch_game_versions() -> CoreResult<Vec<String>> {
    let client = reqwest::Client::builder()
        .user_agent("Fledge/0.5.0 (neoforge-versions)")
        .build()
        .map_err(|e| CoreError::msg(e.to_string()))?;
    let xml = client
        .get(METADATA_URL)
        .send()
        .await
        .map_err(|e| CoreError::msg(e.to_string()))?
        .error_for_status()
        .map_err(|e| CoreError::msg(e.to_string()))?
        .text()
        .await
        .map_err(|e| CoreError::msg(e.to_string()))?;

    let mut prefixes = std::collections::BTreeSet::new();
    let mut rest = xml.as_str();
    while let Some(start) = rest.find("<version>") {
        rest = &rest[start + "<version>".len()..];
        if let Some(end) = rest.find("</version>") {
            let v = rest[..end].trim();
            // "21.1.77" / "21.1.77-beta" → prefix "21.1."
            let core = v.split('-').next().unwrap_or(v);
            let parts: Vec<&str> = core.split('.').collect();
            if parts.len() >= 2 {
                prefixes.insert(format!("{}.{}.", parts[0], parts[1]));
            }
            rest = &rest[end + "</version>".len()..];
        } else {
            break;
        }
    }

    let mut seen = std::collections::BTreeSet::new();
    for p in prefixes {
        for id in prefix_to_minecraft_ids(&p) {
            seen.insert(id);
        }
    }
    let mut versions: Vec<String> = seen.into_iter().collect();
    versions.sort_by(|a, b| {
        fn parts(s: &str) -> Vec<u32> {
            s.split('.')
                .filter_map(|p| p.parse::<u32>().ok())
                .collect()
        }
        parts(b).cmp(&parts(a))
    });
    Ok(versions)
}
