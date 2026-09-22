//! Fledge-managed Temurin JDKs (ports `packages/core/src/java/JavaManager.ts`).

use crate::error::{CoreError, CoreResult};
use crate::paths::PathLayout;
use crate::progress::{EventBus, ProgressEvent};
use parking_lot::Mutex;
use serde::Serialize;
use serde_json::json;
use std::collections::HashMap;
use std::fs;
use std::io::{copy, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use std::time::Instant;

pub const JAVA_MANAGED_MAJORS: [u32; 4] = [25, 21, 17, 8];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JavaRuntimeView {
    pub major: u32,
    pub installed: bool,
    pub java_path: Option<String>,
    pub display_path: String,
    pub install_dir: String,
    pub removable: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JavaVerifyResult {
    pub ok: bool,
    pub major: u32,
    pub detail: String,
    pub detected_major: Option<u32>,
}

pub fn required_java_major(minecraft_version: &str) -> u32 {
    let mut parts = minecraft_version.split('.');
    let major: u32 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(1);
    let minor: u32 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
    let patch: u32 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
    if major >= 26 {
        return 25;
    }
    if major != 1 {
        return 21;
    }
    if minor <= 16 {
        return 8;
    }
    if minor < 20 {
        return 17;
    }
    if minor == 20 {
        return if patch >= 5 { 21 } else { 17 };
    }
    21
}

pub struct JavaManager {
    layout: PathLayout,
    events: Arc<EventBus>,
    path_memo: Mutex<HashMap<u32, String>>,
    inflight: Mutex<HashMap<u32, ()>>,
}

impl JavaManager {
    pub fn new(layout: PathLayout, events: Arc<EventBus>) -> Self {
        Self {
            layout,
            events,
            path_memo: Mutex::new(HashMap::new()),
            inflight: Mutex::new(HashMap::new()),
        }
    }

    pub fn install_dir(&self, major: u32) -> PathBuf {
        PathBuf::from(&self.layout.java).join(format!("java{major}"))
    }

    fn marker_path(&self, major: u32) -> PathBuf {
        self.install_dir(major).join(".fledge-java")
    }

    fn legacy_install_dir(&self, major: u32) -> PathBuf {
        PathBuf::from(&self.layout.root)
            .join("Data")
            .join("Java")
            .join(format!("temurin-{major}"))
    }

    fn legacy_marker_path(&self, major: u32) -> PathBuf {
        PathBuf::from(&self.layout.root)
            .join("Data")
            .join("Java")
            .join(format!("java-{major}.path"))
    }

    pub fn list_runtimes(&self) -> CoreResult<Vec<JavaRuntimeView>> {
        fs::create_dir_all(&self.layout.java)?;
        let mut views = Vec::new();
        for major in JAVA_MANAGED_MAJORS {
            views.push(self.get_runtime_view(major)?);
        }
        Ok(views)
    }

    pub fn get_runtime_view(&self, major: u32) -> CoreResult<JavaRuntimeView> {
        let install_dir = self.install_dir(major);
        let _ = self.maybe_flatten_existing(major);
        let detected = self.detect_managed_java(major)?;
        let leftover = install_dir.exists()
            || self.legacy_install_dir(major).exists()
            || self.legacy_marker_path(major).exists();
        let display_path = detected
            .as_ref()
            .and_then(|p| Path::new(p).parent().map(|d| d.to_string_lossy().into_owned()))
            .unwrap_or_else(|| install_dir.to_string_lossy().into_owned());
        Ok(JavaRuntimeView {
            major,
            installed: detected.is_some(),
            java_path: detected,
            display_path,
            install_dir: install_dir.to_string_lossy().into_owned(),
            removable: leftover,
        })
    }

    pub async fn install(&self, major: u32) -> CoreResult<JavaRuntimeView> {
        self.ensure_managed_major(major)?;
        self.begin_exclusive(major)?;
        let result = self
            .download_and_link(major, &format!("java-install-{major}"), false)
            .await;
        self.end_exclusive(major);
        result?;
        self.get_runtime_view(major)
    }

    pub async fn reinstall(&self, major: u32) -> CoreResult<JavaRuntimeView> {
        self.ensure_managed_major(major)?;
        self.begin_exclusive(major)?;
        let result = self
            .download_and_link(major, &format!("java-reinstall-{major}"), true)
            .await;
        self.end_exclusive(major);
        result?;
        self.get_runtime_view(major)
    }

    pub async fn uninstall(&self, major: u32) -> CoreResult<JavaRuntimeView> {
        self.ensure_managed_major(major)?;
        self.begin_exclusive(major)?;
        self.remove_managed(major);
        self.end_exclusive(major);
        self.get_runtime_view(major)
    }

    fn remove_managed(&self, major: u32) {
        self.path_memo.lock().remove(&major);
        let targets = [
            self.install_dir(major),
            self.legacy_install_dir(major),
            self.legacy_marker_path(major),
            PathBuf::from(&self.layout.temp).join(format!("temurin-{major}.zip")),
        ];
        for target in targets {
            let _ = fs::remove_dir_all(&target);
            let _ = fs::remove_file(&target);
        }
    }

    pub fn verify(&self, major: u32) -> CoreResult<JavaVerifyResult> {
        self.ensure_managed_major(major)?;
        let Some(java_path) = self.detect_managed_java(major)? else {
            return Ok(JavaVerifyResult {
                ok: false,
                major,
                detail: "not_installed".into(),
                detected_major: None,
            });
        };
        match self.run_java_version(&java_path) {
            Ok(output) => {
                let detected = parse_major(&output);
                if detected == Some(major) {
                    Ok(JavaVerifyResult {
                        ok: true,
                        major,
                        detail: "ok".into(),
                        detected_major: detected,
                    })
                } else {
                    Ok(JavaVerifyResult {
                        ok: false,
                        major,
                        detail: "version_mismatch".into(),
                        detected_major: detected,
                    })
                }
            }
            Err(_) => Ok(JavaVerifyResult {
                ok: false,
                major,
                detail: "exec_failed".into(),
                detected_major: None,
            }),
        }
    }

    pub async fn ensure_java(&self, minecraft_version: &str, session_id: &str) -> CoreResult<String> {
        let needed = self.resolve_required_major(minecraft_version);
        let major = self.to_managed_major(needed);
        if let Some(path) = self.detect_managed_java(major)? {
            tracing::info!("Using Fledge-managed Java {major}: {path}");
            return Ok(path);
        }
        tracing::info!("Fledge Java {major} not found. Installing…");
        self.begin_exclusive(major)?;
        let result = self.download_and_link(major, session_id, false).await;
        self.end_exclusive(major);
        result?;
        self.detect_managed_java(major)?
            .ok_or_else(|| CoreError::msg("launch.error.generic"))
    }

    fn resolve_required_major(&self, minecraft_version: &str) -> u32 {
        let json_path = PathBuf::from(&self.layout.minecraft)
            .join("versions")
            .join(minecraft_version)
            .join(format!("{minecraft_version}.json"));
        if let Ok(raw) = fs::read_to_string(json_path) {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&raw) {
                if let Some(major) = parsed
                    .pointer("/javaVersion/majorVersion")
                    .and_then(|v| v.as_u64())
                {
                    if major >= 8 {
                        return major as u32;
                    }
                }
            }
        }
        required_java_major(minecraft_version)
    }

    fn to_managed_major(&self, major: u32) -> u32 {
        if JAVA_MANAGED_MAJORS.contains(&major) {
            return major;
        }
        let mut ascending = JAVA_MANAGED_MAJORS;
        ascending.sort();
        ascending
            .into_iter()
            .find(|m| *m >= major)
            .unwrap_or(*ascending.last().unwrap())
    }

    fn ensure_managed_major(&self, major: u32) -> CoreResult<()> {
        if JAVA_MANAGED_MAJORS.contains(&major) {
            Ok(())
        } else {
            Err(CoreError::msg("Unsupported Java major"))
        }
    }

    fn begin_exclusive(&self, major: u32) -> CoreResult<()> {
        let mut guard = self.inflight.lock();
        if guard.contains_key(&major) {
            return Err(CoreError::msg("settings.java.busy"));
        }
        guard.insert(major, ());
        Ok(())
    }

    fn end_exclusive(&self, major: u32) {
        self.inflight.lock().remove(&major);
    }

    async fn download_and_link(
        &self,
        major: u32,
        session_id: &str,
        force: bool,
    ) -> CoreResult<()> {
        if !force {
            if self.detect_managed_java(major)?.is_some() {
                return Ok(());
            }
        }
        let job_id = uuid::Uuid::new_v4().to_string();
        self.emit_java_progress(
            session_id,
            &job_id,
            0.0,
            1.0,
            "settings.java.downloading",
            Some("running"),
            force,
            major,
        );

        if force {
            self.path_memo.lock().remove(&major);
            let _ = fs::remove_dir_all(self.install_dir(major));
        }

        let java_home = self
            .download_temurin(major, session_id, &job_id)
            .await?;
        fs::create_dir_all(self.install_dir(major))?;
        fs::write(self.marker_path(major), &java_home)?;
        self.path_memo.lock().insert(major, java_home);
        self.emit_java_progress(
            session_id,
            &job_id,
            1.0,
            1.0,
            "settings.java.downloading",
            Some("completed"),
            force,
            major,
        );
        Ok(())
    }

    fn emit_java_progress(
        &self,
        session_id: &str,
        job_id: &str,
        current: f64,
        total: f64,
        message_key: &str,
        status: Option<&str>,
        force: bool,
        major: u32,
    ) {
        let percent = if total > 0.0 {
            Some((current / total) * 100.0)
        } else {
            None
        };
        self.events.emit_progress(ProgressEvent {
            scope: "transfer".into(),
            kind: Some("java".into()),
            session_id: Some(session_id.into()),
            job_id: Some(job_id.into()),
            current,
            total,
            percent,
            bytes_per_second: None,
            message_key: Some(message_key.into()),
            status: status.map(|s| s.into()),
            meta: Some(json!({
              "major": major,
              "action": if force { "reinstall" } else { "install" }
            })),
        });
    }

    async fn download_temurin(
        &self,
        major: u32,
        session_id: &str,
        job_id: &str,
    ) -> CoreResult<String> {
        let api = format!(
            "https://api.adoptium.net/v3/binary/latest/{major}/ga/windows/x64/jdk/hotspot/normal/eclipse?project=jdk"
        );
        let dest_zip = PathBuf::from(&self.layout.temp).join(format!("temurin-{major}.zip"));
        let dest_dir = self.install_dir(major);
        fs::create_dir_all(&self.layout.temp)?;

        download_file_with_progress(
            &api,
            &dest_zip,
            |current, total| {
                self.emit_java_progress(
                    session_id,
                    job_id,
                    current as f64,
                    total.max(1) as f64,
                    "settings.java.downloading",
                    Some("running"),
                    false,
                    major,
                );
            },
        )
        .await?;

        self.emit_java_progress(
            session_id,
            job_id,
            1.0,
            1.0,
            "settings.java.extracting",
            Some("running"),
            false,
            major,
        );

        let _ = fs::remove_dir_all(&dest_dir);
        fs::create_dir_all(&dest_dir)?;
        extract_zip(&dest_zip, &dest_dir)?;

        let version_label = self.flatten_jdk_layout(&dest_dir)?;
        let java_exe = dest_dir.join("bin").join("java.exe");
        let resolved = if java_exe.is_file() {
            java_exe
        } else {
            find_java_exe(&dest_dir).ok_or_else(|| CoreError::msg("launch.error.generic"))?
        };
        let version = version_label
            .or_else(|| read_jdk_release_version(&dest_dir))
            .unwrap_or_else(|| {
                resolved
                    .parent()
                    .and_then(|p| p.parent())
                    .map(|p| p.file_name().unwrap_or_default().to_string_lossy().into_owned())
                    .unwrap_or_else(|| major.to_string())
            });
        write_version_doc(&dest_dir, &version, major)?;
        Ok(resolved.to_string_lossy().into_owned())
    }

    fn detect_managed_java(&self, major: u32) -> CoreResult<Option<String>> {
        if let Some(memo) = self.path_memo.lock().get(&major).cloned() {
            if Path::new(&memo).is_file() {
                return Ok(Some(memo));
            }
            self.path_memo.lock().remove(&major);
        }

        for marker in [self.marker_path(major), self.legacy_marker_path(major)] {
            if let Ok(stored) = fs::read_to_string(&marker) {
                let stored = stored.trim().to_string();
                if !stored.is_empty() && Path::new(&stored).is_file() {
                    self.path_memo.lock().insert(major, stored.clone());
                    return Ok(Some(stored));
                }
            }
        }

        for dir in [self.install_dir(major), self.legacy_install_dir(major)] {
            if let Some(exe) = find_java_exe(&dir) {
                if self.is_exact_major(&exe, major) {
                    let s = exe.to_string_lossy().into_owned();
                    self.path_memo.lock().insert(major, s.clone());
                    return Ok(Some(s));
                }
            }
        }
        Ok(None)
    }

    fn is_exact_major(&self, java_path: &Path, major: u32) -> bool {
        match self.run_java_version(java_path) {
            Ok(out) => parse_major(&out) == Some(major),
            Err(_) => false,
        }
    }

    fn run_java_version(&self, java_path: impl AsRef<Path>) -> CoreResult<String> {
        let output = Command::new(java_path.as_ref())
            .arg("-version")
            .output()
            .map_err(|e| CoreError::msg(e.to_string()))?;
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        Ok(format!("{stdout}\n{stderr}"))
    }

    fn flatten_jdk_layout(&self, dest_dir: &Path) -> CoreResult<Option<String>> {
        let flat = dest_dir.join("bin").join("java.exe");
        if flat.is_file() {
            return Ok(read_jdk_release_version(dest_dir));
        }
        let entries = match fs::read_dir(dest_dir) {
            Ok(e) => e,
            Err(_) => return Ok(None),
        };
        for entry in entries.flatten() {
            if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                continue;
            }
            let nested = entry.path();
            if !nested.join("bin").join("java.exe").is_file() {
                continue;
            }
            for nested_entry in fs::read_dir(&nested)?.flatten() {
                let name = nested_entry.file_name();
                fs::rename(nested_entry.path(), dest_dir.join(&name))?;
            }
            let _ = fs::remove_dir_all(&nested);
            let label = entry
                .file_name()
                .to_string_lossy()
                .trim_start_matches("jdk-")
                .to_string();
            return Ok(Some(label));
        }
        Ok(None)
    }

    fn maybe_flatten_existing(&self, major: u32) -> CoreResult<()> {
        let dest_dir = self.install_dir(major);
        if !dest_dir.exists() {
            return Ok(());
        }
        let flat = dest_dir.join("bin").join("java.exe");
        if flat.is_file() {
            if !has_version_doc(&dest_dir) {
                let version = read_jdk_release_version(&dest_dir).unwrap_or_else(|| major.to_string());
                write_version_doc(&dest_dir, &version, major)?;
            }
            return Ok(());
        }
        let version_label = self.flatten_jdk_layout(&dest_dir)?;
        let resolved = if flat.is_file() {
            flat
        } else if let Some(exe) = find_java_exe(&dest_dir) {
            exe
        } else {
            return Ok(());
        };
        fs::write(self.marker_path(major), resolved.to_string_lossy().as_bytes())?;
        self.path_memo
            .lock()
            .insert(major, resolved.to_string_lossy().into_owned());
        if !has_version_doc(&dest_dir) {
            let version = version_label
                .or_else(|| read_jdk_release_version(&dest_dir))
                .unwrap_or_else(|| major.to_string());
            write_version_doc(&dest_dir, &version, major)?;
        }
        Ok(())
    }
}

