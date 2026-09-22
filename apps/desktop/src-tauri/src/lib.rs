mod commands;
mod login_window;
mod window_chrome;

use fledge_core::AppState;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // 製品版: 同梱 resources/skins を SkinStore が見つけられるようにする
            if let Ok(resource_dir) = app.path().resource_dir() {
                let skins = resource_dir.join("skins");
                if skins.is_dir() {
                    std::env::set_var("FLEDGE_SKINS_DIR", &skins);
                }
            }
            let dev_root = if cfg!(debug_assertions) {
                let mut root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
                root.pop();
                Some(root.join(".fledge-root"))
            } else {
                None
            };
            let state = AppState::bootstrap(dev_root.as_deref())
                .map_err(|e| -> Box<dyn std::error::Error> { e.to_string().into() })?;

            let app_handle = app.handle().clone();
            state.auth.on_status_change(move |status, account| {
                let payload = AppState::auth_status_payload(status, account);
                let _ = app_handle.emit("event:auth-status", payload);
            });

            // リスナー登録後に現在のセッションを UI へ通知（再起動後のログイン維持）
            if let Ok((account, status)) = state.auth.get_session() {
                let payload = AppState::auth_status_payload(status, account);
                let _ = app.handle().emit("event:auth-status", payload);
            }

            let app_handle = app.handle().clone();
            state.events.on_progress(move |payload| {
                let _ = app_handle.emit("event:progress", payload);
            });
            let app_handle = app.handle().clone();
            state.events.on_launch_phase(move |payload| {
                let _ = app_handle.emit("event:launch-phase", payload);
            });
            let app_handle = app.handle().clone();
            let state_for_discord = Arc::clone(&state);
            state.events.on_launch_state(move |payload| {
                state_for_discord.sync_discord_from_launch_state(&payload);
                let _ = app_handle.emit("event:launch-state", payload);
            });

            let app_handle = app.handle().clone();
            state.events.on_news_updated(move |payload| {
                let _ = app_handle.emit("event:news-updated", payload);
            });

            // Manage state before touching the webview — chrome must not block setup.
            let state_for_chrome = Arc::clone(&state);
            app.manage(state);

            if let Some(main) = app.get_webview_window("main") {
                // Defer size/zoom until the webview has spun up. Calling set_zoom /
                // with_webview synchronously in setup has frozen a blank window on
                // first launch right after WebView2 install.
                let main_for_chrome = main.clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                    if let Ok(settings) = state_for_chrome.settings.get() {
                        crate::window_chrome::apply_launcher_window_size(
                            &main_for_chrome,
                            &settings,
                        );
                    }
                    crate::window_chrome::attach_window_size_sync(
                        &main_for_chrome,
                        Arc::clone(&state_for_chrome),
                    );
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![commands::fledge_invoke])
        .run(tauri::generate_context!())
        .expect("error while running Fledge");
}

pub type SharedState = Arc<AppState>;
