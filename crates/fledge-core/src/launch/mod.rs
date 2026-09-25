//! Launch orchestration: auth → java → install → options → spawn.

mod args;
mod options_guard;
mod process;

pub use args::{supports_session_host, LaunchCredentials};

use crate::auth::{AuthProvider, SessionJoinProxy};
use crate::error::{CoreError, CoreResult};
use crate::instances::InstanceStore;
use crate::java::JavaManager;
use crate::launch::args::{
    build_java_command, jvm_args_from_profile, memory_from_profile, DisplayOptions, LaunchArgInput,
};
use crate::launch::options_guard::{
    apply_minecraft_initial_patch_to_instance, hashmap_to_json, latest_log_path,
    merge_minecraft_debug_overlay_file, merge_minecraft_options_file,
    snapshot_minecraft_debug_overlay, snapshot_minecraft_initial_options,
    verify_minecraft_options_file, MINECRAFT_INITIAL_SETTINGS_APPLY_GENERATION as APPLY_GEN,
};
use crate::launch::process::GameProcess;
use crate::minecraft::{load_resolved_version, MinecraftService};
use crate::progress::{EventBus, ProgressEvent};
use crate::settings::SettingsStore;
use parking_lot::Mutex;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::Mutex as AsyncMutex;
use uuid::Uuid;

const INITIAL_SETTINGS_LOG_POLL_MS: u64 = 2_000;
const INITIAL_SETTINGS_COMMIT_MIN_RUNTIME_MS: u64 = 8_000;
const INITIAL_SETTINGS_PRELOAD_WINDOW_MS: u64 = 4_000;
const INITIAL_SETTINGS_PRELOAD_POLL_MS: u64 = 30;
const INITIAL_SETTINGS_PRELOAD_GUARD_AT_MS: &[u64] = &[
    0, 30, 60, 100, 150, 200, 300, 500, 750, 1_000, 1_500, 2_000, 2_500, 3_000,
];
const INITIAL_SETTINGS_POSTLOAD_GUARD_AT_MS: &[u64] = &[7_000, 12_000, 20_000];

#[derive(Debug, Clone, PartialEq, Eq)]
enum SessionState {
    Preparing,
    Launching,
    Running,
    Exited,
    Error,
    Idle,
}

impl SessionState {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Preparing => "preparing",
            Self::Launching => "launching",
            Self::Running => "running",
            Self::Exited => "exited",
            Self::Error => "error",
            Self::Idle => "idle",
        }
    }

    fn is_busy(&self) -> bool {
        matches!(self, Self::Preparing | Self::Launching | Self::Running)
    }
}

struct LaunchSession {
    id: String,
    profile_id: String,
    account_id: String,
    abort: Arc<AtomicBool>,
    state: SessionState,
    child: Option<Arc<AsyncMutex<GameProcess>>>,
    initial_settings_pending_commit: bool,
    initial_settings_instance_dir: Option<PathBuf>,
    initial_settings_options: HashMap<String, String>,
    initial_settings_overlay: HashMap<String, String>,
    initial_settings_title_seen: Arc<AtomicBool>,
    initial_settings_rewrote_during_session: Arc<AtomicBool>,
    initial_settings_clean_at_title: Arc<AtomicBool>,
    initial_settings_verified_at_spawn: bool,
    running_since: Option<Instant>,
    guard_cancel: Arc<AtomicBool>,
}

pub struct LaunchOrchestrator {
    auth: Arc<AuthProvider>,
    session_proxy: Arc<SessionJoinProxy>,
    java: Arc<JavaManager>,
    minecraft: Arc<MinecraftService>,
    events: Arc<EventBus>,
    instances: Arc<InstanceStore>,
    settings: Arc<SettingsStore>,
    sessions: Arc<Mutex<HashMap<String, LaunchSession>>>,
}

