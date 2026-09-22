use crate::auth::{AuthProvider, AuthStatus, SessionJoinProxy, TokenVault};
use crate::content::ContentService;
use crate::custom_root::CustomRootState;
use crate::discord::{DiscordPresence, PresencePhase};
use crate::error::CoreResult;
use crate::instances::InstanceStore;
use crate::java::JavaManager;
use crate::launch::LaunchOrchestrator;
use crate::minecraft::MinecraftService;
use crate::news::NewsService;
use crate::paths::{
    default_config_root, default_settings_root, ensure_path_layout, resolve_path_layout, PathLayout,
};
use crate::progress::EventBus;
use crate::settings::SettingsStore;
use crate::skins::{SkinApplier, SkinStore};
use crate::updater::UpdaterService;
use crate::versions::VersionService;
use parking_lot::Mutex;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::Arc;

pub struct AppState {
    pub layout: PathLayout,
    pub settings: Arc<SettingsStore>,
    pub instances: Arc<InstanceStore>,
    pub settings_root: PathBuf,
    pub config_root: PathBuf,
    pub is_dev: bool,
    pub custom_root: Mutex<CustomRootState>,
    pub default_config_root: PathBuf,
    pub auth: Arc<AuthProvider>,
    pub session_proxy: Arc<SessionJoinProxy>,
    pub events: Arc<EventBus>,
    pub java: Arc<JavaManager>,
    pub versions: Arc<VersionService>,
    pub minecraft: Arc<MinecraftService>,
    pub launch: Arc<LaunchOrchestrator>,
    pub content: Arc<ContentService>,
    pub skins: Arc<SkinStore>,
    pub skin_applier: Arc<SkinApplier>,
    pub news: Arc<NewsService>,
    pub updater: Arc<UpdaterService>,
    pub discord: Arc<DiscordPresence>,
}

impl AppState {
    pub fn bootstrap(dev_root: Option<&Path>) -> CoreResult<Arc<Self>> {
        let is_dev = dev_root.is_some() || std::env::var_os("FLEDGE_DEV").is_some();
        let settings_root = default_settings_root(dev_root);
        let default_config = default_config_root(dev_root);
        let custom = CustomRootState::resolve(&settings_root, &default_config);
        let config_root = custom.active_config_root.clone();
        let layout = resolve_path_layout(&config_root, &settings_root);
        ensure_path_layout(&layout)?;

        let settings = Arc::new(SettingsStore::new(layout.clone()));
        let instances = Arc::new(InstanceStore::new(layout.clone()));
        let settings_value = settings.get()?;
        let msa = settings_value
            .get("msaClientId")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let vault = TokenVault::new(&layout.accounts);
        let auth = Arc::new(AuthProvider::new(vault));
        auth.set_client_id(msa.as_deref());
        let _ = auth.hydrate_from_vault();
        let session_proxy = Arc::new(SessionJoinProxy::new(Arc::clone(&auth)));
        let events = Arc::new(EventBus::new());
        let java = Arc::new(JavaManager::new(layout.clone(), Arc::clone(&events)));
        let versions = Arc::new(VersionService::new(&layout));
        let minecraft = Arc::new(MinecraftService::new(
            layout.clone(),
            Arc::clone(&events),
        ));
        let launch = Arc::new(LaunchOrchestrator::new(
            Arc::clone(&auth),
            Arc::clone(&session_proxy),
            Arc::clone(&java),
            Arc::clone(&minecraft),
            Arc::clone(&events),
            Arc::clone(&instances),
            Arc::clone(&settings),
        ));

        let default_skins_dir = resolve_default_skins_dir(dev_root);
        let skins = Arc::new(SkinStore::new(layout.clone(), default_skins_dir));
        let skin_applier = Arc::new(SkinApplier::new(Arc::clone(&skins), Arc::clone(&auth)));
        let content = Arc::new(ContentService::new(
            Arc::clone(&instances),
            Arc::clone(&settings),
            Arc::clone(&versions),
            Arc::clone(&events),
        ));
        let news = Arc::new(NewsService::new(layout.clone(), Arc::clone(&events)));
        let updater = Arc::new(UpdaterService::new(
            layout.clone(),
            Arc::clone(&settings),
            Arc::clone(&events),
        ));
        let discord = Arc::new(DiscordPresence::new());
        if settings_value
            .get("discordRichPresence")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
        {
            discord.set_enabled(true);
        }

        Ok(Arc::new(Self {
            layout,
            settings,
            instances,
            settings_root,
            config_root,
            is_dev,
            custom_root: Mutex::new(custom),
            default_config_root: default_config,
            auth,
            session_proxy,
            events,
            java,
            versions,
            minecraft,
            launch,
            content,
            skins,
            skin_applier,
            news,
            updater,
            discord,
        }))
    }

