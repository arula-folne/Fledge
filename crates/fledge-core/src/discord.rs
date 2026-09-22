//! Discord Rich Presence via local IPC (ports Electron `DiscordPresence.ts`).

use discord_rich_presence::{
    activity::{Activity, ActivityType, Assets, StatusDisplayType, Timestamps},
    DiscordIpc, DiscordIpcClient,
};
use parking_lot::Mutex;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

/// Matches `packages/shared` `DISCORD_APPLICATION_ID`.
pub const DISCORD_APPLICATION_ID: &str = "1538229017608454205";
const BRAND_NAME: &str = "Fledge";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PresencePhase {
    Idle,
    Preparing,
    Launching,
    Running,
}

impl PresencePhase {
    pub fn from_launch_state(state: &str) -> Option<Self> {
        match state {
            "preparing" => Some(Self::Preparing),
            "launching" => Some(Self::Launching),
            "running" => Some(Self::Running),
            "idle" | "exited" | "error" => Some(Self::Idle),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct PresenceContext {
    pub phase: PresencePhase,
    pub instance_name: Option<String>,
}

impl Default for PresencePhase {
    fn default() -> Self {
        Self::Idle
    }
}

pub struct DiscordPresence {
    enabled: AtomicBool,
    generation: AtomicU64,
    client: Mutex<Option<DiscordIpcClient>>,
    context: Mutex<PresenceContext>,
    started_at_ms: Mutex<i64>,
    client_id: String,
}

impl DiscordPresence {
    pub fn new() -> Self {
        let client_id = std::env::var("FLEDGE_DISCORD_CLIENT_ID")
            .ok()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| DISCORD_APPLICATION_ID.to_string());
        Self {
            enabled: AtomicBool::new(false),
            generation: AtomicU64::new(0),
            client: Mutex::new(None),
            context: Mutex::new(PresenceContext::default()),
            started_at_ms: Mutex::new(now_ms()),
            client_id,
        }
    }

    pub fn set_enabled(&self, enabled: bool) {
        self.enabled.store(enabled, Ordering::SeqCst);
        self.generation.fetch_add(1, Ordering::SeqCst);
        if !enabled {
            self.disconnect();
            return;
        }
        *self.started_at_ms.lock() = now_ms();
        self.refresh();
    }

    pub fn set_context(&self, phase: PresencePhase, instance_name: Option<String>) {
        {
            let mut ctx = self.context.lock();
            ctx.phase = phase;
            ctx.instance_name = instance_name;
        }
        if matches!(
            phase,
            PresencePhase::Running | PresencePhase::Preparing | PresencePhase::Launching
        ) {
            if phase == PresencePhase::Running {
                *self.started_at_ms.lock() = now_ms();
            }
        }
        if phase == PresencePhase::Idle {
            *self.started_at_ms.lock() = now_ms();
        }
        self.refresh();
    }

    pub fn destroy(&self) {
        self.enabled.store(false, Ordering::SeqCst);
        self.generation.fetch_add(1, Ordering::SeqCst);
        self.disconnect();
    }

    fn refresh(&self) {
        if !self.enabled.load(Ordering::SeqCst) {
            return;
        }
        if let Err(err) = self.ensure_connected() {
            tracing::warn!("discord: RPC connect failed: {err}");
            return;
        }

        let (details, name) = self.describe();
        let started = *self.started_at_ms.lock();
        let activity = Activity::new()
            .name(name)
            .activity_type(ActivityType::Playing)
            .details(details)
            .status_display_type(StatusDisplayType::Name)
            .timestamps(Timestamps::new().start(started))
            .assets(
                Assets::new()
                    .large_image("fledge")
                    .large_text(BRAND_NAME),
            );

        let mut guard = self.client.lock();
        let Some(client) = guard.as_mut() else {
            return;
        };
        if let Err(err) = client.set_activity(activity) {
            tracing::warn!("discord: setActivity failed: {err}");
            // Drop broken connection so next refresh reconnects
            let _ = client.clear_activity();
            let _ = client.close();
            *guard = None;
        }
    }

    fn ensure_connected(&self) -> Result<(), String> {
        {
            let guard = self.client.lock();
            if guard.is_some() {
                return Ok(());
            }
        }
        let gen = self.generation.load(Ordering::SeqCst);
        let mut client = DiscordIpcClient::new(&self.client_id);
        client
            .connect()
            .map_err(|e| format!("{e}"))?;
        if self.generation.load(Ordering::SeqCst) != gen || !self.enabled.load(Ordering::SeqCst) {
            let _ = client.close();
            return Ok(());
        }
        *self.client.lock() = Some(client);
        tracing::info!("discord: RPC connected (Fledge)");
        Ok(())
    }

    fn disconnect(&self) {
        let mut guard = self.client.lock();
        if let Some(mut client) = guard.take() {
            let _ = client.clear_activity();
            let _ = client.close();
            tracing::info!("discord: RPC cleared");
        }
    }

    fn describe(&self) -> (String, String) {
        let ctx = self.context.lock().clone();
        let instance = ctx
            .instance_name
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty());
        let details = match ctx.phase {
            PresencePhase::Preparing | PresencePhase::Launching => {
                if let Some(name) = instance {
                    format!("{name}を起動中")
                } else {
                    "起動中".into()
                }
            }
            PresencePhase::Running => {
                if let Some(name) = instance {
                    format!("{name}をプレイ中")
                } else {
                    "Minecraftをプレイ中".into()
                }
            }
            PresencePhase::Idle => "ランチャー".into(),
        };
        (details, BRAND_NAME.to_string())
    }
}

impl Default for DiscordPresence {
    fn default() -> Self {
        Self::new()
    }
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