impl LaunchOrchestrator {
    pub fn new(
        auth: Arc<AuthProvider>,
        session_proxy: Arc<SessionJoinProxy>,
        java: Arc<JavaManager>,
        minecraft: Arc<MinecraftService>,
        events: Arc<EventBus>,
        instances: Arc<InstanceStore>,
        settings: Arc<SettingsStore>,
    ) -> Self {
        Self {
            auth,
            session_proxy,
            java,
            minecraft,
            events,
            instances,
            settings,
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn list_sessions(&self) -> Vec<Value> {
        self.sessions
            .lock()
            .values()
            .map(|s| {
                json!({
                  "sessionId": s.id,
                  "profileId": s.profile_id,
                  "accountId": s.account_id,
                  "state": s.state.as_str()
                })
            })
            .collect()
    }

    pub fn has_busy_session(&self) -> bool {
        self.sessions.lock().values().any(|s| s.state.is_busy())
    }

    pub fn busy_account_ids(&self) -> Vec<String> {
        let mut ids = Vec::new();
        for s in self.sessions.lock().values() {
            if s.state.is_busy() && !s.account_id.is_empty() && !ids.contains(&s.account_id) {
                ids.push(s.account_id.clone());
            }
        }
        ids
    }

    fn ensure_profile_not_busy(&self, profile_id: &str) -> CoreResult<()> {
        for s in self.sessions.lock().values() {
            if s.profile_id == profile_id && s.state.is_busy() {
                return Err(CoreError::msg("launch.error.alreadyRunning"));
            }
        }
        Ok(())
    }

    /// Java + install only. Never writes options.txt.
    pub async fn prepare(&self, profile_id: &str) -> CoreResult<Value> {
        self.ensure_profile_not_busy(profile_id)?;
        let profile = self
            .instances
            .get(profile_id)?
            .ok_or_else(|| CoreError::msg("launch.error.noInstance"))?;

        let session_id = Uuid::new_v4().to_string();
        let abort = Arc::new(AtomicBool::new(false));
        self.sessions.lock().insert(
            session_id.clone(),
            LaunchSession {
                id: session_id.clone(),
                profile_id: profile_id.to_string(),
                account_id: String::new(),
                abort: Arc::clone(&abort),
                state: SessionState::Preparing,
                child: None,
                initial_settings_pending_commit: false,
                initial_settings_instance_dir: None,
                initial_settings_options: HashMap::new(),
                initial_settings_overlay: HashMap::new(),
                initial_settings_title_seen: Arc::new(AtomicBool::new(false)),
                initial_settings_rewrote_during_session: Arc::new(AtomicBool::new(false)),
                initial_settings_clean_at_title: Arc::new(AtomicBool::new(false)),
                initial_settings_verified_at_spawn: false,
                running_since: None,
                guard_cancel: Arc::new(AtomicBool::new(false)),
            },
        );
        self.emit_state(&session_id, profile_id, "", "preparing", None, None);

        let outcome = async {
            let mc = profile
                .get("minecraftVersion")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            self.emit_phase(&session_id, "java", "launch.phase.java");
            self.emit_progress(&session_id, 1.0, 2.0, Some(10.0), "launch.phase.java");
            let java_path = self.java.ensure_java(mc, &session_id).await?;
            if abort.load(Ordering::SeqCst) {
                return Err(CoreError::msg("download.cancelled"));
            }

            self.emit_phase(&session_id, "install", "launch.phase.install");
            self.emit_progress(&session_id, 2.0, 2.0, Some(40.0), "launch.phase.install");
            let _ = self
                .minecraft
                .ensure_installed(&profile, &session_id, Some(&java_path))
                .await?;
            if abort.load(Ordering::SeqCst) {
                return Err(CoreError::msg("download.cancelled"));
            }

            Ok(())
        }
        .await;

        match outcome {
            Ok(()) => {
                self.events.emit_progress(ProgressEvent {
                    scope: "launch".into(),
                    kind: Some("install".into()),
                    session_id: Some(session_id.clone()),
                    job_id: None,
                    current: 2.0,
                    total: 2.0,
                    percent: Some(100.0),
                    bytes_per_second: None,
                    message_key: Some("library.prepareDone".into()),
                    status: Some("completed".into()),
                    meta: None,
                });
                self.emit_state(&session_id, profile_id, "", "idle", None, None);
                self.sessions.lock().remove(&session_id);
                Ok(json!({ "sessionId": session_id }))
            }
            Err(err) => {
                let (key, detail) = split_launch_error(&err);
                self.emit_state(
                    &session_id,
                    profile_id,
                    "",
                    "error",
                    Some(&key),
                    detail.as_deref(),
                );
                self.sessions.lock().remove(&session_id);
                Err(err)
            }
        }
    }

    pub async fn start(
        &self,
        profile_id: &str,
        account_id: Option<&str>,
    ) -> CoreResult<Value> {
        self.ensure_profile_not_busy(profile_id)?;
        let profile = self
            .instances
            .get(profile_id)?
            .ok_or_else(|| CoreError::msg("launch.error.noInstance"))?;

        let session_id = Uuid::new_v4().to_string();
        let abort = Arc::new(AtomicBool::new(false));
        let account_hint = account_id.unwrap_or("").to_string();
        self.sessions.lock().insert(
            session_id.clone(),
            LaunchSession {
                id: session_id.clone(),
                profile_id: profile_id.to_string(),
                account_id: account_hint.clone(),
                abort: Arc::clone(&abort),
                state: SessionState::Preparing,
                child: None,
                initial_settings_pending_commit: false,
                initial_settings_instance_dir: None,
                initial_settings_options: HashMap::new(),
                initial_settings_overlay: HashMap::new(),
                initial_settings_title_seen: Arc::new(AtomicBool::new(false)),
                initial_settings_rewrote_during_session: Arc::new(AtomicBool::new(false)),
                initial_settings_clean_at_title: Arc::new(AtomicBool::new(false)),
                initial_settings_verified_at_spawn: false,
                running_since: None,
                guard_cancel: Arc::new(AtomicBool::new(false)),
            },
        );
        self.emit_state(&session_id, profile_id, &account_hint, "preparing", None, None);

        match self
            .start_inner(&session_id, profile_id, &profile, account_id, &abort)
            .await
        {
            Ok(v) => Ok(v),
            Err(err) => {
                let (key, detail) = split_launch_error(&err);
                self.emit_state(
                    &session_id,
                    profile_id,
                    &account_hint,
                    "error",
                    Some(&key),
                    detail.as_deref(),
                );
                if let Some(s) = self.sessions.lock().remove(&session_id) {
                    s.guard_cancel.store(true, Ordering::SeqCst);
                }
                Err(err)
            }
        }
    }

    async fn start_inner(
        &self,
        session_id: &str,
        profile_id: &str,
        profile: &Value,
        account_id: Option<&str>,
        abort: &AtomicBool,
    ) -> CoreResult<Value> {
        let mc = profile
            .get("minecraftVersion")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        self.emit_phase(session_id, "auth", "launch.phase.auth");
        self.emit_progress(session_id, 1.0, 4.0, None, "launch.phase.auth");
        let credentials_value = self.auth.ensure_credentials(account_id).await?;
        let account_id_resolved = account_id
            .map(|s| s.to_string())
            .or_else(|| {
                self.auth
                    .get_session()
                    .ok()
                    .and_then(|(a, _)| a.map(|x| x.id))
            })
            .unwrap_or_default();
        if let Some(s) = self.sessions.lock().get_mut(session_id) {
            s.account_id = account_id_resolved.clone();
        }

        let credentials = LaunchCredentials {
            uuid: credentials_value
                .get("uuid")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            name: credentials_value
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            access_token: credentials_value
                .get("accessToken")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
        };
        if credentials.access_token.is_empty() {
            return Err(CoreError::msg("auth.error.notLoggedIn"));
        }
        if abort.load(Ordering::SeqCst) {
            return Err(CoreError::msg("download.cancelled"));
        }

        let session_host = if supports_session_host(&mc) {
            match self.session_proxy.ensure_started() {
                Ok(url) => Some(url),
                Err(err) => {
                    tracing::warn!("Session proxy failed to start: {err}");
                    None
                }
            }
        } else {
            None
        };

        self.emit_phase(session_id, "java", "launch.phase.java");
        self.emit_progress(session_id, 2.0, 4.0, None, "launch.phase.java");
        let java_path = self.java.ensure_java(&mc, session_id).await?;
        if abort.load(Ordering::SeqCst) {
            return Err(CoreError::msg("download.cancelled"));
        }

        self.emit_phase(session_id, "install", "launch.phase.install");
        self.emit_progress(session_id, 3.0, 4.0, None, "launch.phase.install");
        let version_id = self
            .minecraft
            .ensure_installed(profile, session_id, Some(&java_path))
            .await?;
        if abort.load(Ordering::SeqCst) {
            return Err(CoreError::msg("download.cancelled"));
        }
        let resolved_java = self.java.ensure_java(&mc, session_id).await?;

        let instance_dir = self.instances.instance_dir(profile_id);
        let settings = self.settings.get()?;

        let initial = self
            .ensure_initial_settings(profile_id, &instance_dir)
            .await?;
        if initial.first_launch_pass {
            if let Some(s) = self.sessions.lock().get_mut(session_id) {
                s.initial_settings_pending_commit = true;
                s.initial_settings_instance_dir = Some(instance_dir.clone());
                s.initial_settings_options = initial.options.clone();
                s.initial_settings_overlay = initial.overlay.clone();
            }
        }
        if !initial.options.is_empty() {
            apply_minecraft_initial_patch_to_instance(
                &instance_dir,
                &initial.options,
                &initial.overlay,
            )
            .await?;
            if !verify_minecraft_options_file(&instance_dir, &initial.options) {
                return Err(CoreError::msg(
                    "Minecraft initial options.txt could not be verified before launch",
                ));
            }
            if let Some(s) = self.sessions.lock().get_mut(session_id) {
                s.initial_settings_verified_at_spawn = true;
            }
        }

        self.emit_phase(session_id, "spawn", "launch.phase.spawn");
        self.emit_state(
            session_id,
            profile_id,
            &account_id_resolved,
            "launching",
            None,
            None,
        );

        let resolved = load_resolved_version(&self.minecraft.minecraft_root(), &version_id)?;
        let (min_mb, max_mb) = memory_from_profile(profile);
        let display = DisplayOptions {
            fullscreen: settings
                .get("gameFullscreen")
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
            width: settings
                .get("gameWindowWidth")
                .and_then(|v| v.as_u64())
                .unwrap_or(1280) as u32,
            height: settings
                .get("gameWindowHeight")
                .and_then(|v| v.as_u64())
                .unwrap_or(720) as u32,
        };
        let fledge_discord = settings
            .get("discordRichPresence")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let cmd = build_java_command(&LaunchArgInput {
            java_path: resolved_java,
            version_id: version_id.clone(),
            minecraft_root: self.minecraft.minecraft_root(),
            instance_dir: instance_dir.clone(),
            resolved,
            credentials,
            memory_min_mb: min_mb,
            memory_max_mb: max_mb,
            extra_jvm_args: jvm_args_from_profile(profile),
            display,
            fledge_discord_rpc: fledge_discord,
            session_host,
        });

        let mut game = GameProcess::spawn(&cmd, &instance_dir)?;
        let stdout = game.take_stdout();
        let stderr = game.take_stderr();
        let child = Arc::new(AsyncMutex::new(game));

        let (guard_cancel, title_seen, rewrote, clean_at_title, verified_at_spawn, options, overlay) = {
            let mut sessions = self.sessions.lock();
            let s = sessions
                .get_mut(session_id)
                .ok_or_else(|| CoreError::msg("launch.error.generic"))?;
            s.child = Some(Arc::clone(&child));
            s.running_since = Some(Instant::now());
            s.state = SessionState::Running;
            (
                Arc::clone(&s.guard_cancel),
                Arc::clone(&s.initial_settings_title_seen),
                Arc::clone(&s.initial_settings_rewrote_during_session),
                Arc::clone(&s.initial_settings_clean_at_title),
                s.initial_settings_verified_at_spawn,
                s.initial_settings_options.clone(),
                s.initial_settings_overlay.clone(),
            )
        };

        self.emit_state(
            session_id,
            profile_id,
            &account_id_resolved,
            "running",
            None,
            None,
        );
        self.emit_phase(session_id, "running", "launch.phase.running");

        if !options.is_empty() {
            self.start_initial_settings_guards(
                session_id,
                Arc::clone(&guard_cancel),
                Arc::clone(&title_seen),
                Arc::clone(&rewrote),
                Arc::clone(&clean_at_title),
                instance_dir.clone(),
                options.clone(),
                overlay.clone(),
            );
        }

        spawn_log_watchers(stdout, stderr, Arc::clone(&title_seen));

        let wait_child = Arc::clone(&child);
        let wait_sid = session_id.to_string();
        let wait_pid = profile_id.to_string();
        let wait_aid = account_id_resolved.clone();
        let events = Arc::clone(&self.events);
        let instances = Arc::clone(&self.instances);
        let sessions = Arc::clone(&self.sessions);
        let pending_commit = {
            self.sessions
                .lock()
                .get(session_id)
                .map(|s| s.initial_settings_pending_commit)
                .unwrap_or(false)
        };
        let running_since = Instant::now();
        let dir_for_exit = instance_dir.clone();

        tokio::spawn(async move {
            let code = {
                let mut g = wait_child.lock().await;
                g.wait().await.ok().flatten()
            };
            guard_cancel.store(true, Ordering::SeqCst);

            // Final title poll from latest.log
            if pending_commit && !title_seen.load(Ordering::SeqCst) {
                if let Ok(text) = std::fs::read_to_string(latest_log_path(&dir_for_exit)) {
                    let slice = if text.len() > 48_000 {
                        &text[text.len() - 48_000..]
                    } else {
                        &text
                    };
                    if title_log_matches(slice) {
                        title_seen.store(true, Ordering::SeqCst);
                    }
                }
            }
            if pending_commit && title_seen.load(Ordering::SeqCst) && !options.is_empty() {
                if verify_minecraft_options_file(&dir_for_exit, &options)
                    && !rewrote.load(Ordering::SeqCst)
                {
                    clean_at_title.store(true, Ordering::SeqCst);
                } else if !verify_minecraft_options_file(&dir_for_exit, &options) {
                    let _ = merge_minecraft_options_file(&dir_for_exit, &options);
                    if !overlay.is_empty() {
                        let _ = merge_minecraft_debug_overlay_file(&dir_for_exit, &overlay);
                    }
                    rewrote.store(true, Ordering::SeqCst);
                    clean_at_title.store(false, Ordering::SeqCst);
                }
            }

            finalize_initial_settings_commit(
                &instances,
                &wait_pid,
                pending_commit,
                Some(running_since),
                &dir_for_exit,
                &options,
                &overlay,
                verified_at_spawn,
                title_seen.load(Ordering::SeqCst),
                clean_at_title.load(Ordering::SeqCst),
                rewrote.load(Ordering::SeqCst),
                code.unwrap_or(0),
            );

            let exit_code = code.unwrap_or(0);
            let (state, err_key, err_detail) = if exit_code != 0 {
                (
                    "error",
                    Some("launch.error.gameExited"),
                    Some(game_exit_error_detail(&dir_for_exit, exit_code)),
                )
            } else {
                ("exited", None, None)
            };
            events.emit_launch_state(json!({
              "sessionId": wait_sid,
              "profileId": wait_pid,
              "accountId": wait_aid,
              "state": state,
              "code": exit_code,
              "errorMessageKey": err_key,
              "errorDetail": err_detail
            }));
            sessions.lock().remove(&wait_sid);
        });

        let played_at = chrono::Utc::now().to_rfc3339();
        let _ = self.settings.set(json!({
          "lastPlayedInstanceId": profile_id,
          "selectedInstanceId": profile_id
        }));
        let _ = self
            .instances
            .update(profile_id, &json!({ "lastPlayedAt": played_at }));

        self.emit_progress(session_id, 4.0, 4.0, Some(100.0), "launch.phase.running");
        Ok(json!({ "sessionId": session_id }))
    }

    pub fn cancel(&self, session_id: Option<&str>) {
        let mut sessions = self.sessions.lock();
        let id = if let Some(id) = session_id {
            if sessions
                .get(id)
                .map(|s| s.state == SessionState::Preparing)
                .unwrap_or(false)
            {
                Some(id.to_string())
            } else {
                None
            }
        } else {
            sessions
                .values()
                .find(|s| s.state == SessionState::Preparing)
                .map(|s| s.id.clone())
        };
        let Some(id) = id else { return };
        if let Some(session) = sessions.remove(&id) {
            session.abort.store(true, Ordering::SeqCst);
            let profile_id = session.profile_id;
            let account_id = session.account_id;
            drop(sessions);
            self.events.emit_launch_state(json!({
              "sessionId": id,
              "profileId": profile_id,
              "accountId": account_id,
              "state": "idle"
            }));
        }
    }

    pub fn kill(&self, session_id: Option<&str>) {
        let child = {
            let mut sessions = self.sessions.lock();
            let session = if let Some(id) = session_id {
                sessions.get_mut(id)
            } else {
                sessions
                    .values_mut()
                    .find(|s| s.state == SessionState::Running || s.child.is_some())
            };
            let Some(session) = session else { return };
            session.guard_cancel.store(true, Ordering::SeqCst);
            session.child.clone()
        };
        if let Some(child) = child {
            spawn_kill(child);
        }
    }

    async fn ensure_initial_settings(
        &self,
        profile_id: &str,
        instance_dir: &Path,
    ) -> CoreResult<InitialSettingsResult> {
        let empty = InitialSettingsResult {
            first_launch_pass: false,
            options: HashMap::new(),
            overlay: HashMap::new(),
        };
        let latest = match self.instances.get(profile_id)? {
            Some(p) => p,
            None => return Ok(empty),
        };
        if !latest
            .get("minecraftInitialSettingsSeeded")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
        {
            return Ok(empty);
        }
        let generation = latest
            .get("minecraftInitialSettingsApplyGeneration")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        let committed = latest
            .get("minecraftInitialSettingsApplied")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
            && generation >= APPLY_GEN;
        if committed {
            return Ok(empty);
        }

        let settings = self.settings.get()?;
        let mc_version = latest
            .get("minecraftVersion")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let initial = settings
            .get("minecraftInitialSettings")
            .cloned()
            .unwrap_or(json!({}));
        let options = snapshot_minecraft_initial_options(&initial, mc_version);
        let overlay = snapshot_minecraft_debug_overlay(&initial, mc_version);

        let _ = self.instances.update(
            profile_id,
            &json!({
              "pendingMinecraftOptions": hashmap_to_json(&options),
              "pendingMinecraftDebugOverlay": hashmap_to_json(&overlay)
            }),
        );

        // 変更なし（すべて MC 既定）: 既存 options.txt を消してゲーム側の既定生成に任せる
        // （複製で持ち込まれた旧 options や、リセット後の作り直しで古い設定が残るのを防ぐ）
        if options.is_empty() && overlay.is_empty() {
            let _ = std::fs::remove_file(instance_dir.join("options.txt"));
            let _ = std::fs::remove_file(instance_dir.join("debug.json"));
            return Ok(InitialSettingsResult {
                first_launch_pass: true,
                options,
                overlay,
            });
        }

        apply_minecraft_initial_patch_to_instance(instance_dir, &options, &overlay).await?;
        Ok(InitialSettingsResult {
            first_launch_pass: true,
            options,
            overlay,
        })
    }

    #[allow(clippy::too_many_arguments)]
    fn start_initial_settings_guards(
        &self,
        _session_id: &str,
        cancel: Arc<AtomicBool>,
        title_seen: Arc<AtomicBool>,
        rewrote: Arc<AtomicBool>,
        clean_at_title: Arc<AtomicBool>,
        instance_dir: PathBuf,
        options: HashMap<String, String>,
        overlay: HashMap<String, String>,
    ) {
        // Preload poll 4s @ 30ms
        {
            let cancel = Arc::clone(&cancel);
            let title_seen = Arc::clone(&title_seen);
            let rewrote = Arc::clone(&rewrote);
            let dir = instance_dir.clone();
            let opts = options.clone();
            let ov = overlay.clone();
            tokio::spawn(async move {
                let started = Instant::now();
                while !cancel.load(Ordering::SeqCst)
                    && !title_seen.load(Ordering::SeqCst)
                    && started.elapsed() < Duration::from_millis(INITIAL_SETTINGS_PRELOAD_WINDOW_MS)
                {
                    if repair_if_needed(&dir, &opts, &ov) {
                        // preload: do not set rewrote
                    }
                    tokio::time::sleep(Duration::from_millis(INITIAL_SETTINGS_PRELOAD_POLL_MS))
                        .await;
                }
                let _ = rewrote;
            });
        }

        for &ms in INITIAL_SETTINGS_PRELOAD_GUARD_AT_MS {
            let cancel = Arc::clone(&cancel);
            let title_seen = Arc::clone(&title_seen);
            let dir = instance_dir.clone();
            let opts = options.clone();
            let ov = overlay.clone();
            tokio::spawn(async move {
                tokio::time::sleep(Duration::from_millis(ms)).await;
                if cancel.load(Ordering::SeqCst) || title_seen.load(Ordering::SeqCst) {
                    return;
                }
                let _ = repair_if_needed(&dir, &opts, &ov);
            });
        }
        for &ms in INITIAL_SETTINGS_POSTLOAD_GUARD_AT_MS {
            let cancel = Arc::clone(&cancel);
            let title_seen = Arc::clone(&title_seen);
            let rewrote = Arc::clone(&rewrote);
            let dir = instance_dir.clone();
            let opts = options.clone();
            let ov = overlay.clone();
            tokio::spawn(async move {
                tokio::time::sleep(Duration::from_millis(ms)).await;
                if cancel.load(Ordering::SeqCst) || title_seen.load(Ordering::SeqCst) {
                    return;
                }
                if repair_if_needed(&dir, &opts, &ov) {
                    rewrote.store(true, Ordering::SeqCst);
                }
            });
        }

        // latest.log title poller
        {
            let cancel = Arc::clone(&cancel);
            let title_seen = Arc::clone(&title_seen);
            let rewrote = Arc::clone(&rewrote);
            let clean = Arc::clone(&clean_at_title);
            let dir = instance_dir;
            let opts = options;
            let ov = overlay;
            tokio::spawn(async move {
                while !cancel.load(Ordering::SeqCst) && !title_seen.load(Ordering::SeqCst) {
                    tokio::time::sleep(Duration::from_millis(INITIAL_SETTINGS_LOG_POLL_MS)).await;
                    if let Ok(text) = std::fs::read_to_string(latest_log_path(&dir)) {
                        let slice = if text.len() > 48_000 {
                            &text[text.len() - 48_000..]
                        } else {
                            &text
                        };
                        if title_log_matches(slice) {
                            title_seen.store(true, Ordering::SeqCst);
                            cancel.store(true, Ordering::SeqCst);
                            if verify_minecraft_options_file(&dir, &opts)
                                && !rewrote.load(Ordering::SeqCst)
                            {
                                clean.store(true, Ordering::SeqCst);
                            } else {
                                let _ = merge_minecraft_options_file(&dir, &opts);
                                if !ov.is_empty() {
                                    let _ = merge_minecraft_debug_overlay_file(&dir, &ov);
                                }
                                rewrote.store(true, Ordering::SeqCst);
                                clean.store(false, Ordering::SeqCst);
                            }
                            break;
                        }
                    }
                }
            });
        }
    }

    fn emit_phase(&self, session_id: &str, phase: &str, message_key: &str) {
        self.events.emit_launch_phase(json!({
          "sessionId": session_id,
          "phase": phase,
          "messageKey": message_key
        }));
    }

    fn emit_state(
        &self,
        session_id: &str,
        profile_id: &str,
        account_id: &str,
        state: &str,
        error_message_key: Option<&str>,
        error_detail: Option<&str>,
    ) {
        if let Some(s) = self.sessions.lock().get_mut(session_id) {
            s.state = match state {
                "preparing" => SessionState::Preparing,
                "launching" => SessionState::Launching,
                "running" => SessionState::Running,
                "exited" => SessionState::Exited,
                "error" => SessionState::Error,
                _ => SessionState::Idle,
            };
        }
        self.events.emit_launch_state(json!({
          "sessionId": session_id,
          "profileId": profile_id,
          "accountId": account_id,
          "state": state,
          "errorMessageKey": error_message_key,
          "errorDetail": error_detail
        }));
    }

    fn emit_progress(
        &self,
        session_id: &str,
        current: f64,
        total: f64,
        percent: Option<f64>,
        message_key: &str,
    ) {
        self.events.emit_progress(ProgressEvent {
            scope: "launch".into(),
            kind: None,
            session_id: Some(session_id.into()),
            job_id: None,
            current,
            total,
            percent,
            bytes_per_second: None,
            message_key: Some(message_key.into()),
            status: None,
            meta: None,
        });
    }
}

struct InitialSettingsResult {
    first_launch_pass: bool,
    options: HashMap<String, String>,
    overlay: HashMap<String, String>,
}

fn title_log_matches(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    lower.contains("turning off relative mouse")
        || lower.contains("startup done in ")
        || lower.contains("loading music")
        || lower.contains("sound engine started")
        || lower.contains("openal initialized")
        || lower.contains("finished loading")
}

/// Returns true if a repair write was performed.
fn repair_if_needed(
    instance_dir: &Path,
    options: &HashMap<String, String>,
    overlay: &HashMap<String, String>,
) -> bool {
    if options.is_empty() {
        return false;
    }
    if verify_minecraft_options_file(instance_dir, options) {
        return false;
    }
    let _ = merge_minecraft_options_file(instance_dir, options);
    if !overlay.is_empty() {
        let _ = merge_minecraft_debug_overlay_file(instance_dir, overlay);
    }
    true
}

#[allow(clippy::too_many_arguments)]
fn finalize_initial_settings_commit(
    instances: &InstanceStore,
    profile_id: &str,
    pending_commit: bool,
    running_since: Option<Instant>,
    instance_dir: &Path,
    options: &HashMap<String, String>,
    overlay: &HashMap<String, String>,
    verified_at_spawn: bool,
    title_seen: bool,
    clean_at_title: bool,
    rewrote_during_session: bool,
    exit_code: i32,
) {
    if !pending_commit {
        return;
    }
    let Some(running_since) = running_since else {
        tracing::info!(
            "Skip Minecraft initial settings commit for {profile_id} (never spawned)"
        );
        return;
    };
    let runtime_ms = running_since.elapsed().as_millis() as u64;
    let has_patch = !options.is_empty();

    if has_patch {
        let _ = merge_minecraft_options_file(instance_dir, options);
        if !overlay.is_empty() {
            let _ = merge_minecraft_debug_overlay_file(instance_dir, overlay);
        }
    }

    if !has_patch {
        let _ = instances.update(
            profile_id,
            &json!({
              "minecraftInitialSettingsApplied": true,
              "minecraftInitialSettingsApplyGeneration": APPLY_GEN,
              "pendingMinecraftOptions": {},
              "pendingMinecraftDebugOverlay": {}
            }),
        );
        tracing::info!(
            "Committed Minecraft initial settings for {profile_id} (empty patch, exit={exit_code})"
        );
        return;
    }

    let verify_at_exit = verify_minecraft_options_file(instance_dir, options);
    let can_commit = !rewrote_during_session
        && verified_at_spawn
        && verify_at_exit
        && (clean_at_title
            || (runtime_ms >= INITIAL_SETTINGS_COMMIT_MIN_RUNTIME_MS && title_seen)
            || (runtime_ms >= INITIAL_SETTINGS_COMMIT_MIN_RUNTIME_MS && !title_seen));

    if !can_commit {
        tracing::info!(
            "Defer Minecraft initial settings commit for {profile_id} (exit={exit_code}, title={title_seen}, clean={clean_at_title}, rewrote={rewrote_during_session}, runtimeMs={runtime_ms}, verifyAtExit={verify_at_exit})"
        );
        return;
    }

    let _ = instances.update(
        profile_id,
        &json!({
          "minecraftInitialSettingsApplied": true,
          "minecraftInitialSettingsApplyGeneration": APPLY_GEN,
          "pendingMinecraftOptions": {},
          "pendingMinecraftDebugOverlay": {}
        }),
    );
    tracing::info!(
        "Committed Minecraft initial settings for {profile_id} (exit={exit_code}, title={title_seen}, runtimeMs={runtime_ms})"
    );
}

fn spawn_log_watchers(
    stdout: Option<tokio::process::ChildStdout>,
    stderr: Option<tokio::process::ChildStderr>,
    title_seen: Arc<AtomicBool>,
) {
    if let Some(out) = stdout {
        let flag = Arc::clone(&title_seen);
        tokio::spawn(async move {
            let mut lines = BufReader::new(out).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if title_log_matches(&line) {
                    flag.store(true, Ordering::SeqCst);
                }
            }
        });
    }
    if let Some(err) = stderr {
        let flag = Arc::clone(&title_seen);
        tokio::spawn(async move {
            let mut lines = BufReader::new(err).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if title_log_matches(&line) {
                    flag.store(true, Ordering::SeqCst);
                }
            }
        });
    }
}

