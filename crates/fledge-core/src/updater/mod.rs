//! GitHub Releases (or configured feed) updater  Ematches 0.4 UX without tauri-plugin-updater keys.

mod apply;
mod version;

pub use apply::{
    find_uninstaller, open_apps_and_features, resolve_install_root, schedule_complete_uninstall,
    spawn_installer_after_exit, updater_staging_dir, wipe_fledge_user_data,
};
pub use version::APP_VERSION;

use crate::error::{CoreError, CoreResult};
use crate::paths::PathLayout;
use crate::progress::{EventBus, ProgressEvent};
use crate::settings::SettingsStore;
use crate::updater::version::{
    compare_versions, is_eligible_generation1_update, is_eligible_generation2_update,
    is_generation1_app, is_generation2_app, normalize_release_version,
};
use futures_util::StreamExt;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

const OWNER: &str = "arula-folne";
const REPO: &str = "Fledge";
const LATEST_RELEASE_URL: &str =
    "https://api.github.com/repos/arula-folne/Fledge/releases/latest";
const CACHE_TTL_MS: i64 = 30 * 60 * 1000;
const UP_TO_DATE_CACHE_TTL_MS: i64 = 60 * 1000;
const FETCH_TIMEOUT_MS: u64 = 15_000;
const GEN_LIST_PER_PAGE: u32 = 40;
fn ua_check() -> String {
    format!("Fledge/{} (updater-check)", APP_VERSION)
}
fn ua_download() -> String {
    format!("Fledge/{} (updater-download)", APP_VERSION)
}

/// GitHub REST API の asset（フィールドは snake_case）。
/// `rename_all = "camelCase"` を付けると `browser_download_url` が読めず、
/// 更新チェックが常に失敗する（0.5.0 の不具合）。
#[derive(Debug, Clone, Serialize, Deserialize)]
struct GithubReleaseAsset {
    name: String,
    browser_download_url: String,
    #[serde(default)]
    size: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct GithubRelease {
    tag_name: String,
    html_url: String,
    #[serde(default)]
    body: Option<String>,
    #[serde(default)]
    assets: Vec<GithubReleaseAsset>,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    prerelease: bool,
}

#[derive(Debug, Clone)]
struct PendingInstaller {
    download_url: String,
    file_name: String,
    expected_size: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChannelCache {
    fetched_at: String,
    result: Value,
}

pub struct UpdaterService {
    layout: PathLayout,
    settings: Arc<SettingsStore>,
    events: Arc<EventBus>,
    pending: Mutex<HashMap<String, PendingInstaller>>,
}

impl UpdaterService {
    pub fn new(layout: PathLayout, settings: Arc<SettingsStore>, events: Arc<EventBus>) -> Self {
        Self {
            layout,
            settings,
            events,
            pending: Mutex::new(HashMap::new()),
        }
    }

    pub async fn check(&self, channel: &str) -> CoreResult<Value> {
        let channel = normalize_channel(channel);
        if std::env::var_os("FLEDGE_LIGHT_START").is_some() {
            return Ok(json!({
              "status": "up-to-date",
              "currentVersion": effective_app_version(),
              "channel": channel,
            }));
        }

        if let Some(cached) = self.read_cache(channel)? {
            if self.is_cache_fresh(&cached.fetched_at, &cached.result) {
                if let Some(reconciled) =
                    reconcile_cached_update_result(&cached.result, &effective_app_version())
                {
                    if reconciled.get("status") != cached.result.get("status")
                        || reconciled.get("currentVersion") != cached.result.get("currentVersion")
                    {
                        self.write_cache(channel, &reconciled)?;
                    }
                    self.sync_pending(channel, &reconciled);
                    return Ok(reconciled);
                }
            }
        }

        match self.fetch_and_resolve(channel).await {
            Ok(result) => Ok(result),
            Err(err) => {
                tracing::warn!(error = %err, "updater check failed");
                if let Some(cached) = self.read_cache(channel)? {
                    if let Some(reconciled) =
                        reconcile_cached_update_result(&cached.result, &effective_app_version())
                    {
                        self.sync_pending(channel, &reconciled);
                        return Ok(reconciled);
                    }
                }
                Ok(json!({
                  "status": "unavailable",
                  "messageKey": "updater.fetchFailed",
                  "channel": channel,
                }))
            }
        }
    }

