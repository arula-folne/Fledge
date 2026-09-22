//! Fledge launcher core — path layout, settings, and domain services.

mod app;
mod auth;
mod content;
mod custom_root;
mod download;
mod discord;
mod error;
mod factory_reset;
mod instances;
mod java;
mod launch;
mod minecraft;
mod news;
mod paths;
mod progress;
mod settings;
mod settings_options_flg;
mod skins;
mod updater;
mod versions;

pub use app::AppState;
pub use auth::{
    auth_authorize_url, extract_code_from_url, AccountView, AuthProvider, AuthStatus,
    SessionJoinProxy, TokenVault, DEFAULT_MSA_CLIENT_ID, MSA_REDIRECT_URI,
};
pub use content::ContentService;
pub use custom_root::CustomRootState;
pub use discord::{DiscordPresence, PresencePhase};
pub use error::{CoreError, CoreResult};
pub use factory_reset::factory_reset;
pub use instances::{CreateDefaults, InstanceStore};
pub use java::{JavaManager, JavaRuntimeView, JavaVerifyResult, JAVA_MANAGED_MAJORS};
pub use launch::LaunchOrchestrator;
pub use minecraft::MinecraftService;
pub use news::NewsService;
pub use paths::{ensure_path_layout, resolve_path_layout, PathLayout};
pub use progress::{EventBus, ProgressEvent};
pub use settings::SettingsStore;
pub use settings_options_flg::{
    build_options_flg_text, parse_options_flg_text, read_and_import_options_flg_file,
    write_options_flg_file,
};
pub use skins::{
    decode_thumb_data_url, fetch_active_minecraft_skin, hash_skin_png, SkinApplier, SkinStore,
};
pub use updater::{
    find_uninstaller, open_apps_and_features, resolve_install_root, schedule_complete_uninstall,
    UpdaterService, APP_VERSION,
};
pub use versions::{LoaderVersionListResult, VersionListResult, VersionService};
