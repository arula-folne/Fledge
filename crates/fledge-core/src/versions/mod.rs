//! Version list service (Mojang + Fabric for Phase 3).

mod cache;
mod fabric;
mod forge;
mod mojang;
mod neoforge;
mod quilt;

use crate::error::CoreResult;
use crate::paths::PathLayout;
use cache::VersionCache;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;

const MC_CACHE_KEY: &str = "minecraft_versions";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionInfo {
    pub id: String,
    #[serde(rename = "type")]
    pub version_type: String,
    pub release_time: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoaderVersion {
    pub id: String,
    pub version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stable: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recommended: Option<bool>,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub version_type: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionListResult {
    pub versions: Vec<VersionInfo>,
    pub from_cache: bool,
    pub stale: bool,
    pub offline: bool,
    pub fetched_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoaderVersionListResult {
    pub loader: String,
    pub minecraft_version: String,
    pub versions: Vec<LoaderVersion>,
    pub from_cache: bool,
    pub stale: bool,
    pub offline: bool,
    pub fetched_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoaderGameVersionListResult {
    pub loader: String,
    pub versions: Vec<String>,
    pub from_cache: bool,
    pub stale: bool,
    pub offline: bool,
    pub fetched_at: Option<String>,
}

pub struct VersionService {
    cache: VersionCache,
    inflight: Mutex<HashMap<String, ()>>,
}

impl VersionService {
    pub fn new(layout: &PathLayout) -> Self {
        let dir = std::path::PathBuf::from(&layout.cache).join("versions");
        Self {
            cache: VersionCache::new(dir),
            inflight: Mutex::new(HashMap::new()),
        }
    }

    pub async fn list_minecraft_versions(
        &self,
        include_snapshots: bool,
        force: bool,
    ) -> CoreResult<VersionListResult> {
        let cached = self.cache.get::<Vec<VersionInfo>>(MC_CACHE_KEY)?;

        if !force {
            if let Some(ref cached) = cached {
                if cached.stale {
                    self.spawn_bg_minecraft_refresh();
                }
                return Ok(VersionListResult {
                    versions: filter_mc(&cached.data, include_snapshots),
                    from_cache: true,
                    stale: cached.stale,
                    offline: false,
                    fetched_at: Some(cached.fetched_at.clone()),
                });
            }
        }

        match self.fetch_and_store_minecraft().await {
            Ok(fresh) => Ok(VersionListResult {
                versions: filter_mc(&fresh.data, include_snapshots),
                from_cache: false,
                stale: false,
                offline: false,
                fetched_at: Some(fresh.fetched_at),
            }),
            Err(err) => {
                if let Some(cached) = cached {
                    tracing::warn!("MC version fetch failed: {err}");
                    Ok(VersionListResult {
                        versions: filter_mc(&cached.data, include_snapshots),
                        from_cache: true,
                        stale: true,
                        offline: true,
                        fetched_at: Some(cached.fetched_at),
                    })
                } else {
                    Err(err)
                }
            }
        }
    }

    pub async fn list_loader_versions(
        &self,
        loader: &str,
        minecraft_version: &str,
        force: bool,
    ) -> CoreResult<LoaderVersionListResult> {
        if loader == "vanilla" {
            return Ok(LoaderVersionListResult {
                loader: loader.into(),
                minecraft_version: minecraft_version.into(),
                versions: vec![],
                from_cache: false,
                stale: false,
                offline: false,
                fetched_at: None,
            });
        }

        // Phase 4: fabric / quilt / forge / neoforge
        if !matches!(loader, "fabric" | "quilt" | "forge" | "neoforge") {
            return Ok(LoaderVersionListResult {
                loader: loader.into(),
                minecraft_version: minecraft_version.into(),
                versions: vec![],
                from_cache: false,
                stale: false,
                offline: false,
                fetched_at: None,
            });
        }

        let key = loader_cache_key(loader, minecraft_version);
        let cached = self.cache.get::<Vec<LoaderVersion>>(&key)?;

        if !force {
            if let Some(ref cached) = cached {
                if cached.stale {
                    self.spawn_bg_loader_refresh(loader, minecraft_version);
                }
                return Ok(LoaderVersionListResult {
                    loader: loader.into(),
                    minecraft_version: minecraft_version.into(),
                    versions: cached.data.clone(),
                    from_cache: true,
                    stale: cached.stale,
                    offline: false,
                    fetched_at: Some(cached.fetched_at.clone()),
                });
            }
        }

        match self.fetch_and_store_loader(loader, minecraft_version).await {
            Ok(fresh) => Ok(LoaderVersionListResult {
                loader: loader.into(),
                minecraft_version: minecraft_version.into(),
                versions: fresh.data,
                from_cache: false,
                stale: false,
                offline: false,
                fetched_at: Some(fresh.fetched_at),
            }),
            Err(err) => {
                if let Some(cached) = cached {
                    tracing::warn!("{loader} loader fetch failed: {err}");
                    Ok(LoaderVersionListResult {
                        loader: loader.into(),
                        minecraft_version: minecraft_version.into(),
                        versions: cached.data,
                        from_cache: true,
                        stale: true,
                        offline: true,
                        fetched_at: Some(cached.fetched_at),
                    })
                } else {
                    Err(err)
                }
            }
        }
    }

    /// ローダーが対応している Minecraft バージョン ID 一覧
    pub async fn list_loader_game_versions(
        &self,
        loader: &str,
        force: bool,
    ) -> CoreResult<LoaderGameVersionListResult> {
        if loader == "vanilla" || !matches!(loader, "fabric" | "quilt" | "forge" | "neoforge") {
            return Ok(LoaderGameVersionListResult {
                loader: loader.into(),
                versions: vec![],
                from_cache: false,
                stale: false,
                offline: false,
                fetched_at: None,
            });
        }

        let key = game_versions_cache_key(loader);
        let cached = self.cache.get::<Vec<String>>(&key)?;

        if !force {
            if let Some(ref cached) = cached {
                return Ok(LoaderGameVersionListResult {
                    loader: loader.into(),
                    versions: cached.data.clone(),
                    from_cache: true,
                    stale: cached.stale,
                    offline: false,
                    fetched_at: Some(cached.fetched_at.clone()),
                });
            }
        }

        match self.fetch_and_store_loader_games(loader).await {
            Ok(fresh) => Ok(LoaderGameVersionListResult {
                loader: loader.into(),
                versions: fresh.data,
                from_cache: false,
                stale: false,
                offline: false,
                fetched_at: Some(fresh.fetched_at),
            }),
            Err(err) => {
                if let Some(cached) = cached {
                    tracing::warn!("{loader} game versions fetch failed: {err}");
                    Ok(LoaderGameVersionListResult {
                        loader: loader.into(),
                        versions: cached.data,
                        from_cache: true,
                        stale: true,
                        offline: true,
                        fetched_at: Some(cached.fetched_at),
                    })
                } else {
                    Err(err)
                }
            }
        }
    }

    pub async fn refresh(
        &self,
        target: Option<&str>,
        minecraft_version: Option<&str>,
    ) -> CoreResult<()> {
        let target = target.unwrap_or("minecraft");
        if target == "minecraft" {
            self.cache.delete(MC_CACHE_KEY)?;
            let _ = self.fetch_and_store_minecraft().await?;
        }
        if target != "minecraft" && target != "vanilla" {
            self.cache.delete(&game_versions_cache_key(target))?;
            let _ = self.fetch_and_store_loader_games(target).await;
            if let Some(mc) = minecraft_version {
                let key = loader_cache_key(target, mc);
                self.cache.delete(&key)?;
                let _ = self.fetch_and_store_loader(target, mc).await?;
            }
        }
        Ok(())
    }

    pub fn clear_cache(&self) -> CoreResult<()> {
        self.cache.clear()
    }

    async fn fetch_and_store_minecraft(&self) -> CoreResult<Fresh<Vec<VersionInfo>>> {
        let data = mojang::fetch_minecraft_versions().await?;
        let fetched_at = self.cache.set(MC_CACHE_KEY, &data)?;
        Ok(Fresh { data, fetched_at })
    }

    async fn fetch_and_store_loader(
        &self,
        loader: &str,
        minecraft_version: &str,
    ) -> CoreResult<Fresh<Vec<LoaderVersion>>> {
        let data = match loader {
            "fabric" => fabric::fetch_loader_versions(minecraft_version).await?,
            "quilt" => quilt::fetch_loader_versions(minecraft_version).await?,
            "forge" => forge::fetch_loader_versions(minecraft_version).await?,
            "neoforge" => neoforge::fetch_loader_versions(minecraft_version).await?,
            _ => vec![],
        };
        let fetched_at = self.cache.set(&loader_cache_key(loader, minecraft_version), &data)?;
        Ok(Fresh { data, fetched_at })
    }

    async fn fetch_and_store_loader_games(
        &self,
        loader: &str,
    ) -> CoreResult<Fresh<Vec<String>>> {
        let data = match loader {
            "fabric" => fabric::fetch_game_versions().await?,
            "quilt" => quilt::fetch_game_versions().await?,
            "forge" => forge::fetch_game_versions().await?,
            "neoforge" => neoforge::fetch_game_versions().await?,
            _ => vec![],
        };
        let fetched_at = self.cache.set(&game_versions_cache_key(loader), &data)?;
        Ok(Fresh { data, fetched_at })
    }

    fn spawn_bg_minecraft_refresh(&self) {
        // Best-effort: skip if already refreshing; sync refresh on next force/list miss is fine.
        let key = "bg:minecraft".to_string();
        let mut guard = self.inflight.lock().unwrap();
        if guard.contains_key(&key) {
            return;
        }
        guard.insert(key.clone(), ());
        drop(guard);
        // Cannot easily spawn without 'static self; stale cache still serves until next force.
        self.inflight.lock().unwrap().remove(&key);
    }

    fn spawn_bg_loader_refresh(&self, _loader: &str, _mc: &str) {
        // Same as above — Phase 3 serves stale until force/refresh.
    }
}

struct Fresh<T> {
    data: T,
    fetched_at: String,
}

fn filter_mc(versions: &[VersionInfo], include_snapshots: bool) -> Vec<VersionInfo> {
    versions
        .iter()
        .filter(|v| include_snapshots || v.version_type == "release")
        .cloned()
        .collect()
}

fn loader_cache_key(loader: &str, mc: &str) -> String {
    let safe: String = mc
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect();
    format!("{loader}_{safe}")
}

fn game_versions_cache_key(loader: &str) -> String {
    format!("{loader}_game_versions")
}