    pub async fn apply(&self, channel: &str) -> CoreResult<PathBuf> {
        let channel = normalize_channel(channel);
        self.emit_updater_progress(0.0, 0.0, Some(0.0), "updater.downloading", Some("active"));

        let check = self.check(channel).await?;
        let installer_path = self
            .download_installer(channel, |current, total, percent| {
                self.emit_updater_progress(
                    current,
                    total,
                    percent,
                    "updater.downloading",
                    Some("active"),
                );
            })
            .await
            .map_err(|e| {
                self.emit_updater_progress(0.0, 1.0, Some(0.0), "updater.applyFailed", Some("failed"));
                e
            })?;

        if check.get("status").and_then(|v| v.as_str()) == Some("available") {
            if let Some(next) = check.get("nextVersion").and_then(|v| v.as_str()) {
                let notes = check.get("releaseNotes").cloned().unwrap_or(Value::Null);
                let _ = self.settings.set(json!({
                  "lastAppVersion": effective_app_version(),
                  "updateAckPending": {
                    "fromVersion": effective_app_version(),
                    "toVersion": next,
                    "releaseNotes": notes,
                  }
                }));
            }
        }

        self.emit_updater_progress(1.0, 1.0, Some(100.0), "updater.preparing", Some("active"));

        let staged = stage_update_installer(&installer_path)?;
        self.clear_cache()?;

        self.emit_updater_progress(1.0, 1.0, Some(100.0), "updater.restarting", Some("active"));

        let install_dir = resolve_install_root();
        let pid = std::process::id();
        spawn_installer_after_exit(&staged, &install_dir, pid)?;

        self.emit_updater_progress(1.0, 1.0, Some(100.0), "updater.restarting", Some("completed"));
        Ok(staged)
    }

    pub fn clear_cache(&self) -> CoreResult<()> {
        self.pending.lock().clear();
        for channel in ["stable", "prerelease"] {
            let path = self.cache_path(channel);
            let _ = fs::remove_file(path);
        }
        Ok(())
    }

    async fn download_installer<F>(
        &self,
        channel: &str,
        mut on_progress: F,
    ) -> CoreResult<PathBuf>
    where
        F: FnMut(f64, f64, Option<f64>),
    {
        let mut result = self.check(channel).await?;
        if result.get("status").and_then(|v| v.as_str()) != Some("available")
            || result.get("downloadUrl").is_none()
        {
            result = self.fetch_and_resolve(channel).await?;
        }
        let pending = self
            .pending
            .lock()
            .get(channel)
            .cloned()
            .ok_or_else(|| {
                CoreError::msg(
                    result
                        .get("messageKey")
                        .and_then(|v| v.as_str())
                        .unwrap_or("updater.noAsset"),
                )
            })?;

        if result.get("status").and_then(|v| v.as_str()) != Some("available") {
            return Err(CoreError::msg(
                result
                    .get("messageKey")
                    .and_then(|v| v.as_str())
                    .unwrap_or("updater.noAsset"),
            ));
        }

        let dir = PathBuf::from(&self.layout.temp).join("updates");
        fs::create_dir_all(&dir)?;
        let target = dir.join(&pending.file_name);

        let client = reqwest::Client::builder()
            .timeout(Duration::from_millis(FETCH_TIMEOUT_MS * 4))
            .user_agent(ua_download())
            .build()
            .map_err(|e| CoreError::msg(e.to_string()))?;

        let response = client
            .get(&pending.download_url)
            .send()
            .await
            .map_err(|_| CoreError::msg("updater.downloadFailed"))?
            .error_for_status()
            .map_err(|_| CoreError::msg("updater.downloadFailed"))?;

        let total_header = response.content_length().unwrap_or(0);
        let total = if total_header > 0 {
            total_header as f64
        } else if let Some(size) = pending.expected_size {
            size as f64
        } else {
            0.0
        };

        on_progress(0.0, total, if total > 0.0 { Some(0.0) } else { None });

        let mut stream = response.bytes_stream();
        let mut file = fs::File::create(&target).map_err(|_| CoreError::msg("updater.downloadFailed"))?;
        let mut received: u64 = 0;
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|_| CoreError::msg("updater.downloadFailed"))?;
            file.write_all(&chunk)
                .map_err(|_| CoreError::msg("updater.downloadFailed"))?;
            received += chunk.len() as u64;
            let percent = if total > 0.0 {
                Some(((received as f64 / total) * 100.0).min(99.0))
            } else {
                None
            };
            on_progress(received as f64, total, percent);
        }
        file.flush()
            .map_err(|_| CoreError::msg("updater.downloadFailed"))?;
        drop(file);

        if let Some(expected) = pending.expected_size {
            let actual = fs::metadata(&target)
                .map(|m| m.len())
                .unwrap_or(0);
            if actual != expected {
                let _ = fs::remove_file(&target);
                return Err(CoreError::msg("updater.downloadFailed"));
            }
        }

