use crate::error::{CoreError, CoreResult};
use serde::{de::DeserializeOwned, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

const DEFAULT_TTL: Duration = Duration::from_secs(24 * 60 * 60);

pub struct CacheRead<T> {
    pub data: T,
    pub fetched_at: String,
    pub stale: bool,
}

pub struct VersionCache {
    cache_dir: PathBuf,
    ttl: Duration,
}

impl VersionCache {
    pub fn new(cache_dir: PathBuf) -> Self {
        Self {
            cache_dir,
            ttl: DEFAULT_TTL,
        }
    }

    fn file_path(&self, key: &str) -> PathBuf {
        let safe: String = key
            .chars()
            .map(|c| {
                if c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-' {
                    c
                } else {
                    '_'
                }
            })
            .collect();
        self.cache_dir.join(format!("{safe}.json"))
    }

    pub fn ensure_dir(&self) -> CoreResult<()> {
        fs::create_dir_all(&self.cache_dir)?;
        Ok(())
    }

    pub fn get<T: DeserializeOwned>(&self, key: &str) -> CoreResult<Option<CacheRead<T>>> {
        let path = self.file_path(key);
        let raw = match fs::read_to_string(&path) {
            Ok(r) => r,
            Err(_) => return Ok(None),
        };
        let parsed: serde_json::Value = serde_json::from_str(&raw)?;
        let fetched_at = parsed
            .get("fetchedAt")
            .and_then(|v| v.as_str())
            .ok_or_else(|| CoreError::msg("invalid cache"))?
            .to_string();
        let data: T = serde_json::from_value(
            parsed
                .get("data")
                .cloned()
                .ok_or_else(|| CoreError::msg("invalid cache"))?,
        )?;
        let stale = match SystemTime::UNIX_EPOCH
            .elapsed()
            .ok()
            .and_then(|_| chrono::DateTime::parse_from_rfc3339(&fetched_at).ok())
        {
            Some(dt) => {
                let age = chrono::Utc::now().signed_duration_since(dt.with_timezone(&chrono::Utc));
                age.to_std()
                    .map(|d| d > self.ttl)
                    .unwrap_or(true)
            }
            None => true,
        };
        Ok(Some(CacheRead {
            data,
            fetched_at,
            stale,
        }))
    }

    pub fn set<T: Serialize>(&self, key: &str, data: &T) -> CoreResult<String> {
        self.ensure_dir()?;
        let fetched_at = chrono::Utc::now().to_rfc3339();
        let envelope = serde_json::json!({
          "fetchedAt": fetched_at,
          "data": data
        });
        fs::write(self.file_path(key), serde_json::to_string_pretty(&envelope)?)?;
        Ok(fetched_at)
    }

    pub fn delete(&self, key: &str) -> CoreResult<()> {
        let path = self.file_path(key);
        if path.exists() {
            let _ = fs::remove_file(path);
        }
        Ok(())
    }

    pub fn clear(&self) -> CoreResult<()> {
        if !self.cache_dir.exists() {
            return Ok(());
        }
        for entry in fs::read_dir(&self.cache_dir)?.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                let _ = fs::remove_file(path);
            }
        }
        Ok(())
    }
}

#[allow(dead_code)]
fn _path_as_str(p: &Path) -> String {
    p.to_string_lossy().into_owned()
}
