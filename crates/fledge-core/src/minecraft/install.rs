//! Vanilla + Fabric install (client jar, libraries, assets, natives).

use crate::download::{download_json, download_to_file, download_to_file_ex};
use crate::error::{CoreError, CoreResult};
use crate::minecraft::install_ready::{
    is_version_complete, natives_root, write_ready_record,
};
use crate::minecraft::resolve::{
    load_resolved_version, maven_path_from_name, version_json_path, ResolvedLibrary, ResolvedVersion,
};
use crate::progress::{EventBus, ProgressEvent};
use futures_util::stream::{self, StreamExt};
use serde_json::Value;
use std::fs;
use std::io::copy;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use zip::ZipArchive;

const MANIFEST_URL: &str = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const ASSET_BASE: &str = "https://resources.download.minecraft.net";
const LIB_BASE: &str = "https://libraries.minecraft.net";
const FABRIC_PROFILE: &str =
    "https://meta.fabricmc.net/v2/versions/loader/{mc}/{loader}/profile/json";
const QUILT_PROFILE: &str =
    "https://meta.quiltmc.org/v3/versions/loader/{mc}/{loader}/profile/json";
const FORGE_INSTALLER: &str =
    "https://maven.minecraftforge.net/net/minecraftforge/forge/{mc}-{forge}/forge-{mc}-{forge}-installer.jar";
const NEOFORGE_INSTALLER: &str =
    "https://maven.neoforged.net/releases/net/neoforged/neoforge/{ver}/neoforge-{ver}-installer.jar";

/// 1 インスタンス内のファイル並列数（設定の同時ダウンロード数＝インスタンス枠とは別）。
const LIBRARY_DOWNLOAD_CONCURRENCY: usize = 32;
const ASSET_DOWNLOAD_CONCURRENCY: usize = 64;

pub struct InstallContext {
    pub minecraft_root: PathBuf,
    pub events: Arc<EventBus>,
    pub session_id: String,
}

impl InstallContext {
    fn emit(&self, message_key: &str, current: f64, total: f64, status: Option<&str>) {
        let percent = if total > 0.0 {
            Some((current / total) * 100.0)
        } else {
            None
        };
        self.events.emit_progress(ProgressEvent {
            scope: "launch".into(),
            kind: Some("install".into()),
            session_id: Some(self.session_id.clone()),
            job_id: None,
            current,
            total,
            percent,
            bytes_per_second: None,
            message_key: Some(message_key.into()),
            status: status.map(|s| s.into()),
            meta: None,
        });
    }

    fn emit_transfer(&self, message_key: &str, current: f64, total: f64) {
        let percent = if total > 0.0 {
            Some((current / total) * 100.0)
        } else {
            None
        };
        self.events.emit_progress(ProgressEvent {
            scope: "transfer".into(),
            kind: Some("install".into()),
            session_id: Some(self.session_id.clone()),
            job_id: None,
            current,
            total,
            percent,
            bytes_per_second: None,
            message_key: Some(message_key.into()),
            status: Some("running".into()),
            meta: None,
        });
    }
}

