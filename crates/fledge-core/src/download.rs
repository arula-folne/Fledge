//! Shared HTTP download helper with connection reuse and optional SHA-1 verification.

use crate::concurrency::{ConcurrencyGate, GateClass};
use crate::error::{CoreError, CoreResult};
use sha1::{Digest, Sha1};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use tokio::io::AsyncWriteExt;

fn minecraft_http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent("Fledge (minecraft-download)")
            .pool_max_idle_per_host(64)
            .pool_idle_timeout(Duration::from_secs(90))
            .tcp_keepalive(Some(Duration::from_secs(30)))
            .tcp_nodelay(true)
            .connect_timeout(Duration::from_secs(15))
            .timeout(Duration::from_secs(180))
            .build()
            .expect("reqwest Client")
    })
}

/// Shared client for content / Java / misc downloads (connection reuse).
pub fn content_http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent("Fledge/0.6 (content-download)")
            .pool_max_idle_per_host(32)
            .pool_idle_timeout(Duration::from_secs(90))
            .tcp_keepalive(Some(Duration::from_secs(30)))
            .tcp_nodelay(true)
            .connect_timeout(Duration::from_secs(20))
            .timeout(Duration::from_secs(600))
            .build()
            .expect("reqwest content Client")
    })
}

fn http_client() -> &'static reqwest::Client {
    minecraft_http_client()
}

/// Download `url` to `dest`. Creates parent directories.
/// Skips the network fetch when the file already exists and matches `expected_sha1`
/// (or `expected_size` when provided — preferred for large asset trees).
#[allow(dead_code)]
pub async fn download_to_file(
    url: &str,
    dest: &Path,
    expected_sha1: Option<&str>,
) -> CoreResult<()> {
    download_to_file_ex(url, dest, expected_sha1, None, None).await
}

pub async fn download_to_file_gated(
    url: &str,
    dest: &Path,
    expected_sha1: Option<&str>,
    expected_size: Option<u64>,
    gate: Option<&Arc<ConcurrencyGate>>,
) -> CoreResult<()> {
    download_to_file_ex(url, dest, expected_sha1, expected_size, gate).await
}

pub async fn download_to_file_ex(
    url: &str,
    dest: &Path,
    expected_sha1: Option<&str>,
    expected_size: Option<u64>,
    gate: Option<&Arc<ConcurrencyGate>>,
) -> CoreResult<()> {
    let dest_buf = dest.to_path_buf();
    let expected_sha1_owned = expected_sha1.map(|s| s.to_ascii_lowercase());
    let skip = {
        let dest_check = dest_buf.clone();
        let sha = expected_sha1_owned.clone();
        let size = expected_size;
        let io_permit = match gate {
            Some(g) => Some(g.acquire_io(GateClass::Background).await),
            None => None,
        };
        let result = tokio::task::spawn_blocking(move || -> CoreResult<bool> {
            if !dest_check.is_file() {
                return Ok(false);
            }
            if let Some(size) = size {
                return Ok(std::fs::metadata(&dest_check)
                    .map(|m| m.len() == size)
                    .unwrap_or(false));
            }
            if let Some(expected) = sha {
                return Ok(file_sha1(&dest_check)? == expected);
            }
            Ok(true)
        })
        .await
        .map_err(|e| CoreError::msg(e.to_string()))??;
        drop(io_permit);
        result
    };
    if skip {
        return Ok(());
    }

    {
        let parent = dest_buf.parent().map(|p| p.to_path_buf());
        let io_permit = match gate {
            Some(g) => Some(g.acquire_io(GateClass::Background).await),
            None => None,
        };
        if let Some(parent) = parent {
            tokio::task::spawn_blocking(move || std::fs::create_dir_all(parent))
                .await
                .map_err(|e| CoreError::msg(e.to_string()))??;
        }
        drop(io_permit);
    }

    let _fetch_permit = match gate {
        Some(g) => Some(g.acquire_fetch(GateClass::Background).await),
        None => None,
    };

    let response = http_client()
        .get(url)
        .send()
        .await
        .map_err(|e| CoreError::msg(e.to_string()))?
        .error_for_status()
        .map_err(|e| CoreError::msg(e.to_string()))?;

    let bytes = response
        .bytes()
        .await
        .map_err(|e| CoreError::msg(e.to_string()))?;

    if let Some(expected) = expected_sha1_owned.as_deref() {
        let mut hasher = Sha1::new();
        hasher.update(&bytes);
        let digest = hex::encode(hasher.finalize());
        if digest != expected {
            return Err(CoreError::msg(format!(
                "SHA-1 mismatch for {}: expected {expected}, got {digest}",
                dest.display()
            )));
        }
    }

    if let Some(size) = expected_size {
        if bytes.len() as u64 != size {
            return Err(CoreError::msg(format!(
                "Size mismatch for {}: expected {size}, got {}",
                dest.display(),
                bytes.len()
            )));
        }
    }

    let tmp = dest.with_extension("download-part");
    let dest_final = dest_buf.clone();
    let tmp_buf = tmp.clone();
    let io_permit = match gate {
        Some(g) => Some(g.acquire_io(GateClass::Background).await),
        None => None,
    };
    tokio::task::spawn_blocking(move || write_bytes_atomic(&tmp_buf, &dest_final, &bytes))
        .await
        .map_err(|e| CoreError::msg(e.to_string()))??;
    drop(io_permit);

    Ok(())
}

