//! Local-cached news (GitHub JSON), matching 0.4 LocalJsonNewsProvider.

use crate::error::{CoreError, CoreResult};
use crate::paths::PathLayout;
use crate::progress::EventBus;
use parking_lot::Mutex;
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

const REMOTE_URL: &str =
    "https://raw.githubusercontent.com/arula-folne/Fledge/main/news/news.ja.json";
const LOCALE_FILE: &str = "news.ja.json";
const META_FILE: &str = "news.meta.json";
const CACHE_TTL_MS: i64 = 20_000;
const FETCH_TIMEOUT_MS: u64 = 8_000;
const UA: &str = "Fledge/0.5.0 (news-fetcher)";

pub struct NewsService {
    layout: PathLayout,
    events: Arc<EventBus>,
    last_fingerprint: Mutex<String>,
    refreshing: Mutex<bool>,
}

impl NewsService {
    pub fn new(layout: PathLayout, events: Arc<EventBus>) -> Self {
        Self {
            layout,
            events,
            last_fingerprint: Mutex::new(String::new()),
            refreshing: Mutex::new(false),
        }
    }

    pub async fn list(&self) -> CoreResult<Value> {
        let local = self.read_local()?;
        {
            let mut fp = self.last_fingerprint.lock();
            if fp.is_empty() {
                *fp = fingerprint(&local);
            }
        }

        if std::env::var_os("FLEDGE_LIGHT_START").is_some() {
            let layout = self.layout.clone();
            let events = Arc::clone(&self.events);
            tokio::spawn(async move {
                let svc = NewsService::new(layout, events);
                let _ = svc.refresh_remote().await;
            });
            return Ok(local);
        }

        let remote_fut = self.refresh_remote();
        let raced = tokio::select! {
            r = remote_fut => r.ok().flatten(),
            _ = tokio::time::sleep(Duration::from_millis(800)) => None,
        };
        if let Some(items) = raced {
            if items.as_array().map(|a| !a.is_empty()).unwrap_or(false) {
                return Ok(items);
            }
        }
        Ok(local)
    }

    fn cache_path(&self) -> PathBuf {
        PathBuf::from(&self.layout.news).join(LOCALE_FILE)
    }

    fn meta_path(&self) -> PathBuf {
        PathBuf::from(&self.layout.news).join(META_FILE)
    }

    fn read_local(&self) -> CoreResult<Value> {
        if let Some(cached) = read_news_file(&self.cache_path())? {
            if cached.as_array().map(|a| !a.is_empty()).unwrap_or(false) {
                return Ok(cached);
            }
        }
        Ok(fallback_news())
    }

    fn is_cache_fresh(&self) -> bool {
        let Ok(raw) = fs::read_to_string(self.meta_path()) else {
            return false;
        };
        let Ok(meta) = serde_json::from_str::<Value>(&raw) else {
            return false;
        };
        let Some(fetched) = meta.get("fetchedAt").and_then(|v| v.as_str()) else {
            return false;
        };
        let Ok(parsed) = chrono::DateTime::parse_from_rfc3339(fetched) else {
            return false;
        };
        let age = chrono::Utc::now().signed_duration_since(parsed.with_timezone(&chrono::Utc));
        age.num_milliseconds() >= 0 && age.num_milliseconds() < CACHE_TTL_MS
    }

    async fn refresh_remote(&self) -> CoreResult<Option<Value>> {
        {
            let mut refreshing = self.refreshing.lock();
            if *refreshing {
                if self.is_cache_fresh() {
                    return Ok(read_news_file(&self.cache_path())?);
                }
                return Ok(None);
            }
            *refreshing = true;
        }

        let result = async {
            if self.is_cache_fresh() {
                return Ok(read_news_file(&self.cache_path())?);
            }
            match self.fetch_remote_and_cache().await {
                Ok(items) => {
                    let next = fingerprint(&items);
                    let mut fp = self.last_fingerprint.lock();
                    if *fp != next {
                        *fp = next;
                        self.events.emit_news_updated(items.clone());
                    }
                    Ok(Some(items))
                }
                Err(_) => Ok(None),
            }
        }
        .await;

        *self.refreshing.lock() = false;
        result
    }