pub async fn install_vanilla(
    ctx: &InstallContext,
    minecraft_version: &str,
) -> CoreResult<String> {
    ctx.emit("launch.install.versionList", 0.0, 1.0, Some("running"));
    let manifest = download_json(MANIFEST_URL).await?;
    let versions = manifest
        .get("versions")
        .and_then(|v| v.as_array())
        .ok_or_else(|| CoreError::msg("invalid version manifest"))?;
    let meta = versions
        .iter()
        .find(|v| v.get("id").and_then(|x| x.as_str()) == Some(minecraft_version))
        .ok_or_else(|| CoreError::msg(format!("Version not found: {minecraft_version}")))?;
    let url = meta
        .get("url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| CoreError::msg("version meta missing url"))?;

    ctx.emit("launch.install.client", 0.0, 1.0, Some("running"));
    let version_json: Value = download_json(url).await?;
    save_version_json(&ctx.minecraft_root, minecraft_version, &version_json)?;

    let resolved = load_resolved_version(&ctx.minecraft_root, minecraft_version)?;
    download_client_jar(ctx, &resolved).await?;
    download_libraries(ctx, &resolved).await?;
    download_assets(ctx, &resolved).await?;
    extract_natives(ctx, minecraft_version, &resolved)?;

    Ok(minecraft_version.to_string())
}

pub async fn install_fabric(
    ctx: &InstallContext,
    minecraft_version: &str,
    loader_version: &str,
) -> CoreResult<String> {
    install_loader_profile(
        ctx,
        "fabric",
        "launch.install.fabric",
        FABRIC_PROFILE,
        minecraft_version,
        loader_version,
    )
    .await
}

pub async fn install_quilt(
    ctx: &InstallContext,
    minecraft_version: &str,
    loader_version: &str,
) -> CoreResult<String> {
    install_loader_profile(
        ctx,
        "quilt",
        "launch.install.quilt",
        QUILT_PROFILE,
        minecraft_version,
        loader_version,
    )
    .await
}

async fn install_loader_profile(
    ctx: &InstallContext,
    _loader_name: &str,
    message_key: &str,
    url_template: &str,
    minecraft_version: &str,
    loader_version: &str,
) -> CoreResult<String> {
    ctx.emit(message_key, 0.0, 2.0, Some("running"));
    let url = url_template
        .replace("{mc}", minecraft_version)
        .replace("{loader}", loader_version);
    let profile: Value = download_json(&url).await?;
    let id = profile
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if id.is_empty() {
        return Err(CoreError::msg(format!("{message_key} profile missing id")));
    }
    save_version_json(&ctx.minecraft_root, &id, &profile)?;

    let inherits = profile
        .get("inheritsFrom")
        .and_then(|v| v.as_str())
        .unwrap_or(minecraft_version)
        .to_string();
    if !version_json_path(&ctx.minecraft_root, &inherits).is_file() {
        install_vanilla(ctx, &inherits).await?;
    }

    ctx.emit("launch.install.libraries", 1.0, 2.0, Some("running"));
    let resolved = load_resolved_version(&ctx.minecraft_root, &id)?;
    download_client_jar(ctx, &resolved).await?;
    download_libraries(ctx, &resolved).await?;
    download_assets(ctx, &resolved).await?;
    extract_natives(ctx, &id, &resolved)?;

    Ok(id)
}

/// Install Forge via official installer jar (`--installClient`).
pub async fn install_forge(
    ctx: &InstallContext,
    minecraft_version: &str,
    forge_version: &str,
    java_path: &str,
) -> CoreResult<String> {
    ctx.emit("launch.install.forge", 0.0, 2.0, Some("running"));
    if !is_version_complete(&ctx.minecraft_root, minecraft_version) {
        install_vanilla(ctx, minecraft_version).await?;
    }

    let full = format!("{minecraft_version}-{forge_version}");
    let url = FORGE_INSTALLER
        .replace("{mc}", minecraft_version)
        .replace("{forge}", forge_version);
    let installer = installer_temp_path(&ctx.minecraft_root, &format!("forge-{full}-installer.jar"))?;
    prepare_installer_download(&installer)?;
    download_to_file(&url, &installer, None).await?;
    run_installer(java_path, &installer, &ctx.minecraft_root).await?;

    ctx.emit("launch.install.libraries", 1.0, 2.0, Some("running"));
    let id = find_forge_like_version_id(
        &ctx.minecraft_root,
        minecraft_version,
        forge_version,
        "forge",
    )
    .ok_or_else(|| CoreError::msg("Forge install did not produce a version json"))?;
    complete_installation(ctx, &id).await?;
    Ok(id)
}

pub async fn install_neoforge(
    ctx: &InstallContext,
    minecraft_version: &str,
    neo_version: &str,
    java_path: &str,
) -> CoreResult<String> {
    ctx.emit("launch.install.neoforge", 0.0, 2.0, Some("running"));
    if !is_version_complete(&ctx.minecraft_root, minecraft_version) {
        install_vanilla(ctx, minecraft_version).await?;
    }

    let url = NEOFORGE_INSTALLER.replace("{ver}", neo_version);
    let installer =
        installer_temp_path(&ctx.minecraft_root, &format!("neoforge-{neo_version}-installer.jar"))?;
    prepare_installer_download(&installer)?;
    download_to_file(&url, &installer, None).await?;
    run_installer(java_path, &installer, &ctx.minecraft_root).await?;

    ctx.emit("launch.install.libraries", 1.0, 2.0, Some("running"));
    let id = find_forge_like_version_id(
        &ctx.minecraft_root,
        minecraft_version,
        neo_version,
        "neoforge",
    )
    .ok_or_else(|| CoreError::msg("NeoForge install did not produce a version json"))?;
    complete_installation(ctx, &id).await?;
    Ok(id)
}

fn installer_temp_path(minecraft_root: &Path, file_name: &str) -> CoreResult<PathBuf> {
    let path = if let Some(root) = minecraft_root.parent() {
        root.join("temp").join(file_name)
    } else {
        minecraft_root.join("temp").join(file_name)
    };
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    Ok(path)
}

/// 壊れた/不完全なキャッシュ jar を再利用しない。
fn prepare_installer_download(path: &Path) -> CoreResult<()> {
    if !path.is_file() {
        return Ok(());
    }
    if looks_like_jar(path) {
        return Ok(());
    }
    let _ = fs::remove_file(path);
    Ok(())
}

fn looks_like_jar(path: &Path) -> bool {
    use std::io::Read;
    let Ok(mut file) = fs::File::open(path) else {
        return false;
    };
    let mut magic = [0u8; 4];
    matches!(file.read(&mut magic), Ok(n) if n >= 2 && magic[0] == 0x50 && magic[1] == 0x4B)
}

/// Forge / NeoForge 公式インストーラーは公式ランチャー用の
/// `launcher_profiles.json` が無いと `--installClient` が終了コード 1 で失敗する。
fn ensure_launcher_profiles(minecraft_root: &Path) -> CoreResult<()> {
    fs::create_dir_all(minecraft_root)?;
    let path = minecraft_root.join("launcher_profiles.json");
    if path.is_file() {
        // 空ファイルや壊れた JSON だと同様に失敗するため、最低限 profiles を確認する
        if let Ok(bytes) = fs::read(&path) {
            if let Ok(value) = serde_json::from_slice::<Value>(&bytes) {
                if value.get("profiles").and_then(|v| v.as_object()).is_some() {
                    return Ok(());
                }
            }
        }
    }

    let stub = serde_json::json!({
        "profiles": {
            "fledge": {
                "name": "fledge",
                "type": "custom",
                "created": "1970-01-01T00:00:00.000Z",
                "lastUsed": "1970-01-01T00:00:00.000Z",
                "icon": "Furnace",
                "lastVersionId": "latest-release"
            }
        },
        "selectedProfile": "fledge",
        "clientToken": "fledge",
        "launcherVersion": {
            "name": "fledge",
            "format": 21
        }
    });
    fs::write(&path, serde_json::to_vec_pretty(&stub)?)?;
    Ok(())
}

async fn run_installer(java_path: &str, installer: &Path, minecraft_root: &Path) -> CoreResult<()> {
    ensure_launcher_profiles(minecraft_root)?;

    let java = PathBuf::from(java_path);
    let installer_abs = fs::canonicalize(installer).unwrap_or_else(|_| installer.to_path_buf());
    let root_abs = fs::canonicalize(minecraft_root).unwrap_or_else(|_| minecraft_root.to_path_buf());

    let output = tokio::process::Command::new(&java)
        .arg("-jar")
        .arg(&installer_abs)
        .arg("--installClient")
        .arg(&root_abs)
        .current_dir(&root_abs)
        .output()
        .await
        .map_err(|e| CoreError::msg(e.to_string()))?;

    if output.status.success() {
        return Ok(());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let combined = format!("{stdout}\n{stderr}");
    let detail = installer_failure_detail(&combined);
    Err(CoreError::msg(format!(
        "Installer exited with {}; {detail}",
        output.status
    )))
}

fn installer_failure_detail(log: &str) -> String {
    const MARKERS: &[&str] = &[
        "There is no Minecraft launcher profile",
        "There was an error during installation",
        "Failed to",
        "Exception:",
        "Error:",
    ];
    let lines: Vec<&str> = log
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .collect();
    for marker in MARKERS {
        if let Some(line) = lines.iter().rev().find(|l| l.contains(marker)) {
            return (*line).to_string();
        }
    }
    lines
        .last()
        .map(|s| (*s).to_string())
        .unwrap_or_else(|| "no installer output".into())
}

fn find_forge_like_version_id(
    minecraft_root: &Path,
    minecraft_version: &str,
    loader_version: &str,
    kind: &str,
) -> Option<String> {
    let candidates = match kind {
        "forge" => vec![
            format!("{minecraft_version}-forge-{loader_version}"),
            format!("{minecraft_version}-forge{loader_version}"),
            format!("{minecraft_version}-{loader_version}"),
        ],
        "neoforge" => vec![
            format!("{minecraft_version}-neoforge-{loader_version}"),
            format!("neoforge-{loader_version}"),
        ],
        _ => vec![],
    };
    for id in candidates {
        if version_json_path(minecraft_root, &id).is_file() {
            return Some(id);
        }
    }
    // Scan versions dir for matching suffix
    let versions_dir = minecraft_root.join("versions");
    let entries = fs::read_dir(versions_dir).ok()?;
    let mut best: Option<String> = None;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let matches = match kind {
            "forge" => {
                name.contains("forge")
                    && name.contains(minecraft_version)
                    && name.contains(loader_version)
            }
            "neoforge" => {
                name.to_ascii_lowercase().contains("neoforge") && name.contains(loader_version)
            }
            _ => false,
        };
        if matches && version_json_path(minecraft_root, &name).is_file() {
            best = Some(name);
            break;
        }
    }
    best
}

pub async fn complete_installation(
    ctx: &InstallContext,
    version_id: &str,
) -> CoreResult<()> {
    let resolved = load_resolved_version(&ctx.minecraft_root, version_id)?;
    ctx.emit("launch.install.libraries", 0.0, 1.0, Some("running"));
    download_client_jar(ctx, &resolved).await?;
    download_libraries(ctx, &resolved).await?;
    download_assets(ctx, &resolved).await?;
    extract_natives(ctx, version_id, &resolved)?;
    Ok(())
}

pub async fn ensure_natives(ctx: &InstallContext, version_id: &str) -> CoreResult<()> {
    let resolved = load_resolved_version(&ctx.minecraft_root, version_id)?;
    ctx.emit("launch.install.natives", 0.0, 1.0, Some("running"));
    extract_natives(ctx, version_id, &resolved)?;
    ctx.emit("launch.install.natives", 1.0, 1.0, Some("succeeded"));
    Ok(())
}

fn save_version_json(minecraft_root: &Path, version_id: &str, json: &Value) -> CoreResult<()> {
    let path = version_json_path(minecraft_root, version_id);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, serde_json::to_string_pretty(json)?)?;
    Ok(())
}

