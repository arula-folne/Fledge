//! Apply launcher window chrome from settings (size / UI zoom).

use fledge_core::AppState;
use serde_json::Value;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tauri::{Emitter, LogicalSize, Size, WebviewWindow};

/// Last applied UI zoom (f64 bits). Avoids re-calling set_zoom on every resize.
static LAST_UI_ZOOM_BITS: AtomicU64 = AtomicU64::new(0);

const LAUNCHER_WINDOW_MIN_WIDTH: f64 = 960.0;
const LAUNCHER_WINDOW_MIN_HEIGHT: f64 = 540.0;
const LAUNCHER_WINDOW_MAX_WIDTH: f64 = 7680.0;
const LAUNCHER_WINDOW_MAX_HEIGHT: f64 = 4320.0;

fn clamp(n: f64, min: f64, max: f64) -> f64 {
    n.max(min).min(max)
}

/// ノーマル（表示倍率 1.0）の物理基準。実際の zoom = UI_SCALE_BASE × 表示倍率
const UI_SCALE_BASE: f64 = 0.925;

fn ui_scale_display_factor(scale: &str) -> f64 {
    // 基準サイズに対する倍率（ノーマル＝1.0）
    match scale {
        "compact" | "minimal" => 0.85,
        "large" => 1.1,
        "wide" => 1.25,
        _ => 1.0, // normal
    }
}

fn zoom_cap_for_window_size(width: f64, height: f64) -> f64 {
    if height <= 560.0 || width <= 1000.0 {
        0.78
    } else {
        f64::INFINITY
    }
}

pub fn resolve_window_zoom_factor(scale: &str, width: f64, height: f64) -> f64 {
    let zoom = UI_SCALE_BASE * ui_scale_display_factor(scale);
    let capped = zoom.min(zoom_cap_for_window_size(width, height));
    (capped * 1000.0).round() / 1000.0
}

fn read_logical_size(window: &WebviewWindow) -> Option<(i64, i64)> {
    if window.is_fullscreen().unwrap_or(false) || window.is_maximized().unwrap_or(false) {
        return None;
    }
    let physical = window.inner_size().ok()?;
    let scale = window.scale_factor().unwrap_or(1.0);
    let width = clamp(
        (physical.width as f64 / scale).round(),
        LAUNCHER_WINDOW_MIN_WIDTH,
        LAUNCHER_WINDOW_MAX_WIDTH,
    ) as i64;
    let height = clamp(
        (physical.height as f64 / scale).round(),
        LAUNCHER_WINDOW_MIN_HEIGHT,
        LAUNCHER_WINDOW_MAX_HEIGHT,
    ) as i64;
    Some((width, height))
}

/// Resize the launcher window from settings (no-op while maximized/fullscreen).
pub fn apply_launcher_window_size(window: &WebviewWindow, settings: &Value) {
    if window.is_fullscreen().unwrap_or(false) || window.is_maximized().unwrap_or(false) {
        return;
    }
    let width = clamp(
        settings
            .get("launcherWindowWidth")
            .and_then(|v| v.as_f64())
            .unwrap_or(1280.0),
        LAUNCHER_WINDOW_MIN_WIDTH,
        LAUNCHER_WINDOW_MAX_WIDTH,
    );
    let height = clamp(
        settings
            .get("launcherWindowHeight")
            .and_then(|v| v.as_f64())
            .unwrap_or(720.0),
        LAUNCHER_WINDOW_MIN_HEIGHT,
        LAUNCHER_WINDOW_MAX_HEIGHT,
    );

    if let Ok(current) = window.inner_size() {
        // Compare in physical pixels via scale factor
        let scale = window.scale_factor().unwrap_or(1.0);
        let cur_w = (current.width as f64 / scale).round() as u32;
        let cur_h = (current.height as f64 / scale).round() as u32;
        if cur_w == width as u32 && cur_h == height as u32 {
            apply_window_ui_scale(window, settings);
            return;
        }
    }

    let _ = window.set_size(Size::Logical(LogicalSize::new(width, height)));
    apply_window_ui_scale(window, settings);
}

