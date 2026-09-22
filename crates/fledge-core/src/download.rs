//! Shared HTTP download helper with optional SHA-1 verification.

use crate::error::{CoreError, CoreResult};
use futures_util::StreamExt;
use sha1::{Digest, Sha1};
use std::fs;
use std::io::Write;
use std::path::Path;

/// Download `url` to `dest`. Creates parent directories.
/// Skips the network fetch when the file already exists and matches `expected_sha1`.
pub async fn download_to_file(
    url: &str,
    dest: &Path,
    expected_sha1: Option<&str>,
) -> CoreResult<()> {
    if dest.is_file() {
        if let Some(expected) = expected_sha1 {
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

    let client = reqwest::Client::new();
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| CoreError::msg(e.to_string()))?
        .error_for_status()
        .map_err(|e| CoreError::msg(e.to_string()))?;

    let tmp = dest.with_extension("download-part");

    let mut stream = response.bytes_stream();
    let mut file = fs::File::create(&tmp)?;
    let mut hasher = Sha1::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| CoreError::msg(e.to_string()))?;
        file.write_all(&chunk)?;
        hasher.update(&chunk);
    }
    file.flush()?;
    drop(file);

    let digest = hex::encode(hasher.finalize());
    if let Some(expected) = expected_sha1 {
        if digest != expected.to_ascii_lowercase() {
            let _ = fs::remove_file(&tmp);
            return Err(CoreError::msg(format!(
                "SHA-1 mismatch for {}: expected {expected}, got {digest}",
                dest.display()
            )));
        }
    }

    if dest.exists() {
        let _ = fs::remove_file(dest);
    }
    fs::rename(&tmp, dest).or_else(|_| {
        fs::copy(&tmp, dest)?;
        fs::remove_file(&tmp)?;
        Ok::<(), std::io::Error>(())
    })?;
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
    let client = reqwest::Client::new();
    client
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