        let final_total = if total > 0.0 { total } else { received as f64 };
        on_progress(received as f64, final_total, Some(100.0));
        Ok(target)
    }

    async fn fetch_and_resolve(&self, channel: &str) -> CoreResult<Value> {
        let release = self.fetch_release(channel).await?;
        let next_version = normalize_release_version(&release.tag_name);
        let current_version = effective_app_version();
        let release_notes = normalize_notes(release.body.as_deref());
        let is_prerelease = release.prerelease;

        if compare_versions(&current_version, &next_version) >= 0 {
            let result = json!({
              "status": "up-to-date",
              "currentVersion": current_version,
              "nextVersion": next_version,
              "releaseUrl": release.html_url,
              "releaseNotes": release_notes,
              "prerelease": is_prerelease,
              "channel": channel,
            });
            self.sync_pending(channel, &result);
            self.write_cache(channel, &result)?;
            return Ok(result);
        }

        let Some(asset) = find_windows_installer(&release.assets) else {
            let result = json!({
              "status": "unavailable",
              "messageKey": "updater.noAsset",
              "currentVersion": current_version,
              "nextVersion": next_version,
              "releaseUrl": release.html_url,
              "releaseNotes": release_notes,
              "prerelease": is_prerelease,
              "channel": channel,
            });
            self.sync_pending(channel, &result);
            self.write_cache(channel, &result)?;
            return Ok(result);
        };

        let result = json!({
          "status": "available",
          "currentVersion": current_version,
          "nextVersion": next_version,
          "downloadUrl": asset.browser_download_url,
          "downloadSize": asset.size,
          "releaseUrl": release.html_url,
          "releaseNotes": release_notes,
          "prerelease": is_prerelease,
          "channel": channel,
        });
        self.sync_pending(channel, &result);
        self.write_cache(channel, &result)?;
        Ok(result)
    }

    async fn fetch_release(&self, channel: &str) -> CoreResult<GithubRelease> {
        if let Some(feed) = configured_feed_url(&self.settings) {
            return self.fetch_from_feed(&feed, channel).await;
        }

        let current = effective_app_version();
        let gen1 = is_generation1_app(&current);
        let gen2 = is_generation2_app(&current);

        if !gen1 && !gen2 && channel == "stable" {
            return self.fetch_latest_stable().await;
        }
        self.fetch_newest_from_list(channel, gen1, gen2).await
    }

    async fn fetch_from_feed(&self, feed_url: &str, channel: &str) -> CoreResult<GithubRelease> {
        let value = self.fetch_json(feed_url, &ua_check()).await?;
        if let Ok(release) = serde_json::from_value::<GithubRelease>(value.clone()) {
            if release.draft {
                return Err(CoreError::msg("Configured update feed is a draft"));
            }
            return Ok(release);
        }
        let list: Vec<GithubRelease> = if let Some(arr) = value.as_array() {
            serde_json::from_value(Value::Array(arr.clone()))
                .map_err(|e| CoreError::msg(e.to_string()))?
        } else if let Some(releases) = value.get("releases") {
            serde_json::from_value(releases.clone()).map_err(|e| CoreError::msg(e.to_string()))?
        } else {
            return Err(CoreError::msg("Configured update feed is not a valid release payload"));
        };

        let current = effective_app_version();
        let gen1 = is_generation1_app(&current);
        let gen2 = is_generation2_app(&current);
        pick_newest_release(list, channel, gen1, gen2)
    }

    async fn fetch_latest_stable(&self) -> CoreResult<GithubRelease> {
        let value = self.fetch_json(LATEST_RELEASE_URL, &ua_check()).await?;
        let release: GithubRelease =
            serde_json::from_value(value).map_err(|e| CoreError::msg(e.to_string()))?;
        if release.draft {
            return Err(CoreError::msg("Latest GitHub release is a draft"));
        }
        Ok(release)
    }

    async fn fetch_newest_from_list(
        &self,
        channel: &str,
        gen1: bool,
        gen2: bool,
    ) -> CoreResult<GithubRelease> {
        let per_page = if gen1 || gen2 { GEN_LIST_PER_PAGE } else { 20 };
        let url = format!(
            "https://api.github.com/repos/{OWNER}/{REPO}/releases?per_page={per_page}"
        );
        let value = self.fetch_json(&url, &ua_check()).await?;
        let list: Vec<GithubRelease> =
            serde_json::from_value(value).map_err(|e| CoreError::msg(e.to_string()))?;
        pick_newest_release(list, channel, gen1, gen2)
    }