pub fn apply_window_ui_scale(window: &WebviewWindow, settings: &Value) {
    let scale = settings
        .get("uiScale")
        .and_then(|v| v.as_str())
        .unwrap_or("normal");
    let size = window
        .inner_size()
        .ok()
        .map(|s| {
            let factor = window.scale_factor().unwrap_or(1.0);
            (s.width as f64 / factor, s.height as f64 / factor)
        })
        .unwrap_or((1280.0, 720.0));
    let zoom = resolve_window_zoom_factor(scale, size.0, size.1);
    let bits = zoom.to_bits();
    let prev = LAST_UI_ZOOM_BITS.load(Ordering::Relaxed);
    if prev != 0 && (f64::from_bits(prev) - zoom).abs() < 0.005 {
        return;
    }
    LAST_UI_ZOOM_BITS.store(bits, Ordering::Relaxed);
    let _ = window.set_zoom(zoom);
}

/// Hide Chromium/WebView2 viewport WxH overlay (top-right) while resizing.
fn suppress_viewport_size_overlay(window: &WebviewWindow) {
    #[cfg(windows)]
    {
        let _ = window.with_webview(|platform| {
            use webview2_com::CallDevToolsProtocolMethodCompletedHandler;
            use windows::core::w;

            unsafe {
                let Ok(core) = platform.controller().CoreWebView2() else {
                    return;
                };
                let handler = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(
                    |_hr, _json| Ok(()),
                ));
                let _ = core.CallDevToolsProtocolMethod(
                    w!("Overlay.setShowViewportSizeOnResize"),
                    w!("{\"show\":false}"),
                    &handler,
                );
            }
        });
    }
    #[cfg(not(windows))]
    {
        let _ = window;
    }
}

pub fn settings_patch_touches_window(partial: &Value) -> bool {
    partial.get("launcherWindowWidth").is_some()
        || partial.get("launcherWindowHeight").is_some()
        || partial.get("uiScale").is_some()
}

/// Persist launcher window size after user edge-resize and notify the UI.
pub fn attach_window_size_sync(window: &WebviewWindow, state: Arc<AppState>) {
    suppress_viewport_size_overlay(window);

    let win = window.clone();
    let gen = Arc::new(AtomicU64::new(0));
    let suppress_gen = Arc::new(AtomicU64::new(0));
    window.on_window_event(move |event| {
        let tauri::WindowEvent::Resized(_) = event else {
            return;
        };
        let Some((width, height)) = read_logical_size(&win) else {
            return;
        };

        // リサイズ中の右上 WxH オーバーレイを抑止（スロットル）
        let suppress_token = suppress_gen.fetch_add(1, Ordering::Relaxed).wrapping_add(1);
        let win_suppress = win.clone();
        let suppress_gen2 = Arc::clone(&suppress_gen);
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
            if suppress_gen2.load(Ordering::Relaxed) != suppress_token {
                return;
            }
            suppress_viewport_size_overlay(&win_suppress);
        });

        let _ = win.emit(
            "event:window-size",
            serde_json::json!({ "width": width, "height": height }),
        );

        let token = gen.fetch_add(1, Ordering::Relaxed).wrapping_add(1);
        let win2 = win.clone();
        let state2 = Arc::clone(&state);
        let gen2 = Arc::clone(&gen);
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(350)).await;
            if gen2.load(Ordering::Relaxed) != token {
                return;
            }
            let Some((width, height)) = read_logical_size(&win2) else {
                return;
            };
            suppress_viewport_size_overlay(&win2);
            let patch = serde_json::json!({
                "launcherWindowWidth": width,
                "launcherWindowHeight": height,
            });
            if let Ok(next) = state2.settings.set(patch) {
                apply_window_ui_scale(&win2, &next);
            }
        });
    });
}