    async fn fetch_remote_and_cache(&self) -> CoreResult<Value> {
        let url = format!(
            "{REMOTE_URL}{}t={}",
            if REMOTE_URL.contains('?') { '&' } else { '?' },
            chrono::Utc::now().timestamp_millis()
        );
        let client = reqwest::Client::builder()
            .timeout(Duration::from_millis(FETCH_TIMEOUT_MS))
            .build()
            .map_err(|e| CoreError::msg(e.to_string()))?;
        let res = client
            .get(&url)
            .header("Accept", "application/json")
            .header("Cache-Control", "no-cache")
            .header("Pragma", "no-cache")
            .header("User-Agent", UA)
            .send()
            .await
            .map_err(|e| CoreError::msg(e.to_string()))?
            .error_for_status()
            .map_err(|e| CoreError::msg(e.to_string()))?;
        let data: Value = res
            .json()
            .await
            .map_err(|e| CoreError::msg(e.to_string()))?;
        let items = parse_news_items(&data)?;
        fs::create_dir_all(&self.layout.news)?;
        fs::write(
            self.cache_path(),
            format!("{}\n", serde_json::to_string_pretty(&items)?),
        )?;
        fs::write(
            self.meta_path(),
            format!(
                "{}\n",
                serde_json::to_string_pretty(&json!({
                  "fetchedAt": chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
                }))?
            ),
        )?;
        Ok(items)
    }
}

fn fallback_news() -> Value {
    json!([{
      "id": "welcome",
      "title": "Fledge へようこそ",
      "body": "広告や利用解析のない、軽快で使いやすい Minecraft ランチャーです。初回起動のゲーム設定や Mod 導入も、モダンな UI から整えられます。",
      "publishedAt": chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
    }])
}

fn read_news_file(path: &PathBuf) -> CoreResult<Option<Value>> {
    match fs::read_to_string(path) {
        Ok(raw) => {
            let data: Value = serde_json::from_str(&raw)?;
            Ok(Some(parse_news_items(&data)?))
        }
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(err) => Err(err.into()),
    }
}

fn parse_news_items(data: &Value) -> CoreResult<Value> {
    let arr = data
        .as_array()
        .ok_or_else(|| CoreError::msg("News JSON must be an array"))?;
    let mut items: Vec<Value> = arr
        .iter()
        .filter_map(|item| {
            let id = item.get("id")?.as_str()?;
            let title = item.get("title")?.as_str()?;
            let body = item.get("body")?.as_str()?;
            let published_at = item.get("publishedAt")?.as_str()?;
            let mut obj = json!({
              "id": id,
              "title": title,
              "body": body,
              "publishedAt": published_at
            });
            if let Some(url) = item.get("url").and_then(|v| v.as_str()) {
                obj.as_object_mut()
                    .unwrap()
                    .insert("url".into(), json!(url));
            }
            Some(obj)
        })
        .collect();
    items.sort_by(|a, b| {
        let ap = a.get("publishedAt").and_then(|v| v.as_str()).unwrap_or("");
        let bp = b.get("publishedAt").and_then(|v| v.as_str()).unwrap_or("");
        bp.cmp(ap)
    });
    Ok(Value::Array(items))
}

fn fingerprint(items: &Value) -> String {
    items
        .as_array()
        .map(|arr| {
            arr.iter()
                .map(|item| {
                    format!(
                        "{}:{}:{}",
                        item.get("id").and_then(|v| v.as_str()).unwrap_or(""),
                        item
                            .get("publishedAt")
                            .and_then(|v| v.as_str())
                            .unwrap_or(""),
                        item.get("title").and_then(|v| v.as_str()).unwrap_or("")
                    )
                })
                .collect::<Vec<_>>()
                .join("|")
        })
        .unwrap_or_default()
}
