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

    let mut builder = tauri::Builder::default();

    // 製品版のみ二重起動防止。開発ビルドは製品版の mutex / 識別子と被らないよう外す
    // （`pnpm dev` は tauri.dev.conf.json で identifier も分離する）。
    #[cfg(all(desktop, not(debug_assertions)))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // 更新後の再起動（--updated）が古いプロセスに吸われると新版が起動しない。
            // その場合は既存側を終了し、待機スクリプトのリトライ起動に道を開ける。
            let is_update_relaunch = args.iter().any(|a| a == "--updated");
            if is_update_relaunch {
                app.exit(0);
                return;
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }));
    }

    builder
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
            let state_for_launch_ui = Arc::clone(&state);
            state.events.on_launch_state(move |payload| {
                state_for_launch_ui.sync_discord_from_launch_state(&payload);
                let _ = app_handle.emit("event:launch-state", payload.clone());

                let launch_state = payload.get("state").and_then(|v| v.as_str()).unwrap_or("");
                let Ok(settings) = state_for_launch_ui.settings.get() else {
                    return;
                };
                let Some(window) = app_handle.get_webview_window("main") else {
                    return;
                };

                if launch_state == "running"
                    && settings
                        .get("minimizeOnLaunch")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false)
                {
                    let _ = window.minimize();
                    return;
                }

                if !matches!(launch_state, "exited" | "error") {
                    return;
                }
                if !settings
                    .get("focusOnGameExit")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false)
                {
                    return;
                }

                // emit 時点では当該セッションがまだ map に残ることがあるので、自分以外の busy を見る
                let session_id = payload.get("sessionId").and_then(|v| v.as_str());
                let other_busy = state_for_launch_ui.launch.list_sessions().iter().any(|s| {
                    let id = s.get("sessionId").and_then(|v| v.as_str());
                    let state = s.get("state").and_then(|v| v.as_str());
                    id != session_id
                        && matches!(state, Some("preparing" | "launching" | "running"))
                });
                if other_busy {
                    return;
                }

                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            });

            let app_handle = app.handle().clone();
            state.events.on_news_updated(move |payload| {
                let _ = app_handle.emit("event:news-updated", payload);
            });

            // Manage state before touching the webview — chrome must not block setup.
            let state_for_chrome = Arc::clone(&state);
            app.manage(state);

            if let Some(main) = app.get_webview_window("main") {
                if cfg!(debug_assertions) {
                    let _ = main.set_title("Fledge (開発)");
                }
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