fn parse_major(version_output: &str) -> Option<u32> {
    let re = regex_lite_version(version_output)?;
    re.parse().ok()
}

fn regex_lite_version(output: &str) -> Option<&str> {
    // version "21.0.1" or version 1.8.0_xxx
    let lower = output;
    let idx = lower.to_ascii_lowercase().find("version")?;
    let rest = &lower[idx + "version".len()..];
    let rest = rest.trim_start();
    let rest = rest.trim_start_matches('"');
    if rest.starts_with("1.") {
        let after = &rest[2..];
        let end = after
            .find(|c: char| !c.is_ascii_digit())
            .unwrap_or(after.len());
        Some(&after[..end])
    } else {
        let end = rest
            .find(|c: char| !c.is_ascii_digit())
            .unwrap_or(rest.len());
        Some(&rest[..end])
    }
}

fn find_java_exe(root: &Path) -> Option<PathBuf> {
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else if entry.file_name().to_string_lossy().eq_ignore_ascii_case("java.exe") {
                return Some(path);
            }
        }
    }
    None
}

fn has_version_doc(install_dir: &Path) -> bool {
    fs::read_dir(install_dir)
        .ok()
        .map(|entries| {
            entries.flatten().any(|e| {
                let name = e.file_name().to_string_lossy().to_ascii_lowercase();
                name.starts_with("jdk-") && name.ends_with(".md")
            })
        })
        .unwrap_or(false)
}

