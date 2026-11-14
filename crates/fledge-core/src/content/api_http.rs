//! Shared HTTP client + short-lived GET cache for Modrinth / folne catalog APIs.

use crate::error::{CoreError, CoreResult};
use parking_lot::Mutex;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::OnceLock;
use std::time::{Duration, Instant};

const FETCH_TIMEOUT_MS: u64 = 20_000;
const CACHE_TTL: Duration = Duration::from_secs(45);
const CACHE_MAX: usize = 80;

pub fn catalog_http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_millis(FETCH_TIMEOUT_MS))
            .pool_max_idle_per_host(16)
            .pool_idle_timeout(Duration::from_secs(90))
            .tcp_nodelay(true)
            .tcp_keepalive(Some(Duration::from_secs(30)))
            .connect_timeout(Duration::from_secs(12))
            .build()
            .expect("catalog reqwest Client")
    })
}

struct CacheEntry {
    at: Instant,
    value: Value,
}

fn response_cache() -> &'static Mutex<HashMap<String, CacheEntry>> {
    static CACHE: OnceLock<Mutex<HashMap<String, CacheEntry>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn cache_get(key: &str) -> Option<Value> {
    let mut map = response_cache().lock();
    let Some(entry) = map.get(key) else {
        return None;
    };
    if entry.at.elapsed() > CACHE_TTL {
        map.remove(key);
        return None;
    }
    Some(entry.value.clone())
}

fn cache_put(key: String, value: Value) {
    let mut map = response_cache().lock();
    if map.len() >= CACHE_MAX {
        // 古いものから数件落とす
        let stale: Vec<String> = map
            .iter()
            .filter(|(_, e)| e.at.elapsed() > CACHE_TTL)
            .map(|(k, _)| k.clone())
            .take(16)
            .collect();
        for k in stale {
            map.remove(&k);
        }
        if map.len() >= CACHE_MAX {
            if let Some(oldest) = map
                .iter()
                .min_by_key(|(_, e)| e.at)
                .map(|(k, _)| k.clone())
            {
                map.remove(&oldest);
            }
        }
    }
    map.insert(
        key,
        CacheEntry {
            at: Instant::now(),
            value,
        },
    );
}

/// GET JSON with connection reuse and a short TTL cache (search / project metadata).
pub async fn cached_json_get(
    url: &str,
    user_agent: &str,
    accept_language: Option<&str>,
) -> CoreResult<Value> {
    let cache_key = match accept_language {
        Some(lang) => format!("{url}\n{lang}"),
        None => url.to_string(),
    };
    if let Some(hit) = cache_get(&cache_key) {
        return Ok(hit);
    }

    let mut attempt = 0u32;
    loop {
        let mut req = catalog_http_client()
            .get(url)
            .header("Accept", "application/json")
            .header("User-Agent", user_agent);
        if let Some(lang) = accept_language {
            req = req.header("Accept-Language", lang);
        }
        let res = req.send().await;
        match res {
            Ok(res) => {
                let status = res.status();
                if status.as_u16() == 429 && attempt < 2 {
                    let delay = res
                        .headers()
                        .get("Retry-After")
                        .and_then(|v| v.to_str().ok())
                        .and_then(|s| s.parse::<u64>().ok())
                        .unwrap_or(2);
                    tokio::time::sleep(Duration::from_secs(delay.min(10))).await;
                    attempt += 1;
                    continue;
                }
                if !status.is_success() {
                    let body = res.text().await.unwrap_or_default();
                    return Err(CoreError::msg(format!(
                        "catalog API {}: {}",
                        status.as_u16(),
                        body.chars().take(200).collect::<String>()
                    )));
                }
                let value: Value = res
                    .json()
                    .await
                    .map_err(|e| CoreError::msg(e.to_string()))?;
                cache_put(cache_key, value.clone());
                return Ok(value);
            }
            Err(err) if attempt < 2 => {
                attempt += 1;
                tokio::time::sleep(Duration::from_millis(300 * u64::from(attempt))).await;
                let _ = err;
                continue;
            }
            Err(err) => return Err(CoreError::msg(err.to_string())),
        }
    }
}
