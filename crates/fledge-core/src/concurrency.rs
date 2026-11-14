//! Network / disk concurrency gates.
//!
//! Background (Minecraft / Java bulk) and Interactive (content browse install) use
//! separate semaphore pools so Modrinth/folne installs and UI-driven downloads are
//! not starved while assets flood the network.
//! Pattern inspired by Modrinth App (Theseus) public architecture — no code copied.

use serde_json::Value;
use std::sync::Arc;
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

const DEFAULT_BG_FETCH: usize = 10;
const DEFAULT_BG_IO: usize = 10;
/// コンテンツ閲覧中の検索・UI を優先するため、対話 DL は控えめに
const DEFAULT_INTERACTIVE_FETCH: usize = 2;
/// 配置・展開などのディスク処理は直列寄りにして UI のカクつきを抑える
const DEFAULT_INTERACTIVE_IO: usize = 1;

/// Which workload class is requesting a permit.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GateClass {
    /// Minecraft libraries/assets and similar bulk transfers.
    Background,
    /// User-facing content / catalog downloads (Modrinth, folne, …).
    Interactive,
}

#[derive(Clone)]
pub struct ConcurrencyGate {
    bg_fetch: Arc<Semaphore>,
    bg_io: Arc<Semaphore>,
    interactive_fetch: Arc<Semaphore>,
    interactive_io: Arc<Semaphore>,
    max_bg_fetch: usize,
    max_bg_io: usize,
    max_interactive_fetch: usize,
    max_interactive_io: usize,
}

impl ConcurrencyGate {
    pub fn new(
        max_bg_fetch: usize,
        max_bg_io: usize,
        max_interactive_fetch: usize,
        max_interactive_io: usize,
    ) -> Arc<Self> {
        let max_bg_fetch = max_bg_fetch.max(1);
        let max_bg_io = max_bg_io.max(1);
        let max_interactive_fetch = max_interactive_fetch.max(1);
        let max_interactive_io = max_interactive_io.max(1);
        Arc::new(Self {
            bg_fetch: Arc::new(Semaphore::new(max_bg_fetch)),
            bg_io: Arc::new(Semaphore::new(max_bg_io)),
            interactive_fetch: Arc::new(Semaphore::new(max_interactive_fetch)),
            interactive_io: Arc::new(Semaphore::new(max_interactive_io)),
            max_bg_fetch,
            max_bg_io,
            max_interactive_fetch,
            max_interactive_io,
        })
    }

    pub fn from_settings(settings: &Value) -> Arc<Self> {
        let bg_fetch = settings
            .get("concurrentDownloads")
            .and_then(|v| v.as_u64())
            .unwrap_or(DEFAULT_BG_FETCH as u64) as usize;
        let bg_io = settings
            .get("maxWriteConcurrency")
            .and_then(|v| v.as_u64())
            .unwrap_or(DEFAULT_BG_IO as u64) as usize;
        // 対話用は固定枠。設定の同時 DL を食い尽くさない
        let interactive_fetch = settings
            .get("interactiveDownloadConcurrency")
            .and_then(|v| v.as_u64())
            .unwrap_or(DEFAULT_INTERACTIVE_FETCH as u64) as usize;
        let interactive_io = settings
            .get("interactiveWriteConcurrency")
            .and_then(|v| v.as_u64())
            .unwrap_or(DEFAULT_INTERACTIVE_IO as u64) as usize;
        Self::new(bg_fetch, bg_io, interactive_fetch, interactive_io)
    }

    /// Background fetch capacity (Minecraft file parallelism).
    pub fn max_fetch(&self) -> usize {
        self.max_bg_fetch
    }

    pub fn max_io(&self) -> usize {
        self.max_bg_io
    }

    pub fn max_interactive_fetch(&self) -> usize {
        self.max_interactive_fetch
    }

    pub fn max_interactive_io(&self) -> usize {
        self.max_interactive_io
    }

    pub async fn acquire_fetch(&self, class: GateClass) -> OwnedSemaphorePermit {
        let sem = match class {
            GateClass::Background => &self.bg_fetch,
            GateClass::Interactive => &self.interactive_fetch,
        };
        sem.clone()
            .acquire_owned()
            .await
            .expect("fetch semaphore is never closed")
    }

    pub async fn acquire_io(&self, class: GateClass) -> OwnedSemaphorePermit {
        let sem = match class {
            GateClass::Background => &self.bg_io,
            GateClass::Interactive => &self.interactive_io,
        };
        sem.clone()
            .acquire_owned()
            .await
            .expect("io semaphore is never closed")
    }
}