async fn download_client_jar(ctx: &InstallContext, resolved: &ResolvedVersion) -> CoreResult<()> {
    let jar_id = resolved
        .jar
        .as_deref()
        .or(resolved.minecraft_version.as_deref())
        .unwrap_or(resolved.id.as_str());
    let downloads = resolved.raw.get("downloads").and_then(|d| d.get("client"));
    let Some(client) = downloads else {
        // Inherited fabric profile may lack downloads — jar lives on parent id
        let jar_path = ctx
            .minecraft_root
            .join("versions")
            .join(jar_id)
            .join(format!("{jar_id}.jar"));
        if jar_path.is_file() {
            return Ok(());
        }
        // Try loading parent version json for client download
        if jar_id != resolved.id {
            if let Ok(parent) = load_resolved_version(&ctx.minecraft_root, jar_id) {
                return Box::pin(download_client_jar(ctx, &parent)).await;
            }
        }
        return Err(CoreError::msg(format!(
            "client jar download info missing for {}",
            resolved.id
        )));
    };
    let url = client
        .get("url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| CoreError::msg("client url missing"))?;
    let sha1 = client.get("sha1").and_then(|v| v.as_str());
    let dest = ctx
        .minecraft_root
        .join("versions")
        .join(jar_id)
        .join(format!("{jar_id}.jar"));
    ctx.emit("launch.install.client", 0.0, 1.0, Some("running"));
    download_to_file(url, &dest, sha1).await?;
    ctx.emit("launch.install.client", 1.0, 1.0, Some("succeeded"));
    Ok(())
}

async fn download_libraries(ctx: &InstallContext, resolved: &ResolvedVersion) -> CoreResult<()> {
    let libs = &resolved.libraries;
    let total = libs.len().max(1) as f64;
    ctx.emit("launch.install.libraries", 0.0, total, Some("running"));

    let root = ctx.minecraft_root.clone();
    let tasks: Vec<_> = libs
        .iter()
        .flat_map(|lib| library_download_jobs(lib))
        .collect();
    let task_total = tasks.len().max(1) as f64;
    let mut done = 0f64;

    // 同時数を抑えつつ進捗を逐次更新（完了待ちの一括 collect は UI/ディスクを圧迫しやすい）
    let mut stream = stream::iter(tasks.into_iter().map(|(url, dest, sha)| {
        let root = root.clone();
        async move {
            let path = root.join("libraries").join(&dest);
            download_to_file(&url, &path, sha.as_deref()).await
        }
    }))
    .buffer_unordered(LIBRARY_DOWNLOAD_CONCURRENCY);

    while let Some(r) = stream.next().await {
        r?;
        done += 1.0;
        if (done as u64) % 8 == 0 || done >= task_total {
            ctx.emit_transfer("launch.install.libraries", done, task_total);
        }
    }
    ctx.emit("launch.install.libraries", total, total, Some("succeeded"));
    Ok(())
}

fn library_download_jobs(lib: &ResolvedLibrary) -> Vec<(String, String, Option<String>)> {
    let mut out = Vec::new();
    if !lib.is_native_only {
        if let (Some(path), Some(url)) = (&lib.artifact_path, &lib.artifact_url) {
            out.push((url.clone(), path.clone(), lib.artifact_sha1.clone()));
        }
    }
    if let (Some(path), Some(url)) = (&lib.native_path, &lib.native_url) {
        // Avoid duplicate if same as artifact
        if lib.artifact_path.as_deref() != Some(path.as_str()) || lib.is_native_only {
            out.push((url.clone(), path.clone(), lib.native_sha1.clone()));
        }
    }
    // Fallback: url field on library (fabric)
    if out.is_empty() {
        if let Some(name) = &lib.name {
            let path = maven_path_from_name(name, None);
            let url = lib
                .raw
                .get("url")
                .and_then(|v| v.as_str())
                .map(|base| {
                    let base = base.trim_end_matches('/');
                    format!("{base}/{path}")
                })
                .unwrap_or_else(|| format!("{LIB_BASE}/{path}"));
            out.push((url, path, None));
        }
    }
    out
}

async fn download_assets(ctx: &InstallContext, resolved: &ResolvedVersion) -> CoreResult<()> {
    let Some(index_info) = &resolved.asset_index else {
        return Ok(());
    };
    ctx.emit("launch.install.assets", 0.0, 1.0, Some("running"));
    let index_path = ctx
        .minecraft_root
        .join("assets")
        .join("indexes")
        .join(format!("{}.json", index_info.id));
    download_to_file(
        &index_info.url,
        &index_path,
        index_info.sha1.as_deref(),
    )
    .await?;

    let index: Value = serde_json::from_str(&fs::read_to_string(&index_path)?)?;
    let objects = index
        .get("objects")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();
    let total = objects.len().max(1) as f64;
    let objects_dir = ctx.minecraft_root.join("assets").join("objects");

    let jobs: Vec<(String, PathBuf, String, u64)> = objects
        .values()
        .filter_map(|obj| {
            let hash = obj.get("hash")?.as_str()?.to_string();
            if hash.len() < 2 {
                return None;
            }
            let size = obj.get("size").and_then(|v| v.as_u64()).unwrap_or(0);
            let prefix = &hash[..2];
            let dest = objects_dir.join(prefix).join(&hash);
            let url = format!("{ASSET_BASE}/{prefix}/{hash}");
            Some((url, dest, hash, size))
        })
        .collect();

    let results_stream = stream::iter(jobs.into_iter().map(|(url, dest, hash, size)| async move {
        let expected_size = if size > 0 { Some(size) } else { None };
        download_to_file_ex(&url, &dest, Some(&hash), expected_size).await
    }))
    .buffer_unordered(ASSET_DOWNLOAD_CONCURRENCY);

    let mut stream = results_stream;
    let mut done = 0f64;
    while let Some(r) = stream.next().await {
        r?;
        done += 1.0;
        if (done as u64) % 128 == 0 || done >= total {
            ctx.emit_transfer("launch.install.assets", done, total);
        }
    }
    ctx.emit("launch.install.assets", total, total, Some("succeeded"));
    Ok(())
}

fn extract_natives(
    ctx: &InstallContext,
    version_id: &str,
    resolved: &ResolvedVersion,
) -> CoreResult<()> {
    let base = natives_root(&ctx.minecraft_root, version_id);
    let lib_subdir = natives_library_subdir(&resolved.jvm_args);
    let dest = match &lib_subdir {
        Some(sub) => base.join(sub),
        None => base.clone(),
    };

    // 旧ネスト展開や誤アーチ残骸を消してからフラット展開する
    if base.is_dir() {
        let _ = fs::remove_dir_all(&base);
    }
    fs::create_dir_all(&dest)?;
    // 26.x の scratch 用兄弟ディレクトリ（実行時に作られてもよいが先に用意）
    if lib_subdir.is_some() {
        for scratch in ["jna", "lwjgl", "netty"] {
            let _ = fs::create_dir_all(base.join(scratch));
        }
    }

    for lib in &resolved.libraries {
        let native_rel = if let Some(p) = &lib.native_path {
            Some(p.clone())
        } else if lib.is_native_only {
            lib.artifact_path.clone()
        } else {
            None
        };
        let Some(rel) = native_rel else { continue };
        let jar = ctx.minecraft_root.join("libraries").join(&rel);
        if !jar.is_file() {
            continue;
        }
        extract_native_jar_flat(&jar, &dest)?;
    }
    Ok(())
}

/// JVM 引数の `-Djava.library.path=${natives_directory}/java` などから展開サブディレクトリを取る。
/// `${natives_directory}` 自体の置換は常にベースを指す（ここを `/java` にすると `/java/jna` が壊れる）。
fn natives_library_subdir(jvm_args: &[String]) -> Option<String> {
    const PREFIX: &str = "-Djava.library.path=${natives_directory}";
    for a in jvm_args {
        let Some(rest) = a.strip_prefix(PREFIX) else { continue };
        let rest = rest.trim_start_matches(['/', '\\']);
        if rest.is_empty() {
            return None;
        }
        // 先頭パス要素のみ（`java` など）
        let sub = rest.split(['/', '\\']).next().unwrap_or(rest);
        if sub.is_empty() || sub.contains('$') {
            return None;
        }
        return Some(sub.to_string());
    }
    None
}

/// JAR 内のネストパスを捨て、ファイル名だけで dest 直下へ展開する（LWJGL 3.4+ / MC 26.x 対応）。
fn extract_native_jar_flat(jar: &Path, dest: &Path) -> CoreResult<()> {
    let file = fs::File::open(jar)?;
    let mut archive = ZipArchive::new(file).map_err(|e| CoreError::msg(e.to_string()))?;
    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| CoreError::msg(e.to_string()))?;
        if entry.is_dir() {
            continue;
        }
        let Some(rel) = entry.enclosed_name().map(|p| p.to_path_buf()) else {
            continue;
        };
        let name = rel.to_string_lossy();
        if name.contains("META-INF") {
            continue;
        }
        let Some(file_name) = rel.file_name() else {
            continue;
        };
        let file_name_str = file_name.to_string_lossy();
        if file_name_str.ends_with(".sha1")
            || file_name_str.ends_with(".git")
            || file_name_str.ends_with(".class")
        {
            continue;
        }
        let out = dest.join(file_name);
        if out.is_file() {
            if let Ok(existing) = fs::metadata(&out) {
                if existing.len() == entry.size() {
                    continue;
                }
            }
        }
        let mut outfile = fs::File::create(&out)?;
        copy(&mut entry, &mut outfile)?;
    }
    Ok(())
}

