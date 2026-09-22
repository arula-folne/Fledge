use fledge_core::{auth_authorize_url, extract_code_from_url, MSA_REDIRECT_URI};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::oneshot;

/// Open a dedicated WebView for Microsoft OAuth and capture the auth code.
pub async fn capture_microsoft_auth_code(
    app: &AppHandle,
    client_id: &str,
) -> Result<String, String> {
    let url = auth_authorize_url(client_id);
    let (tx, rx) = oneshot::channel::<Result<String, String>>();
    let tx = Arc::new(Mutex::new(Some(tx)));
    let label = format!("msa-login-{}", std::process::id());

    // Close any leftover login window
    if let Some(existing) = app.get_webview_window("msa-login") {
        let _ = existing.close();
    }

    let tx_nav = Arc::clone(&tx);
    let redirect = MSA_REDIRECT_URI.to_string();
    let win = WebviewWindowBuilder::new(
        app,
        "msa-login",
        WebviewUrl::External(url.parse().map_err(|e: url::ParseError| e.to_string())?),
    )
    .title("Fledge - Microsoft アカウント")
    .inner_size(520.0, 700.0)
    .resizable(true)
    .center()
    .on_navigation(move |nav_url| {
        let raw = nav_url.as_str().to_string();
        if raw.starts_with(&redirect) {
            let code = extract_code_from_url(&raw);
            if let Ok(mut guard) = tx_nav.lock() {
                if let Some(sender) = guard.take() {
                    let _ = sender.send(match code {
                        Some(c) => Ok(c),
                        None => Err("error.auth.microsoft".into()),
                    });
                }
            }
            return false;
        }
        true
    })
    .build()
    .map_err(|e| e.to_string())?;

    let tx_close = Arc::clone(&tx);
    win.on_window_event(move |event| {
        if let tauri::WindowEvent::Destroyed = event {
            if let Ok(mut guard) = tx_close.lock() {
                if let Some(sender) = guard.take() {
                    let _ = sender.send(Err("error.gui.closed".into()));
                }
            }
        }
    });

    let result = rx.await.map_err(|_| "error.gui.closed".to_string())?;
    let _ = win.close();
    let _ = label;
    result
}