fn write_bytes_atomic(tmp: &Path, dest: &Path, bytes: &[u8]) -> CoreResult<()> {
    let mut file = std::fs::File::create(tmp)?;
    file.write_all(bytes)?;
    file.flush()?;
    drop(file);
    if dest.exists() {
        let _ = std::fs::remove_file(dest);
    }
    std::fs::rename(tmp, dest).or_else(|_| {
        std::fs::copy(tmp, dest)?;
        std::fs::remove_file(tmp)?;
        Ok::<(), std::io::Error>(())
    })?;
    Ok(())
}

pub fn file_sha1(path: &Path) -> CoreResult<String> {
    let bytes = std::fs::read(path)?;
    let mut hasher = Sha1::new();
    hasher.update(&bytes);
    Ok(hex::encode(hasher.finalize()))
}

pub async fn file_sha1_async(path: PathBuf) -> CoreResult<String> {
    tokio::task::spawn_blocking(move || file_sha1(&path))
        .await
        .map_err(|e| CoreError::msg(e.to_string()))?
}

/// Stream download to a temp file with async writes (does not block the tokio worker).
pub async fn stream_download_to_file(
    client: &reqwest::Client,
    url: &str,
    dest: &Path,
    expected_sha1: Option<&str>,
    gate: Option<&Arc<ConcurrencyGate>>,
    class: GateClass,
    mut on_progress: impl FnMut(u64, u64),
) -> CoreResult<()> {
    use futures_util::StreamExt;

    if dest.is_file() {
        if let Some(expected) = expected_sha1 {
            let dest_buf = dest.to_path_buf();
            let digest = file_sha1_async(dest_buf).await?;
            if digest == expected.to_ascii_lowercase() {
                return Ok(());
            }
        }
    }

    if let Some(parent) = dest.parent() {
        let parent = parent.to_path_buf();
        let io_permit = match gate {
            Some(g) => Some(g.acquire_io(class).await),
            None => None,
        };
        tokio::task::spawn_blocking(move || std::fs::create_dir_all(parent))
            .await
            .map_err(|e| CoreError::msg(e.to_string()))??;
        drop(io_permit);
    }

    let _fetch_permit = match gate {
        Some(g) => Some(g.acquire_fetch(class).await),
        None => None,
    };

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| CoreError::msg(e.to_string()))?
        .error_for_status()
        .map_err(|e| CoreError::msg(e.to_string()))?;
    let total = response.content_length().unwrap_or(0);
    let tmp = dest.with_extension(format!("download-part-{}", uuid::Uuid::new_v4()));

    // Async writes keep the tokio worker free; only rename uses the I/O gate.
    let mut file = tokio::fs::File::create(&tmp)
        .await
        .map_err(|e| CoreError::msg(e.to_string()))?;
    let mut hasher = Sha1::new();
    let mut current = 0u64;
    let mut stream = response.bytes_stream();
    let mut last_emit = std::time::Instant::now()
        .checked_sub(Duration::from_millis(200))
        .unwrap_or_else(std::time::Instant::now);

    on_progress(0, total.max(1));
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| CoreError::msg(e.to_string()))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| CoreError::msg(e.to_string()))?;
        hasher.update(&chunk);
        current += chunk.len() as u64;
        if last_emit.elapsed() >= Duration::from_millis(200) || (total > 0 && current >= total) {
            last_emit = std::time::Instant::now();
            on_progress(current, total.max(1));
        }
    }
    file.flush()
        .await
        .map_err(|e| CoreError::msg(e.to_string()))?;
    drop(file);
    drop(_fetch_permit);

    let digest = hex::encode(hasher.finalize());
    if let Some(expected) = expected_sha1 {
        if digest != expected.to_ascii_lowercase() {
            let _ = tokio::fs::remove_file(&tmp).await;
            return Err(CoreError::msg(format!(
                "SHA-1 mismatch for {}: expected {expected}, got {digest}",
                dest.display()
            )));
        }
    }

    let dest_buf = dest.to_path_buf();
    let tmp_buf = tmp.clone();
    let io_permit = match gate {
        Some(g) => Some(g.acquire_io(class).await),
        None => None,
    };
    tokio::task::spawn_blocking(move || {
        if dest_buf.exists() {
            let _ = std::fs::remove_file(&dest_buf);
        }
        std::fs::rename(&tmp_buf, &dest_buf).or_else(|_| {
            std::fs::copy(&tmp_buf, &dest_buf)?;
            std::fs::remove_file(&tmp_buf)?;
            Ok::<(), std::io::Error>(())
        })
    })
    .await
    .map_err(|e| CoreError::msg(e.to_string()))??;
    drop(io_permit);

    Ok(())
}

/// Download JSON and parse as `serde_json::Value`.
pub async fn download_json(url: &str) -> CoreResult<serde_json::Value> {
    http_client()
        .get(url)
        .send()
        .await
        .map_err(|e| CoreError::msg(e.to_string()))?
        .error_for_status()
        .map_err(|e| CoreError::msg(e.to_string()))?
        .json()
        .await
        .map_err(|e| CoreError::msg(e.to_string()))
}