pub async fn install_profile(
    ctx: &InstallContext,
    profile: &Value,
    java_path: Option<&str>,
) -> CoreResult<String> {
    let mc = profile
        .get("minecraftVersion")
        .and_then(|v| v.as_str())
        .ok_or_else(|| CoreError::msg("minecraftVersion required"))?;
    let loader = profile
        .get("loader")
        .and_then(|v| v.as_str())
        .unwrap_or("vanilla");
    let loader_version = profile.get("loaderVersion").and_then(|v| v.as_str());

    let installed_id = match loader {
        "vanilla" => install_vanilla(ctx, mc).await?,
        "fabric" => {
            let lv = loader_version.ok_or_else(|| CoreError::msg("loaderVersion required"))?;
            if !is_version_complete(&ctx.minecraft_root, mc) {
                install_vanilla(ctx, mc).await?;
            }
            install_fabric(ctx, mc, lv).await?
        }
        "quilt" => {
            let lv = loader_version.ok_or_else(|| CoreError::msg("loaderVersion required"))?;
            if !is_version_complete(&ctx.minecraft_root, mc) {
                install_vanilla(ctx, mc).await?;
            }
            install_quilt(ctx, mc, lv).await?
        }
        "forge" => {
            let lv = loader_version.ok_or_else(|| CoreError::msg("loaderVersion required"))?;
            let java = java_path.ok_or_else(|| CoreError::msg("Java is required to install Forge"))?;
            install_forge(ctx, mc, lv, java).await?
        }
        "neoforge" => {
            let lv = loader_version.ok_or_else(|| CoreError::msg("loaderVersion required"))?;
            let java =
                java_path.ok_or_else(|| CoreError::msg("Java is required to install NeoForge"))?;
            install_neoforge(ctx, mc, lv, java).await?
        }
        other => {
            return Err(CoreError::msg(format!("Loader not supported: {other}")));
        }
    };

    write_ready_record(
        &ctx.minecraft_root,
        mc,
        loader,
        loader_version,
        &installed_id,
    )?;
    Ok(installed_id)
}

