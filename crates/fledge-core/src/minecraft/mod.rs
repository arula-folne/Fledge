//! Minecraft install service (vanilla / fabric / quilt / forge / neoforge).

mod install;
mod install_ready;
mod resolve;

pub use install_ready::{natives_root, ready_key};
pub use resolve::{library_artifact_rel_path, load_resolved_version, ResolvedVersion};

use crate::error::{CoreError, CoreResult};
use crate::minecraft::install::{
    complete_installation, ensure_natives, install_profile, repair_and_ready, InstallContext,
};
use crate::minecraft::install_ready::{
    find_installed_version_id, find_ready_version_id, is_version_complete, profile_fields,
};
use crate::paths::PathLayout;
use crate::progress::EventBus;
use crate::settings::SettingsStore;
use parking_lot::Mutex;
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Notify;

/// `concurrentDownloads` は「同時にネットワーク準備できるインスタンス数」。
/// 1 インスタンスの準備＝スロット 1（アセット個数は数えない）。
struct InstanceDownloadGate {
    active: Mutex<usize>,
    notify: Notify,
}

struct InstanceDownloadPermit<'a> {
    gate: &'a InstanceDownloadGate,
}

impl Drop for InstanceDownloadPermit<'_> {
    fn drop(&mut self) {
        {
            let mut active = self.gate.active.lock();
            *active = active.saturating_sub(1);
        }
        self.gate.notify.notify_waiters();
    }
}

impl InstanceDownloadGate {
    fn new() -> Self {
        Self {
            active: Mutex::new(0),
            notify: Notify::new(),
        }
    }

    async fn acquire(&self, limit: usize) -> InstanceDownloadPermit<'_> {
        let limit = limit.max(1);
        loop {
            {
                let mut active = self.active.lock();
                if *active < limit {
                    *active += 1;
                    return InstanceDownloadPermit { gate: self };
                }
            }
            self.notify.notified().await;
        }
    }
}

pub struct MinecraftService {
    layout: PathLayout,
    events: Arc<EventBus>,
    settings: Arc<SettingsStore>,
    inflight: Mutex<HashMap<String, ()>>,
    instance_gate: InstanceDownloadGate,
}

impl MinecraftService {
    pub fn new(layout: PathLayout, events: Arc<EventBus>, settings: Arc<SettingsStore>) -> Self {
        Self {
            layout,
            events,
            settings,
            inflight: Mutex::new(HashMap::new()),
            instance_gate: InstanceDownloadGate::new(),
        }
    }

    pub fn minecraft_root(&self) -> PathBuf {
        PathBuf::from(&self.layout.minecraft)
    }

    /// 同時に準備できるインスタンス数（設定）。アセット並列数ではない。
    fn max_concurrent_instances(&self) -> usize {
        self.settings
            .get()
            .ok()
            .and_then(|s| s.get("concurrentDownloads").and_then(|v| v.as_u64()))
            .map(|n| n as usize)
            .unwrap_or(10)
            .clamp(1, 32)
    }

    fn ctx(&self, session_id: &str) -> InstallContext {
        InstallContext {
            minecraft_root: self.minecraft_root(),
            events: Arc::clone(&self.events),
            session_id: session_id.to_string(),
        }
    }

    /// Ensure client + libraries + assets + natives are installed.
    /// Returns the version id to launch.
    pub async fn ensure_installed(
        &self,
        profile: &Value,
        session_id: &str,
        java_path: Option<&str>,
    ) -> CoreResult<String> {
        let (mc, loader, lv) = profile_fields(profile)
            .ok_or_else(|| CoreError::msg("invalid profile for install"))?;
        let key = ready_key(&mc, &loader, lv.as_deref());

        {
            let mut guard = self.inflight.lock();
            if !guard.contains_key(&key) {
                guard.insert(key.clone(), ());
            }
        }

        let result = self
            .ensure_installed_inner(profile, session_id, java_path)
            .await;
        self.inflight.lock().remove(&key);
        result
    }

    async fn ensure_installed_inner(
        &self,
        profile: &Value,
        session_id: &str,
        java_path: Option<&str>,
    ) -> CoreResult<String> {
        let root = self.minecraft_root();
        let (mc, loader, lv) = profile_fields(profile)
            .ok_or_else(|| CoreError::msg("invalid profile for install"))?;
        let ctx = self.ctx(session_id);

        if let Some(ready_id) = find_ready_version_id(&root, &mc, &loader, lv.as_deref()) {
            tracing::info!("Reusing installed {ready_id} (skip network install)");
            ensure_natives(&ctx, &ready_id).await?;
            return Ok(ready_id);
        }

        // 未準備のときだけインスタンス枠を確保（枠＝インスタンス 1）
        let _permit = self
            .instance_gate
            .acquire(self.max_concurrent_instances())
            .await;

        // 待ちのあいだに他インスタンスが同じ版を入れ終わっている場合
        if let Some(ready_id) = find_ready_version_id(&root, &mc, &loader, lv.as_deref()) {
            tracing::info!("Reusing installed {ready_id} after waiting for download slot");
            ensure_natives(&ctx, &ready_id).await?;
            return Ok(ready_id);
        }

        if let Some(partial_id) = find_installed_version_id(&root, &mc, &loader, lv.as_deref()) {
            tracing::info!("Repairing incomplete {partial_id}");
            if let Some(id) = repair_and_ready(&ctx, profile, &partial_id).await? {
                return Ok(id);
            }
        }

        tracing::info!(
            "Installing {loader} {mc}{}",
            lv.as_ref()
                .map(|v| format!(" ({v})"))
                .unwrap_or_default()
        );
        let installed_id = install_profile(&ctx, profile, java_path).await?;
        if !is_version_complete(&root, &installed_id) {
            complete_installation(&ctx, &installed_id).await?;
        }
        if !is_version_complete(&root, &installed_id) {
            return Err(CoreError::msg(format!(
                "Incomplete install: {installed_id}"
            )));
        }
        ensure_natives(&ctx, &installed_id).await?;
        Ok(installed_id)
    }
}
