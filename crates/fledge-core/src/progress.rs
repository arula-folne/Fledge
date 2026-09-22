use parking_lot::Mutex;
use serde::Serialize;
use serde_json::{json, Value};
use std::sync::Arc;

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
        let value = serde_json::to_value(&event).unwrap_or(json!({}));
        for listener in self.progress.lock().iter() {
            listener(value.clone());
        }
    }

    pub fn emit_launch_phase(&self, payload: Value) {
        for listener in self.launch_phase.lock().iter() {
            listener(payload.clone());
        }
    }

    pub fn emit_launch_state(&self, payload: Value) {
        for listener in self.launch_state.lock().iter() {
            listener(payload.clone());
        }
    }

    pub fn emit_news_updated(&self, payload: Value) {
        for listener in self.news_updated.lock().iter() {
            listener(payload.clone());
        }
    }
}