fn spawn_kill(child: Arc<AsyncMutex<GameProcess>>) {
    if let Ok(handle) = tokio::runtime::Handle::try_current() {
        handle.spawn(async move {
            let mut g = child.lock().await;
            let _ = g.kill().await;
        });
    } else {
        std::thread::spawn(move || {
            if let Ok(rt) = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
            {
                rt.block_on(async move {
                    let mut g = child.lock().await;
                    let _ = g.kill().await;
                });
            }
        });
    }
}

/// i18n キー（ドット区切り・空白なし）ならキーのみ。それ以外は generic + 詳細。
fn split_launch_error(err: &CoreError) -> (String, Option<String>) {
    let raw = err.to_string();
    let trimmed = raw.trim();
    if looks_like_message_key(trimmed) {
        return (trimmed.to_string(), None);
    }
    ("launch.error.generic".into(), Some(trimmed.to_string()))
}

fn looks_like_message_key(value: &str) -> bool {
    if value.is_empty() || value.contains(' ') || value.contains('\n') {
        return false;
    }
    let mut parts = value.split('.');
    let Some(first) = parts.next() else {
        return false;
    };
    if first.is_empty()
        || !first
            .chars()
            .next()
            .is_some_and(|c| c.is_ascii_alphabetic())
    {
        return false;
    }
    let mut count = 1usize;
    for part in parts {
        if part.is_empty() || !part.chars().all(|c| c.is_ascii_alphanumeric()) {
            return false;
        }
        count += 1;
    }
    count >= 2
}