    async fn fetch_json(&self, url: &str, ua: &str) -> CoreResult<Value> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_millis(FETCH_TIMEOUT_MS))
            .user_agent(ua)
            .build()
            .map_err(|e| CoreError::msg(e.to_string()))?;
        client
            .get(url)
            .header("Accept", "application/vnd.github+json")
            .send()
            .await
            .map_err(|e| CoreError::msg(e.to_string()))?
            .error_for_status()
            .map_err(|e| CoreError::msg(e.to_string()))?
            .json()
            .await
            .map_err(|e| CoreError::msg(e.to_string()))
    }

    fn sync_pending(&self, channel: &str, result: &Value) {
        let mut pending = self.pending.lock();
        if result.get("status").and_then(|v| v.as_str()) == Some("available") {
            if let Some(url) = result.get("downloadUrl").and_then(|v| v.as_str()) {
                let file_name = url
                    .rsplit('/')
                    .next()
                    .unwrap_or("Fledge-setup.exe")
                    .to_string();
                let expected_size = result.get("downloadSize").and_then(|v| v.as_u64());
                pending.insert(
                    channel.to_string(),
                    PendingInstaller {
                        download_url: url.to_string(),
                        file_name,
                        expected_size,
                    },
                );
                return;
            }
        }
        pending.remove(channel);
    }

    fn cache_path(&self, channel: &str) -> PathBuf {
        PathBuf::from(&self.layout.cache).join(format!("updater-check-{channel}.json"))
    }

    fn read_cache(&self, channel: &str) -> CoreResult<Option<ChannelCache>> {
        let path = self.cache_path(channel);
        let Ok(raw) = fs::read_to_string(path) else {
            return Ok(None);
        };
        let parsed: ChannelCache = serde_json::from_str(&raw)?;
        if parsed.fetched_at.is_empty() {
            return Ok(None);
        }
        Ok(Some(parsed))
    }

    fn is_cache_fresh(&self, fetched_at: &str, result: &Value) -> bool {
        let Ok(parsed) = chrono::DateTime::parse_from_rfc3339(fetched_at) else {
            return false;
        };
        let age = chrono::Utc::now().signed_duration_since(parsed.with_timezone(&chrono::Utc));
        if age.num_milliseconds() < 0 {
            return false;
        }
        let ttl = if result.get("status").and_then(|v| v.as_str()) == Some("up-to-date") {
            UP_TO_DATE_CACHE_TTL_MS
        } else {
            CACHE_TTL_MS
        };
        age.num_milliseconds() < ttl
    }

    fn write_cache(&self, channel: &str, result: &Value) -> CoreResult<()> {
        fs::create_dir_all(&self.layout.cache)?;
        let payload = ChannelCache {
            fetched_at: chrono::Utc::now().to_rfc3339(),
            result: result.clone(),
        };
        fs::write(
            self.cache_path(channel),
            format!("{}\n", serde_json::to_string_pretty(&payload)?),
        )?;
        Ok(())
    }

    fn emit_updater_progress(
        &self,
        current: f64,
        total: f64,
        percent: Option<f64>,
        message_key: &str,
        status: Option<&str>,
    ) {
        self.events.emit_progress(ProgressEvent {
            scope: "updater".into(),
            kind: Some("app-update".into()),
            session_id: None,
            job_id: Some("app-updater".into()),
            current,
            total,
            percent,
            bytes_per_second: None,
            message_key: Some(message_key.into()),
            status: status.map(|s| s.into()),
            meta: None,
        });
    }
}

fn effective_app_version() -> String {
    std::env::var("FLEDGE_DEV_APP_VERSION")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| APP_VERSION.to_string())
}

fn normalize_channel(channel: &str) -> &'static str {
    if channel == "prerelease" {
        "prerelease"
    } else {
        "stable"
    }
}

fn configured_feed_url(settings: &SettingsStore) -> Option<String> {
    if let Ok(env) = std::env::var("FLEDGE_UPDATE_FEED_URL") {
        let trimmed = env.trim().to_string();
        if !trimmed.is_empty() {
            return Some(trimmed);
        }
    }
    settings
        .get()
        .ok()
        .and_then(|s| {
            s.get("updateFeedUrl")
                .and_then(|v| v.as_str())
                .map(|s| s.trim().to_string())
        })
        .filter(|s| !s.is_empty())
}

