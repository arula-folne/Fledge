use parking_lot::Mutex;
use serde::Serialize;
use serde_json::{json, Value};
use std::sync::Arc;
use std::time::{Duration, Instant};

pub type ProgressListener = Arc<dyn Fn(Value) + Send + Sync>;
pub type LaunchPhaseListener = Arc<dyn Fn(Value) + Send + Sync>;
pub type LaunchStateListener = Arc<dyn Fn(Value) + Send + Sync>;
pub type NewsUpdatedListener = Arc<dyn Fn(Value) + Send + Sync>;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressEvent {
    pub scope: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub job_id: Option<String>,
    pub current: f64,
    pub total: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub percent: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bytes_per_second: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meta: Option<Value>,
}

#[derive(Default)]
pub struct EventBus {
    progress: Mutex<Vec<ProgressListener>>,
    launch_phase: Mutex<Vec<LaunchPhaseListener>>,
    launch_state: Mutex<Vec<LaunchStateListener>>,
    news_updated: Mutex<Vec<NewsUpdatedListener>>,
    /// Per-job last emit time for coarse backend throttling.
    last_progress_emit: Mutex<std::collections::HashMap<String, Instant>>,
}

impl EventBus {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn on_progress<F>(&self, listener: F)
    where
        F: Fn(Value) + Send + Sync + 'static,
    {
        self.progress.lock().push(Arc::new(listener));
    }

    pub fn on_launch_phase<F>(&self, listener: F)
    where
        F: Fn(Value) + Send + Sync + 'static,
    {
        self.launch_phase.lock().push(Arc::new(listener));
    }

    pub fn on_launch_state<F>(&self, listener: F)
    where
        F: Fn(Value) + Send + Sync + 'static,
    {
        self.launch_state.lock().push(Arc::new(listener));
    }

    pub fn on_news_updated<F>(&self, listener: F)
    where
        F: Fn(Value) + Send + Sync + 'static,
    {
        self.news_updated.lock().push(Arc::new(listener));
    }

    pub fn emit_progress(&self, event: ProgressEvent) {
        let status = event.status.as_deref();
        let terminal = matches!(
            status,
            Some("completed") | Some("failed") | Some("cancelled") | Some("succeeded")
        );
        let lifecycle = terminal || matches!(status, Some("queued"));
        let key = event
            .job_id
            .clone()
            .or_else(|| event.session_id.clone())
            .unwrap_or_else(|| format!("{}:{}", event.scope, event.kind.as_deref().unwrap_or("")));

        // Throttle only in-flight percent ticks; queued / completed always emit.
        if !lifecycle {
            let mut last = self.last_progress_emit.lock();
            if let Some(prev) = last.get(&key) {
                // UI は整数%ゲート前提。IPC 洪水を抑えるため少し長めに間引く
                if prev.elapsed() < Duration::from_millis(280) {
                    return;
                }
            }
            last.insert(key.clone(), Instant::now());
        } else if terminal {
            self.last_progress_emit.lock().remove(&key);
        }

        let value = serde_json::to_value(&event).unwrap_or(json!({}));
        // Clone listeners then release lock before calling — avoid blocking emitters.
        let listeners = self.progress.lock().clone();
        for listener in listeners {
            listener(value.clone());
        }
    }

    pub fn emit_launch_phase(&self, payload: Value) {
        let listeners = self.launch_phase.lock().clone();
        for listener in listeners {
            listener(payload.clone());
        }
    }

    pub fn emit_launch_state(&self, payload: Value) {
        let listeners = self.launch_state.lock().clone();
        for listener in listeners {
            listener(payload.clone());
        }
    }

    pub fn emit_news_updated(&self, payload: Value) {
        let listeners = self.news_updated.lock().clone();
        for listener in listeners {
            listener(payload.clone());
        }
    }
}