fn game_exit_error_detail(instance_dir: &Path, exit_code: i32) -> String {
    let mut parts = vec![format!("exit code {exit_code}")];
    if let Some(snippet) = crash_snippet_from_latest_log(instance_dir) {
        parts.push(snippet);
    }
    parts.join("\n")
}

fn crash_snippet_from_latest_log(instance_dir: &Path) -> Option<String> {
    let text = std::fs::read_to_string(latest_log_path(instance_dir)).ok()?;
    if text.trim().is_empty() {
        return None;
    }
    const MARKERS: &[&str] = &[
        "---- Minecraft Crash Report ----",
        "Exception in thread",
        "Caused by:",
        "java.lang.",
        "Error occurred during initialization",
        "Could not find or load main class",
        "UnsupportedClassVersionError",
        "NoClassDefFoundError",
        "Mixin apply failed",
        "Incompatible mods found",
    ];
    let lines: Vec<&str> = text.lines().map(str::trim).filter(|l| !l.is_empty()).collect();
    let mut start = None;
    for (i, line) in lines.iter().enumerate().rev() {
        if MARKERS.iter().any(|m| line.contains(m)) {
            start = Some(i);
            break;
        }
    }
    let start = start.unwrap_or_else(|| lines.len().saturating_sub(8));
    let end = (start + 12).min(lines.len());
    let chunk = lines[start..end].join("\n");
    if chunk.is_empty() {
        return None;
    }
    const MAX: usize = 700;
    if chunk.len() > MAX {
        let mut cut = MAX;
        while cut > 0 && !chunk.is_char_boundary(cut) {
            cut -= 1;
        }
        Some(format!("{}…", &chunk[..cut]))
    } else {
        Some(chunk)
    }
}
