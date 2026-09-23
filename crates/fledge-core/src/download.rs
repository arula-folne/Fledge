//! Shared HTTP download helper with connection reuse and optional SHA-1 verification.

use crate::error::{CoreError, CoreResult};
use sha1::{Digest, Sha1};
use std::fs;
use std::io::Write;
use std::path::Path;
use std::sync::OnceLock;
use std::time::Duration;

fn http_client() -> &'static reqwest::Client {
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

/// Download `url` to `dest`. Creates parent directories.
/// Skips the network fetch when the file already exists and matches `expected_sha1`
/// (or `expected_size` when provided — preferred for large asset trees).
pub async fn download_to_file(
    url: &str,
    dest: &Path,
    expected_sha1: Option<&str>,
) -> CoreResult<()> {
    download_to_file_ex(url, dest, expected_sha1, None).await
}

pub async fn download_to_file_ex(
    url: &str,
    dest: &Path,
    expected_sha1: Option<&str>,
    expected_size: Option<u64>,
) -> CoreResult<()> {
    if dest.is_file() {
        if let Some(size) = expected_size {
            if fs::metadata(dest).map(|m| m.len() == size).unwrap_or(false) {
                return Ok(());
            }
        } else if let Some(expected) = expected_sha1 {
            if file_sha1(dest)? == expected.to_ascii_lowercase() {
                return Ok(());
            }
        } else {
            return Ok(());
        }
    }

    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }

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

    if let Some(expected) = expected_sha1 {
        let mut hasher = Sha1::new();
        hasher.update(&bytes);
        let digest = hex::encode(hasher.finalize());
        if digest != expected.to_ascii_lowercase() {
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
    // 同期書き込みはスレッドプールへ逃がしてランタイムを塞がない
    let dest_buf = dest.to_path_buf();
    let tmp_buf = tmp.clone();
    tokio::task::spawn_blocking(move || -> CoreResult<()> {
        let mut file = fs::File::create(&tmp_buf)?;
        file.write_all(&bytes)?;
        file.flush()?;
        drop(file);
        if dest_buf.exists() {
            let _ = fs::remove_file(&dest_buf);
        }
        fs::rename(&tmp_buf, &dest_buf).or_else(|_| {
            fs::copy(&tmp_buf, &dest_buf)?;
            fs::remove_file(&tmp_buf)?;
            Ok::<(), std::io::Error>(())
        })?;
        Ok(())
    })
    .await
    .map_err(|e| CoreError::msg(e.to_string()))??;

    Ok(())
}

pub fn file_sha1(path: &Path) -> CoreResult<String> {
    let bytes = fs::read(path)?;
    let mut hasher = Sha1::new();
    hasher.update(&bytes);
    Ok(hex::encode(hasher.finalize()))
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