/// Fix incomplete install then write ready if complete.
pub async fn repair_and_ready(
    ctx: &InstallContext,
    profile: &Value,
    version_id: &str,
) -> CoreResult<Option<String>> {
    complete_installation(ctx, version_id).await?;
    if is_version_complete(&ctx.minecraft_root, version_id) {
        let mc = profile
            .get("minecraftVersion")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let loader = profile
            .get("loader")
            .and_then(|v| v.as_str())
            .unwrap_or("vanilla");
        let lv = profile.get("loaderVersion").and_then(|v| v.as_str());
        write_ready_record(&ctx.minecraft_root, mc, loader, lv, version_id)?;
        ensure_natives(ctx, version_id).await?;
        Ok(Some(version_id.to_string()))
    } else {
        Ok(None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("fledge-install-{label}-{nanos}"))
    }

    #[test]
    fn ensure_launcher_profiles_creates_stub() {
        let dir = temp_dir("profiles");
        ensure_launcher_profiles(&dir).unwrap();
        let path = dir.join("launcher_profiles.json");
        assert!(path.is_file());
        let value: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        assert!(value.get("profiles").and_then(|v| v.as_object()).is_some());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn ensure_launcher_profiles_repairs_invalid_json() {
        let dir = temp_dir("profiles-bad");
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("launcher_profiles.json");
        fs::write(&path, b"not-json").unwrap();
        ensure_launcher_profiles(&dir).unwrap();
        let value: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        assert!(value.get("profiles").is_some());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn installer_failure_detail_prefers_profile_message() {
        let log = r#"
Host: maven.minecraftforge.net
There is no Minecraft launcher profile in "C:\\tmp", you need to run the launcher first!
There was an error during installation
"#;
        let detail = installer_failure_detail(log);
        assert!(detail.contains("launcher profile"));
    }
}