    /// Sync Discord Rich Presence from a launch-state event payload.
    pub fn sync_discord_from_launch_state(&self, payload: &Value) {
        let state = payload
            .get("state")
            .and_then(|v| v.as_str())
            .unwrap_or("idle");
        let Some(phase) = PresencePhase::from_launch_state(state) else {
            return;
        };

        if matches!(
            phase,
            PresencePhase::Preparing | PresencePhase::Launching | PresencePhase::Running
        ) {
            let profile_id = payload
                .get("profileId")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .or_else(|| {
                    self.settings
                        .get()
                        .ok()
                        .and_then(|s| {
                            s.get("selectedInstanceId")
                                .and_then(|v| v.as_str())
                                .map(|x| x.to_string())
                        })
                });
            let instance_name = profile_id.and_then(|id| {
                self.instances
                    .get(&id)
                    .ok()
                    .flatten()
                    .and_then(|p| p.get("name").and_then(|v| v.as_str()).map(|s| s.to_string()))
            });
            self.discord.set_context(phase, instance_name);
            return;
        }

        // idle / exited / error — fall back to another busy session if any
        let busy = self.launch.list_sessions();
        if let Some(session) = busy.iter().find(|s| {
            matches!(
                s.get("state").and_then(|v| v.as_str()),
                Some("preparing" | "launching" | "running")
            )
        }) {
            let phase = session
                .get("state")
                .and_then(|v| v.as_str())
                .and_then(PresencePhase::from_launch_state)
                .unwrap_or(PresencePhase::Idle);
            let instance_name = session
                .get("profileId")
                .and_then(|v| v.as_str())
                .and_then(|id| {
                    self.instances
                        .get(id)
                        .ok()
                        .flatten()
                        .and_then(|p| p.get("name").and_then(|v| v.as_str()).map(|s| s.to_string()))
                });
            self.discord.set_context(phase, instance_name);
            return;
        }

        self.discord.set_context(PresencePhase::Idle, None);
    }
    pub fn path_info(&self) -> Value {
        serde_json::to_value(&self.layout).unwrap_or(json!({}))
    }

    pub fn app_directory_info(&self) -> Value {
        self.custom_root.lock().info_json(false)
    }

    pub fn set_app_directory(&self, next: Option<&str>) -> CoreResult<Value> {
        self.custom_root.lock().set_directory(next)
    }

    pub fn startup_info(&self) -> Value {
        json!({
          "isUpdatedStart": false,
          "isPostInstallStart": false,
          "updateNotice": null
        })
    }

    pub fn factory_reset(&self) -> CoreResult<()> {
        self.session_proxy.stop();
        self.discord.destroy();
        let _ = self.auth.vault().clear();
        let _ = self.versions.clear_cache();
        crate::factory_reset::factory_reset(&self.layout, &self.settings_root, &self.config_root)?;
        self.settings.clear_cache();
        Ok(())
    }

    pub fn string_list_from_settings(&self, key: &str) -> Vec<String> {
        self.settings
            .get()
            .ok()
            .and_then(|s| s.get(key).cloned())
            .and_then(|v| v.as_array().cloned())
            .map(|arr| {
                arr.into_iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default()
    }

    pub fn auth_status_payload(status: AuthStatus, account: Option<crate::auth::AccountView>) -> Value {
        let mut obj = json!({ "status": status.as_str() });
        if let Some(account) = account {
            obj.as_object_mut()
                .unwrap()
                .insert("account".into(), serde_json::to_value(account).unwrap_or(Value::Null));
        }
        obj
    }
}

fn resolve_default_skins_dir(dev_root: Option<&Path>) -> Option<PathBuf> {
    if let Ok(env) = std::env::var("FLEDGE_SKINS_DIR") {
        let p = PathBuf::from(env);
        if p.is_dir() {
            return Some(p);
        }
    }
    if let Some(dev) = dev_root {
        // apps/desktop/.fledge-root → apps/desktop/resources/skins
        let candidate = dev
            .parent()
            .map(|p| p.join("resources").join("skins"))
            .unwrap_or_else(|| PathBuf::from("resources/skins"));
        if candidate.is_dir() {
            return Some(candidate);
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            for candidate in [
                parent.join("skins"),
                parent.join("resources").join("skins"),
            ] {
                if candidate.is_dir() {
                    return Some(candidate);
                }
            }
        }
    }
    None
}