fn normalize_notes(body: Option<&str>) -> Option<String> {
    let trimmed = body?.replace("\r\n", "\n").trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn find_windows_installer(assets: &[GithubReleaseAsset]) -> Option<&GithubReleaseAsset> {
    assets
        .iter()
        .find(|a| is_preferred_installer_name(&a.name))
        .or_else(|| {
            assets.iter().find(|a| {
                a.name.to_ascii_lowercase().ends_with(".exe")
                    && a.name.to_ascii_lowercase().contains("setup")
            })
        })
}

fn is_preferred_installer_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower == "fledge-setup.exe"
        || (lower.starts_with("fledge_") && lower.ends_with("_x64-setup.exe"))
        || (lower.starts_with("fledge_") && lower.ends_with("-setup.exe"))
}

fn pick_newest_release(
    mut releases: Vec<GithubRelease>,
    channel: &str,
    gen1: bool,
    gen2: bool,
) -> CoreResult<GithubRelease> {
    releases.retain(|r| !r.draft);
    if channel == "stable" {
        releases.retain(|r| !r.prerelease);
    }
    if gen1 {
        releases.retain(|r| is_eligible_generation1_update(&normalize_release_version(&r.tag_name)));
    } else if gen2 {
        releases.retain(|r| is_eligible_generation2_update(&normalize_release_version(&r.tag_name)));
    }
    // Newest first
    releases.sort_by(|a, b| {
        compare_versions(
            &normalize_release_version(&a.tag_name),
            &normalize_release_version(&b.tag_name),
        )
        .cmp(&0)
        .reverse()
    });

    releases.into_iter().next().ok_or_else(|| {
        CoreError::msg(if gen1 {
            "No eligible generation-1 GitHub release found (0.3+ is excluded)"
        } else if gen2 {
            "No eligible generation-2 GitHub release found (0.5+ is excluded)"
        } else {
            "No eligible GitHub release found"
        })
    })
}

fn reconcile_cached_update_result(cached: &Value, current_version: &str) -> Option<Value> {
    let next = cached.get("nextVersion").and_then(|v| v.as_str());
    if let Some(next_version) = next {
        if compare_versions(current_version, next_version) >= 0 {
            let mut out = cached.clone();
            if let Some(obj) = out.as_object_mut() {
                obj.insert("status".into(), json!("up-to-date"));
                obj.insert("currentVersion".into(), json!(current_version));
            }
            return Some(out);
        }
    }

    if let Some(cached_current) = cached.get("currentVersion").and_then(|v| v.as_str()) {
        if cached_current != current_version {
            return None;
        }
    }

    if let Some(next_version) = next {
        if (is_generation1_app(current_version) && !is_eligible_generation1_update(next_version))
            || (is_generation2_app(current_version) && !is_eligible_generation2_update(next_version))
        {
            return None;
        }
    }

    let status = cached.get("status").and_then(|v| v.as_str()).unwrap_or("");
    if status == "available" || status == "up-to-date" {
        let mut out = cached.clone();
        if let Some(obj) = out.as_object_mut() {
            obj.insert("currentVersion".into(), json!(current_version));
        }
        return Some(out);
    }
    Some(cached.clone())
}

fn stage_update_installer(installer_path: &Path) -> CoreResult<PathBuf> {
    let dir = updater_staging_dir();
    fs::create_dir_all(&dir)?;
    let file_name = installer_path
        .file_name()
        .ok_or_else(|| CoreError::msg("updater.applyFailed"))?;
    let staged = dir.join(file_name);
    if installer_path != staged {
        fs::copy(installer_path, &staged)?;
    }
    Ok(staged)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn github_asset_deserializes_snake_case() {
        let raw = r#"{
          "tag_name": "v0.5.1",
          "html_url": "https://github.com/arula-folne/Fledge/releases/tag/v0.5.1",
          "body": "notes",
          "assets": [{
            "name": "Fledge_0.5.1_x64-setup.exe",
            "browser_download_url": "https://github.com/arula-folne/Fledge/releases/download/v0.5.1/Fledge_0.5.1_x64-setup.exe",
            "size": 10326457
          }],
          "draft": false,
          "prerelease": false
        }"#;
        let release: GithubRelease = serde_json::from_str(raw).expect("parse release");
        let asset = find_windows_installer(&release.assets).expect("installer asset");
        assert_eq!(asset.name, "Fledge_0.5.1_x64-setup.exe");
        assert!(asset.browser_download_url.contains("Fledge_0.5.1_x64-setup.exe"));
    }

    #[test]
    fn preferred_installer_matches_tauri_nsis_name() {
        assert!(is_preferred_installer_name("Fledge_0.5.1_x64-setup.exe"));
        assert!(is_preferred_installer_name("Fledge-Setup.exe"));
        assert!(!is_preferred_installer_name("Fledge_0.5.1_x64_en-US.msi"));
    }
}