fn read_jdk_release_version(java_home: &Path) -> Option<String> {
    let raw = fs::read_to_string(java_home.join("release")).ok()?;
    for key in ["SEMANTIC_VERSION=", "JAVA_VERSION="] {
        if let Some(line) = raw.lines().find(|l| l.starts_with(key)) {
            let value = line.trim_start_matches(key).trim().trim_matches('"');
            if !value.is_empty() {
                return Some(value.to_string());
            }
        }
    }
    None
}

fn write_version_doc(install_dir: &Path, version: &str, major: u32) -> CoreResult<()> {
    let label = version.trim_start_matches("jdk-");
    let file_name = format!("jdk-{label}.md");
    let body = format!(
        "# Eclipse Temurin JDK {label}\n\nFledge が導入した Java ランタイムです。\n\n- Major: {major}\n- Version: {label}\n- Layout: `java{major}/bin`\n"
    );
    if let Ok(entries) = fs::read_dir(install_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            let lower = name.to_ascii_lowercase();
            if lower.starts_with("jdk-") && lower.ends_with(".md") && name != file_name {
                let _ = fs::remove_file(entry.path());
            }
        }
    }
    fs::write(install_dir.join(file_name), body)?;
    Ok(())
}

fn extract_zip(zip_path: &Path, dest_dir: &Path) -> CoreResult<()> {
    let file = fs::File::open(zip_path)?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| CoreError::msg(e.to_string()))?;
    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| CoreError::msg(e.to_string()))?;
        let Some(rel) = file.enclosed_name().map(|p| p.to_path_buf()) else {
            continue;
        };
        let out = dest_dir.join(rel);
        if file.is_dir() {
            fs::create_dir_all(&out)?;
        } else {
            if let Some(parent) = out.parent() {
                fs::create_dir_all(parent)?;
            }
            let mut outfile = fs::File::create(&out)?;
            copy(&mut file, &mut outfile)?;
        }
    }
    Ok(())
}

async fn download_file_with_progress<F>(
    url: &str,
    dest: &Path,
    mut on_progress: F,
) -> CoreResult<()>
where
    F: FnMut(u64, u64),
{
    use futures_util::StreamExt;
    let client = reqwest::Client::new();
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| CoreError::msg(e.to_string()))?
        .error_for_status()
        .map_err(|e| CoreError::msg(e.to_string()))?;
    let total = response.content_length().unwrap_or(0);
    let mut stream = response.bytes_stream();
    let mut file = fs::File::create(dest)?;
    let mut current = 0u64;
    let mut last_emit = Instant::now();
    on_progress(0, total.max(1));
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| CoreError::msg(e.to_string()))?;
        file.write_all(&chunk)?;
        current += chunk.len() as u64;
        if last_emit.elapsed().as_millis() >= 100 || current == total {
            on_progress(current, total.max(1));
            last_emit = Instant::now();
        }
    }
    file.flush()?;
    Ok(())
}
