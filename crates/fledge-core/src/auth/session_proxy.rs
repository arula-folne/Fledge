use super::provider::AuthProvider;
use parking_lot::Mutex;
use std::sync::Arc;
use std::thread;
use tiny_http::{Header, Method, Request, Response, Server, StatusCode};

const MOJANG_SESSION: &str = "https://sessionserver.mojang.com";
const JOIN_PATH: &str = "/session/minecraft/join";

pub struct SessionJoinProxy {
    auth: Arc<AuthProvider>,
    base_url: Mutex<Option<String>>,
    stop: Mutex<Option<std::sync::mpsc::Sender<()>>>,
}

impl SessionJoinProxy {
    pub fn new(auth: Arc<AuthProvider>) -> Self {
        Self {
            auth,
            base_url: Mutex::new(None),
            stop: Mutex::new(None),
        }
    }

    pub fn url(&self) -> Option<String> {
        self.base_url.lock().clone()
    }

    pub fn ensure_started(&self) -> Result<String, String> {
        if let Some(url) = self.url() {
            return Ok(url);
        }
        let server = Server::http("127.0.0.1:0").map_err(|e| e.to_string())?;
        let addr = server.server_addr().to_ip().ok_or("bind failed")?;
        let base = format!("http://127.0.0.1:{}", addr.port());
        *self.base_url.lock() = Some(base.clone());

        let (tx, rx) = std::sync::mpsc::channel();
        *self.stop.lock() = Some(tx);
        let auth = Arc::clone(&self.auth);
        let base_for_log = base.clone();
        thread::spawn(move || {
            tracing::info!("Session join proxy listening on {base_for_log}");
            loop {
                if rx.try_recv().is_ok() {
                    break;
                }
                match server.recv_timeout(std::time::Duration::from_millis(200)) {
                    Ok(Some(req)) => {
                        if let Err(err) = handle_request(&auth, req) {
                            tracing::warn!("session proxy: {err}");
                        }
                    }
                    Ok(None) => {}
                    Err(_) => break,
                }
            }
        });
        Ok(base)
    }

    pub fn stop(&self) {
        if let Some(tx) = self.stop.lock().take() {
            let _ = tx.send(());
        }
        *self.base_url.lock() = None;
    }
}

fn handle_request(auth: &Arc<AuthProvider>, req: Request) -> Result<(), String> {
    let url = req.url().to_string();
    let path = url.split('?').next().unwrap_or("/");
    if *req.method() == Method::Post && path == JOIN_PATH {
        return handle_join(auth, req);
    }
    forward(req)
}

fn handle_join(auth: &Arc<AuthProvider>, mut req: Request) -> Result<(), String> {
    let mut body = String::new();
    req.as_reader()
        .read_to_string(&mut body)
        .map_err(|e| e.to_string())?;
    let mut payload: serde_json::Value =
        serde_json::from_str(&body).map_err(|e| e.to_string())?;
    let uuid = payload
        .get("selectedProfile")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    if !uuid.is_empty() {
        let normalized = uuid.replace('-', "").to_lowercase();
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|e| e.to_string())?;
        // Account id is the undashed profile uuid
        if let Ok(creds) = rt.block_on(auth.ensure_credentials(Some(&normalized))) {
            if let Some(token) = creds.get("accessToken").and_then(|v| v.as_str()) {
                payload
                    .as_object_mut()
                    .map(|o| o.insert("accessToken".into(), serde_json::json!(token)));
            }
        }
    }

    let client = reqwest::blocking::Client::new();
    let upstream = client
        .post(format!("{MOJANG_SESSION}{JOIN_PATH}"))
        .header("Content-Type", "application/json")
        .body(payload.to_string())
        .send()
        .map_err(|e| e.to_string())?;
    let status = upstream.status().as_u16();
    let bytes = upstream.bytes().map_err(|e| e.to_string())?;
    let response = Response::from_data(bytes).with_status_code(StatusCode(status));
    req.respond(response).map_err(|e| e.to_string())
}

fn forward(mut req: Request) -> Result<(), String> {
    let path = req.url().to_string();
    let method = req.method().as_str().to_string();
    let mut body = Vec::new();
    req.as_reader()
        .read_to_end(&mut body)
        .map_err(|e| e.to_string())?;
    let client = reqwest::blocking::Client::new();
    let url = format!("{MOJANG_SESSION}{path}");
    let builder = match method.as_str() {
        "GET" => client.get(&url),
        "POST" => client.post(&url).body(body),
        "PUT" => client.put(&url).body(body),
        "DELETE" => client.delete(&url),
        _ => client.get(&url),
    };
    let upstream = builder.send().map_err(|e| e.to_string())?;
    let status = upstream.status().as_u16();
    let content_type = upstream
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let bytes = upstream.bytes().map_err(|e| e.to_string())?;
    let mut response = Response::from_data(bytes).with_status_code(StatusCode(status));
    if let Some(ct) = content_type {
        if let Ok(h) = Header::from_bytes("Content-Type", ct) {
            response.add_header(h);
        }
    }
    req.respond(response).map_err(|e| e.to_string())
}
