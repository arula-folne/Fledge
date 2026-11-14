//! Content install / media / mrpack — Modrinth + folne site catalog.

pub(crate) mod api_http;
mod folne;
mod modrinth;
mod mrpack;

use crate::concurrency::{ConcurrencyGate, GateClass};
use crate::download::{content_http_client, stream_download_to_file};
use crate::error::{CoreError, CoreResult};
use crate::instances::{CreateDefaults, InstanceStore};
use crate::progress::{EventBus, ProgressEvent};
use crate::settings::SettingsStore;
use crate::versions::VersionService;
use futures_util::{stream, StreamExt};
use folne::FolneProvider;
use modrinth::{pick_modrinth_version, ModrinthProvider, ResolvedContentFile};
use mrpack::{
    client_files, loader_from_mrpack, loader_version_from_mrpack, minecraft_from_mrpack,
    pack_file_category, parse_mrpack_index, project_id_from_download_url, safe_instance_path,
    unzip_to_entries, version_id_from_download_url, write_mrpack_overrides, write_zip_entries,
    MrpackIndexFile,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use parking_lot::Mutex;
use serde_json::{json, Value};
use sha1::{Digest, Sha1};
use sha2::Sha512;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{OwnedSemaphorePermit, Semaphore};
use uuid::Uuid;
use zip::ZipArchive;

const INDEX_DIR: &str = ".fledge";
const INDEX_FILE: &str = "content-index.json";
/// ダウンロード中の進捗通知間隔（UI / IPC 負荷を抑える）
const PROGRESS_EMIT_INTERVAL: Duration = Duration::from_millis(400);
/// 同時に進めるコンテンツ install パイプライン数（resolve + DL + 配置）
const CONTENT_INSTALL_SLOTS: usize = 2;

const EXPORT_EXCLUDED: &[&str] = &[".fledge"];

const EXPORT_DEFAULT_UNSELECTED: &[&str] = &[
    "saves",
    "logs",
    "screenshots",
    "crash-reports",
    "backups",
];

const EXPORT_DEFAULT_SELECTED: &[&str] = &[
    "mods",
    "resourcepacks",
    "shaderpacks",
    "datapacks",
    "config",
    "defaultconfigs",
];

pub struct ContentService {
    instances: Arc<InstanceStore>,
    settings: Arc<SettingsStore>,
    versions: Arc<VersionService>,
    events: Arc<EventBus>,
    concurrency: Arc<ConcurrencyGate>,
    /// ブラウズ優先: 同時 install（resolve〜配置）を制限する
    install_slots: Arc<Semaphore>,
    modrinth: ModrinthProvider,
    folne: FolneProvider,
    /// Per-instance index locks (coarse outer map, fine inner lock).
    index_locks: Arc<Mutex<HashMap<String, Arc<Mutex<()>>>>>,
}

impl ContentService {
    pub fn new(
        instances: Arc<InstanceStore>,
        settings: Arc<SettingsStore>,
        versions: Arc<VersionService>,
        events: Arc<EventBus>,
        concurrency: Arc<ConcurrencyGate>,
    ) -> Self {
        Self {
            instances,
            settings,
            versions,
            events,
            concurrency,
            install_slots: Arc::new(Semaphore::new(CONTENT_INSTALL_SLOTS)),
            modrinth: ModrinthProvider::new(),
            folne: FolneProvider::new(),
            index_locks: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    fn clone_service(&self) -> Self {
        Self {
            instances: Arc::clone(&self.instances),
            settings: Arc::clone(&self.settings),
            versions: Arc::clone(&self.versions),
            events: Arc::clone(&self.events),
            concurrency: Arc::clone(&self.concurrency),
            install_slots: Arc::clone(&self.install_slots),
            modrinth: ModrinthProvider::new(),
            folne: FolneProvider::new(),
            index_locks: Arc::clone(&self.index_locks),
        }
    }

    fn content_file_concurrency(&self) -> usize {
        // 配置・展開と合わせて抑え、検索 UI の応答を優先する
        self.concurrency
            .max_interactive_io()
            .max(1)
            .min(self.concurrency.max_interactive_fetch())
            .clamp(1, 2)
    }

    async fn acquire_install_slot(&self) -> OwnedSemaphorePermit {
        self.install_slots
            .clone()
            .acquire_owned()
            .await
            .expect("content install semaphore is never closed")
    }

    pub fn list_providers(&self) -> Value {
        json!([
          { "id": "modrinth", "name": "Modrinth", "available": true },
          { "id": "folne", "name": "folne", "available": true }
        ])
    }

    fn provider_id(value: &Value) -> &str {
        value
            .get("provider")
            .and_then(|v| v.as_str())
            .unwrap_or("modrinth")
    }

    pub async fn list_category_tags(&self) -> CoreResult<Value> {
        self.modrinth.list_category_tags().await
    }

    pub async fn search(&self, query: &Value) -> CoreResult<Value> {
        match Self::provider_id(query) {
            "folne" => self.folne.search(query).await,
            _ => self.modrinth.search(query).await,
        }
    }

    pub async fn get_project(&self, project_id: &str) -> CoreResult<Value> {
        self.get_project_from(project_id, "modrinth").await
    }

    pub async fn get_project_from(&self, project_id: &str, provider: &str) -> CoreResult<Value> {
        let id = project_id.trim();
        if id.is_empty() {
            return Err(CoreError::msg("Project id required"));
        }
        match provider {
            "folne" => self.folne.get_project(id).await,
            _ => self.modrinth.get_project(id).await,
        }
    }

    pub async fn list_versions(&self, input: &Value) -> CoreResult<Value> {
        let id = input
            .get("projectId")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim();
        if id.is_empty() {
            return Err(CoreError::msg("Project id required"));
        }
        let game_version = input.get("gameVersion").and_then(|v| v.as_str());
        let loaders = string_array(input.get("loaders"));
        let versions = match Self::provider_id(input) {
            "folne" => self.folne.list_versions(id, game_version, &loaders).await?,
            _ => {
                self.modrinth
                    .list_versions(id, game_version, &loaders)
                    .await?
            }
        };
        Ok(Value::Array(versions))
    }

    pub async fn list_installed(
        &self,
        instance_id: &str,
        category: Option<&str>,
    ) -> CoreResult<Value> {
        let mut index = self.read_index(instance_id)?;
        let unresolved: Vec<String> = index
            .items
            .iter()
            .filter(|i| {
                i.get("projectMetadataResolved")
                    .and_then(|v| v.as_bool())
                    != Some(true)
                    && !i
                        .get("projectId")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .starts_with("pack:")
            })
            .filter_map(|i| {
                i.get("projectId")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            })
            .collect();
        if !unresolved.is_empty() {
            if let Ok(metadata) = self.modrinth.get_project_metadata(&unresolved).await {
                let index_lock = self.lock_index(instance_id);
                let _guard = index_lock.lock();
                let mut current = self.read_index(instance_id)?;
                let mut changed = false;
                for item in &mut current.items {
                    if item
                        .get("projectMetadataResolved")
                        .and_then(|v| v.as_bool())
                        == Some(true)
                    {
                        continue;
                    }
                    let pid = item
                        .get("projectId")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    if let Some((slug, name, icon)) = metadata.get(pid) {
                        let obj = item.as_object_mut().unwrap();
                        obj.insert("slug".into(), json!(slug));
                        obj.insert("name".into(), json!(name));
                        obj.insert("iconUrl".into(), json!(icon));
                        obj.insert("projectMetadataResolved".into(), json!(true));
                        changed = true;
                    }
                }
                if changed {
                    self.write_index(instance_id, &current)?;
                }
                index = current;
            }
        }
        let items = if let Some(cat) = category {
            index
                .items
                .into_iter()
                .filter(|i| i.get("category").and_then(|v| v.as_str()) == Some(cat))
                .collect()
        } else {
            index.items
        };
        Ok(Value::Array(items))
    }

    pub async fn install(&self, req: &Value) -> CoreResult<Value> {
        let instance_id = req
            .get("instanceId")
            .and_then(|v| v.as_str())
            .ok_or_else(|| CoreError::msg("instanceId required"))?;
        let category = req
            .get("category")
            .and_then(|v| v.as_str())
            .ok_or_else(|| CoreError::msg("category required"))?;
        if category == "modpack" {
            return Err(CoreError::msg(
                "Modpack は閲覧画面からインスタンスを作成してください",
            ));
        }
        if category == "plugin" {
            return Err(CoreError::msg(
                "プラグインはこのアプリでは扱えません",
            ));
        }
        let project_id = req
            .get("projectId")
            .and_then(|v| v.as_str())
            .ok_or_else(|| CoreError::msg("projectId required"))?;
        let profile = self
            .instances
            .get(instance_id)?
            .ok_or_else(|| CoreError::msg(format!("Instance not found: {instance_id}")))?;
        let loader = profile
            .get("loader")
            .and_then(|v| v.as_str())
            .unwrap_or("vanilla");
        if loader == "vanilla" && (category == "mod" || category == "shader") {
            return Err(CoreError::msg(
                "Vanilla では Mod やシェーダーをインストールできません",
            ));
        }
        let loaders = if let Some(arr) = req.get("loaders").and_then(|v| v.as_array()) {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        } else if category == "mod" {
            loader_to_filters(loader)
        } else {
            vec![]
        };
        let game_version = req
            .get("gameVersion")
            .and_then(|v| v.as_str())
            .or_else(|| profile.get("minecraftVersion").and_then(|v| v.as_str()));
        let version_id = req.get("versionId").and_then(|v| v.as_str());

        let index = self.read_index(instance_id)?;
        let installed: HashMap<String, String> = index
            .items
            .iter()
            .filter_map(|i| {
                Some((
                    i.get("projectId")?.as_str()?.to_string(),
                    i.get("versionId")?.as_str()?.to_string(),
                ))
            })
            .collect();

        let provider = Self::provider_id(req).to_string();
        let instance_dir = self.instances.instance_dir(instance_id);
        let session_id = format!("content-{instance_id}-{project_id}");
        let display_name = project_id.to_string();
        self.emit_content_job_progress(
            &session_id,
            &display_name,
            "",
            instance_id,
            project_id,
            0.0,
            1.0,
            Some(0.0),
            "queued",
        );

        let queued_entry = json!({
          "id": Uuid::new_v4().to_string(),
          "provider": provider.clone(),
          "projectId": project_id,
          "versionId": version_id.unwrap_or(""),
          "name": display_name,
          "category": category,
          "fileName": "",
          "enabled": true,
          "projectMetadataResolved": false,
          "installedAt": chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
          "updateAvailable": false
        });

        // IPC は即返し。resolve〜DL〜配置は枠を制限してバックグラウンドで進める
        let bg = self.clone_service();
        let instance_id_owned = instance_id.to_string();
        let project_id_owned = project_id.to_string();
        let category_owned = category.to_string();
        let loader_owned = loader.to_string();
        let loaders_owned = loaders;
        let game_version_owned = game_version.map(|s| s.to_string());
        let version_id_owned = version_id.map(|s| s.to_string());
        let installed_owned = installed;
        let instance_dir_owned = instance_dir;
        let installed_items = index.items.clone();
        tokio::spawn(async move {
            let _slot = bg.acquire_install_slot().await;
            if let Err(err) = bg
                .run_install_job(
                    &instance_id_owned,
                    &instance_dir_owned,
                    &provider,
                    &project_id_owned,
                    &category_owned,
                    &loader_owned,
                    &loaders_owned,
                    game_version_owned.as_deref(),
                    version_id_owned.as_deref(),
                    &installed_owned,
                    &installed_items,
                )
                .await
            {
                tracing::error!(
                    "background content install failed for {}: {err}",
                    project_id_owned
                );
            }
        });

        Ok(queued_entry)
    }

    #[allow(clippy::too_many_arguments)]
    async fn run_install_job(
        &self,
        instance_id: &str,
        instance_dir: &Path,
        provider: &str,
        project_id: &str,
        category: &str,
        loader: &str,
        loaders: &[String],
        game_version: Option<&str>,
        version_id: Option<&str>,
        installed: &HashMap<String, String>,
        installed_items: &[Value],
    ) -> CoreResult<()> {
        let files = match provider {
            "folne" => {
                self.folne
                    .resolve_install(
                        project_id,
                        category,
                        version_id,
                        game_version,
                        loaders,
                    )
                    .await
                    .map(|file| vec![file])
            }
            _ => {
                self.modrinth
                    .resolve_install_set(
                        project_id,
                        category,
                        version_id,
                        game_version,
                        loaders,
                        Some(loader),
                        installed,
                    )
                    .await
            }
        };
        let files = match files {
            Ok(files) if !files.is_empty() => files,
            Ok(_) => {
                self.emit_content_job_finished(
                    &format!("content-{instance_id}-{project_id}"),
                    project_id,
                    "",
                    instance_id,
                    project_id,
                    false,
                );
                return Err(CoreError::msg(if provider == "folne" {
                    "Compatible version not found on folne"
                } else {
                    "Compatible version not found on Modrinth"
                }));
            }
            Err(err) => {
                self.emit_content_job_finished(
                    &format!("content-{instance_id}-{project_id}"),
                    project_id,
                    "",
                    instance_id,
                    project_id,
                    false,
                );
                return Err(err);
            }
        };
        let primary = files.last().unwrap();
        let installed_by: HashMap<String, Value> = installed_items
            .iter()
            .filter_map(|i| {
                Some((
                    i.get("projectId")?.as_str()?.to_string(),
                    i.clone(),
                ))
            })
            .collect();

        let mut pending: Vec<ResolvedContentFile> = Vec::new();
        for resolved in &files {
            if let Some(current) = installed_by.get(&resolved.project_id) {
                if current.get("versionId").and_then(|v| v.as_str())
                    == Some(resolved.version_id.as_str())
                {
                    continue;
                }
            }
            pending.push(resolved.clone());
        }

        if pending.is_empty() {
            self.emit_content_job_finished(
                &format!("content-{instance_id}-{}", primary.project_id),
                &primary.name,
                &primary.file_name,
                instance_id,
                &primary.project_id,
                true,
            );
            return Ok(());
        }

        for resolved in &pending {
            let session_id = format!("content-{instance_id}-{}", resolved.project_id);
            self.emit_content_job_progress(
                &session_id,
                &resolved.name,
                &resolved.file_name,
                instance_id,
                &resolved.project_id,
                0.0,
                1.0,
                Some(0.0),
                "queued",
            );
        }

        let concurrency = self.content_file_concurrency();
        let results = stream::iter(pending.into_iter().map(|resolved| {
            let bg = self.clone_service();
            let instance_id = instance_id.to_string();
            let instance_dir = instance_dir.to_path_buf();
            async move {
                let dir = instance_dir.join(category_dir(&resolved.category));
                let _ = tokio::task::spawn_blocking({
                    let dir = dir.clone();
                    move || fs::create_dir_all(dir)
                })
                .await;
                bg.download_and_finalize(&instance_id, &instance_dir, &resolved)
                    .await
            }
        }))
        .buffer_unordered(concurrency)
        .collect::<Vec<_>>()
        .await;

        let mut first_err: Option<CoreError> = None;
        for result in results {
            if let Err(err) = result {
                tracing::error!("background content file install failed: {err}");
                if first_err.is_none() {
                    first_err = Some(err);
                }
            }
        }
        if let Some(err) = first_err {
            return Err(err);
        }
        Ok(())
    }

    /// ローカルファイル（.jar / .zip 等）をインスタンスへコピーして index に登録する。
    pub async fn install_local(&self, req: &Value) -> CoreResult<Value> {
        let req = req.clone();
        let service = self.clone_service();
        tokio::task::spawn_blocking(move || service.install_local_blocking(&req))
            .await
            .map_err(|e| CoreError::msg(e.to_string()))?
    }

    fn install_local_blocking(&self, req: &Value) -> CoreResult<Value> {
        let instance_id = req
            .get("instanceId")
            .and_then(|v| v.as_str())
            .ok_or_else(|| CoreError::msg("instanceId required"))?;
        let paths = req
            .get("paths")
            .and_then(|v| v.as_array())
            .ok_or_else(|| CoreError::msg("paths required"))?;
        let category_override = req.get("category").and_then(|v| v.as_str());
        let profile = self
            .instances
            .get(instance_id)?
            .ok_or_else(|| CoreError::msg(format!("Instance not found: {instance_id}")))?;
        let loader = profile
            .get("loader")
            .and_then(|v| v.as_str())
            .unwrap_or("vanilla");

        let mut installed = Vec::new();
        let mut errors = Vec::new();
        for path_v in paths {
            let Some(path_str) = path_v.as_str() else {
                continue;
            };
            match self.install_local_file(instance_id, Path::new(path_str), category_override, loader)
            {
                Ok(entry) => installed.push(entry),
                Err(err) => errors.push(format!(
                    "{}: {}",
                    Path::new(path_str)
                        .file_name()
                        .map(|s| s.to_string_lossy().into_owned())
                        .unwrap_or_else(|| path_str.to_string()),
                    err
                )),
            }
        }

        if installed.is_empty() && !errors.is_empty() {
            return Err(CoreError::msg(errors.join("\n")));
        }
        Ok(json!({
          "installed": installed,
          "errors": errors,
        }))
    }

    fn install_local_file(
        &self,
        instance_id: &str,
        path: &Path,
        category_override: Option<&str>,
        loader: &str,
    ) -> CoreResult<Value> {
        if !path.is_file() {
            return Err(CoreError::msg("file not found"));
        }
        let file_name = path
            .file_name()
            .and_then(|s| s.to_str())
            .ok_or_else(|| CoreError::msg("invalid file name"))?
            .to_string();
        let category = category_override
            .map(|s| s.to_string())
            .or_else(|| detect_local_content_category(path))
            .ok_or_else(|| CoreError::msg("content.error.localUnsupportedType"))?;

        if category == "modpack" || file_name.to_lowercase().ends_with(".mrpack") {
            return Err(CoreError::msg("content.error.modpackUseCreate"));
        }
        if category == "plugin" {
            return Err(CoreError::msg("content.error.pluginUnsupported"));
        }
        if loader == "vanilla" && (category == "mod" || category == "shader") {
            return Err(CoreError::msg("content.error.vanillaCategoryUnsupported"));
        }

        let data = fs::read(path)?;
        let (sha1, sha512) = file_hashes(&data);
        let stem = Path::new(&file_name)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(&file_name);
        let project_id = format!("local-{sha1}");
        let instance_dir = self.instances.instance_dir(instance_id);
        let dest_dir = instance_dir.join(category_dir(&category));
        fs::create_dir_all(&dest_dir)?;
        let dest_path = dest_dir.join(&file_name);
        let staging = dest_path.with_extension(format!("local-{}", Uuid::new_v4()));
        fs::write(&staging, &data)?;

        let entry = json!({
          "id": Uuid::new_v4().to_string(),
          "provider": "local",
          "projectId": project_id,
          "versionId": sha1.clone(),
          "slug": stem,
          "name": stem,
          "versionNumber": "local",
          "category": category,
          "fileName": file_name,
          "iconUrl": Value::Null,
          "sha1": sha1,
          "sha512": sha512,
          "fileSize": data.len() as u64,
          "projectMetadataResolved": false,
          "enabled": true,
          "installedAt": chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
          "updateAvailable": false
        });

        self.finalize_installed(
            instance_id,
            &instance_dir,
            "local",
            entry.get("projectId").and_then(|v| v.as_str()).unwrap_or(""),
            &category,
            &file_name,
            entry.clone(),
            &staging,
            &dest_path,
        )?;
        Ok(entry)
    }

    pub async fn create_instance_from_project(&self, req: &Value) -> CoreResult<Value> {
        let category = req
            .get("category")
            .and_then(|v| v.as_str())
            .ok_or_else(|| CoreError::msg("category required"))?;
        if category == "plugin" {
            return Err(CoreError::msg(
                "プラグインはこのアプリでは扱えません",
            ));
        }
        let project_id = req
            .get("projectId")
            .and_then(|v| v.as_str())
            .ok_or_else(|| CoreError::msg("projectId required"))?;
        let provider = Self::provider_id(req);
        if provider == "folne" && category == "modpack" {
            return Err(CoreError::msg(
                "folne では Modpack からのインスタンス作成に未対応です",
            ));
        }
        let game_version = req.get("gameVersion").and_then(|v| v.as_str());
        let loaders = string_array(req.get("loaders"));
        let page = self.get_project_from(project_id, provider).await?;
        let mut versions = match provider {
            "folne" => {
                self.folne
                    .list_versions(project_id, game_version, &loaders)
                    .await?
            }
            _ => {
                self.modrinth
                    .list_versions(project_id, game_version, &loaders)
                    .await?
            }
        };
        let version_id = req.get("versionId").and_then(|v| v.as_str());
        let mut version = if let Some(vid) = version_id {
            versions.iter().find(|v| v.get("id").and_then(|x| x.as_str()) == Some(vid)).cloned()
        } else {
            pick_modrinth_version(versions.clone())
        };
        if version.is_none() && version_id.is_some() {
            versions = match provider {
                "folne" => self.folne.list_versions(project_id, None, &[]).await?,
                _ => self.modrinth.list_versions(project_id, None, &[]).await?,
            };
            version = versions
                .iter()
                .find(|v| v.get("id").and_then(|x| x.as_str()) == version_id)
                .cloned();
        }
        let version = version.ok_or_else(|| {
            CoreError::msg(if provider == "folne" {
                "Compatible version not found on folne"
            } else {
                "Compatible version not found on Modrinth"
            })
        })?;
        let project = page
            .get("project")
            .cloned()
            .ok_or_else(|| CoreError::msg("Unsupported project type"))?;

        if category == "modpack" {
            return self
                .create_instance_from_modpack(req, &project, &version)
                .await;
        }
        self.create_instance_from_content(req, &project, &version, category)
            .await
    }

    async fn create_instance_from_content(
        &self,
        req: &Value,
        project: &Value,
        version: &Value,
        category: &str,
    ) -> CoreResult<Value> {
        let loader = if category == "mod" {
            pick_loader(&string_array(version.get("loaders")))
        } else {
            "vanilla".into()
        };
        let minecraft_version = req
            .get("gameVersion")
            .and_then(|v| v.as_str())
            .filter(|s| !s.trim().is_empty())
            .map(|s| s.to_string())
            .or_else(|| {
                string_array(version.get("gameVersions"))
                    .into_iter()
                    .next()
            })
            .or_else(|| {
                string_array(project.get("gameVersions"))
                    .into_iter()
                    .next()
            })
            .ok_or_else(|| CoreError::msg("Minecraft バージョンを特定できません"))?;
        let loader_version = self
            .resolve_loader_version(&loader, &minecraft_version, None)
            .await?;
        let name = req
            .get("instanceName")
            .and_then(|v| v.as_str())
            .filter(|s| !s.trim().is_empty())
            .map(|s| s.to_string())
            .unwrap_or_else(|| {
                project
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Instance")
                    .to_string()
            });
        let profile = self
            .create_seeded_instance(&name, &minecraft_version, &loader, loader_version.as_deref())?;
        let profile_id = profile["id"].as_str().unwrap().to_string();
        self.publish_instance_listed(&profile);

        let install_req = json!({
          "instanceId": profile_id,
          "provider": req.get("provider").cloned().unwrap_or(json!("modrinth")),
          "projectId": req.get("projectId"),
          "category": category,
          "versionId": version.get("id"),
          "gameVersion": minecraft_version,
          "loaders": if category == "mod" { loader_to_filters(&loader) } else { vec![] }
        });
        match self.install(&install_req).await {
            Ok(_) => {
                self.finish_instance_create_progress(&profile_id, true);
                Ok(profile)
            }
            Err(err) => {
                self.finish_instance_create_progress(&profile_id, false);
                let _ = self.instances.remove(&profile_id);
                Err(err)
            }
        }
    }

    async fn create_instance_from_modpack(
        &self,
        req: &Value,
        project: &Value,
        version: &Value,
    ) -> CoreResult<Value> {
        let project_id = req.get("projectId").and_then(|v| v.as_str()).unwrap_or("");
        let resolved = self
            .modrinth
            .resolve_install(
                project_id,
                "modpack",
                version.get("id").and_then(|v| v.as_str()),
                req.get("gameVersion").and_then(|v| v.as_str()),
                &string_array(req.get("loaders")),
            )
            .await?;
        let session_id = format!("content-mrpack-{project_id}");
        let pack_name = project.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let bytes = match self
            .download_bytes_with_progress(
                &resolved.download_url,
                &session_id,
                pack_name,
                &resolved.file_name,
                project_id,
            )
            .await
        {
            Ok(b) => b,
            Err(err) => {
                self.emit_content_job_finished(
                    &session_id,
                    pack_name,
                    &resolved.file_name,
                    "",
                    project_id,
                    false,
                );
                return Err(err);
            }
        };
        self.emit_content_job_finished(
            &session_id,
            pack_name,
            &resolved.file_name,
            "",
            project_id,
            true,
        );
        let name = req
            .get("instanceName")
            .and_then(|v| v.as_str())
            .filter(|s| !s.trim().is_empty())
            .map(|s| s.to_string())
            .unwrap_or_else(|| {
                project
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Modpack")
                    .to_string()
            });
        self.create_instance_from_mrpack_bytes(
            &bytes,
            &name,
            version
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or(""),
            version
                .get("versionNumber")
                .and_then(|v| v.as_str())
                .unwrap_or(""),
            project
                .get("iconUrl")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            &string_array(version.get("gameVersions")),
            &string_array(version.get("loaders")),
            req.get("gameVersion").and_then(|v| v.as_str()),
        )
        .await
    }

    pub async fn import_mrpack_from_file(&self, file_path: &str) -> CoreResult<Value> {
        let path = Path::new(file_path);
        if path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase())
            != Some("mrpack".into())
        {
            return Err(CoreError::msg(
                "選択したファイルは .mrpack ではありません",
            ));
        }
        let bytes = fs::read(path)?;
        let name = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("imported")
            .to_string();
        self.create_instance_from_mrpack_bytes(
            &bytes,
            &name,
            &Uuid::new_v4().to_string(),
            "imported",
            None,
            &[],
            &[],
            None,
        )
        .await
    }

    #[allow(clippy::too_many_arguments)]
    async fn create_instance_from_mrpack_bytes(
        &self,
        bytes: &[u8],
        pack_name: &str,
        version_id: &str,
        version_number: &str,
        icon_url: Option<String>,
        fallback_game_versions: &[String],
        fallback_loaders: &[String],
        requested_game_version: Option<&str>,
    ) -> CoreResult<Value> {
        // zip 展開は blocking + IO 枠（ランタイム／閲覧を塞がない）
        let _io = self.concurrency.acquire_io(GateClass::Interactive).await;
        let bytes_owned = bytes.to_vec();
        let entries = tokio::task::spawn_blocking(move || unzip_to_entries(&bytes_owned))
            .await
            .map_err(|e| CoreError::msg(e.to_string()))??;
        drop(_io);
        let index = parse_mrpack_index(&entries)?;
        let minecraft_version = requested_game_version
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .or_else(|| minecraft_from_mrpack(&index, fallback_game_versions))
            .ok_or_else(|| CoreError::msg("Minecraft バージョンを特定できません"))?;
        let loader = loader_from_mrpack(&index, fallback_loaders);
        let preferred = loader_version_from_mrpack(&index, &loader);
        let loader_version = self
            .resolve_loader_version(&loader, &minecraft_version, preferred.as_deref())
            .await?;
        let name = index
            .name
            .as_deref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .unwrap_or(pack_name);
        let profile = self.create_seeded_instance(
            name,
            &minecraft_version,
            &loader,
            loader_version.as_deref(),
        )?;
        let profile_id = profile["id"].as_str().unwrap().to_string();
        self.publish_instance_listed(&profile);

        let instance_dir = self.instances.instance_dir(&profile_id);
        if let Err(err) = write_mrpack_overrides(&instance_dir, &entries) {
            self.finish_instance_create_progress(&profile_id, false);
            let _ = self.instances.remove(&profile_id);
            return Err(err);
        }

        let pack_files: Vec<MrpackIndexFile> =
            client_files(&index).into_iter().cloned().collect();
        let mut pack_project_versions: HashMap<String, String> = HashMap::new();
        let mut seed_version_ids: Vec<String> = Vec::new();
        for f in &pack_files {
            let url = f.downloads.first().map(|s| s.as_str()).unwrap_or("");
            let pid = project_id_from_download_url(url, &f.path);
            if pid.starts_with("pack:") {
                continue;
            }
            if let Some(vid) = version_id_from_download_url(url) {
                pack_project_versions.insert(pid, vid.clone());
                if !seed_version_ids.iter().any(|x| x == &vid) {
                    seed_version_ids.push(vid);
                }
            } else {
                pack_project_versions.entry(pid).or_default();
            }
        }
        let project_ids: Vec<String> = pack_project_versions.keys().cloned().collect();
        let metadata = self
            .modrinth
            .get_project_metadata(&project_ids)
            .await
            .unwrap_or_default();

        // バックグラウンドで並列 DL。IPC はすぐ返し、本体 prepare と並行する。
        // 返却後の失敗ではインスタンスを消さない。
        let bg = self.clone_service();
        let pack_name_owned = pack_name.to_string();
        let version_id_owned = version_id.to_string();
        let version_number_owned = version_number.to_string();
        let icon_url_owned = icon_url.clone();
        let profile_id_bg = profile_id.clone();
        let instance_dir_bg = instance_dir.clone();
        let file_count = pack_files.len();
        let metadata = Arc::new(metadata);
        let concurrency = self.content_file_concurrency();
        let minecraft_version_bg = minecraft_version.clone();
        let loader_bg = loader.clone();
        let loaders_bg = loader_to_filters(&loader);

        tokio::spawn(async move {
            let results = stream::iter(pack_files.into_iter().map(|file| {
                let bg = bg.clone_service();
                let profile_id_bg = profile_id_bg.clone();
                let instance_dir_bg = instance_dir_bg.clone();
                let pack_name_owned = pack_name_owned.clone();
                let version_id_owned = version_id_owned.clone();
                let version_number_owned = version_number_owned.clone();
                let icon_url_owned = icon_url_owned.clone();
                let metadata = Arc::clone(&metadata);
                async move {
                    bg.install_mrpack_file(
                        &profile_id_bg,
                        &instance_dir_bg,
                        &file,
                        &pack_name_owned,
                        &version_id_owned,
                        &version_number_owned,
                        icon_url_owned.as_deref(),
                        &metadata,
                    )
                    .await
                }
            }))
            .buffer_unordered(concurrency)
            .collect::<Vec<_>>()
            .await;

            let mut failed = results.iter().filter(|r| r.is_err()).count();
            for result in &results {
                if let Err(err) = result {
                    tracing::error!("mrpack file install failed for {profile_id_bg}: {err}");
                }
            }

            // パック index に無い required 依存（Sodium / Fabric API 等）を補完
            match bg
                .modrinth
                .resolve_missing_required_deps(
                    &seed_version_ids,
                    &pack_project_versions,
                    Some(&minecraft_version_bg),
                    &loaders_bg,
                    Some(&loader_bg),
                )
                .await
            {
                Ok(extras) if !extras.is_empty() => {
                    tracing::info!(
                        "mrpack {pack_name_owned}: installing {} missing required dep(s)",
                        extras.len()
                    );
                    let dep_results = stream::iter(extras.into_iter().map(|resolved| {
                        let bg = bg.clone_service();
                        let profile_id_bg = profile_id_bg.clone();
                        let instance_dir_bg = instance_dir_bg.clone();
                        async move {
                            let dir = instance_dir_bg.join(category_dir(&resolved.category));
                            let _ = tokio::task::spawn_blocking({
                                let dir = dir.clone();
                                move || fs::create_dir_all(dir)
                            })
                            .await;
                            bg.download_and_finalize(&profile_id_bg, &instance_dir_bg, &resolved)
                                .await
                        }
                    }))
                    .buffer_unordered(concurrency)
                    .collect::<Vec<_>>()
                    .await;
                    for result in &dep_results {
                        if let Err(err) = result {
                            tracing::error!(
                                "mrpack dependency install failed for {profile_id_bg}: {err}"
                            );
                            failed += 1;
                        }
                    }
                }
                Ok(_) => {}
                Err(err) => {
                    tracing::warn!("mrpack dependency resolve failed for {profile_id_bg}: {err}");
                }
            }

            bg.finish_instance_create_progress(&profile_id_bg, failed == 0);
            if failed == 0 {
                tracing::info!(
                    "Created instance {profile_id_bg} from mrpack {pack_name_owned}@{version_number_owned}"
                );
            } else {
                tracing::error!(
                    "Instance {profile_id_bg} from mrpack {pack_name_owned}: {failed}/{file_count} file(s) failed"
                );
            }
        });

        tracing::info!(
            "Started instance {profile_id} from mrpack {pack_name}@{version_number} ({file_count} files)"
        );
        Ok(profile)
    }

    #[allow(clippy::too_many_arguments)]
    async fn install_mrpack_file(
        &self,
        instance_id: &str,
        instance_dir: &Path,
        file: &MrpackIndexFile,
        pack_name: &str,
        version_id: &str,
        version_number: &str,
        icon_url: Option<&str>,
        metadata: &HashMap<String, (String, String, Option<String>)>,
    ) -> CoreResult<()> {
        let rel = file.path.replace('\\', "/");
        let dest = safe_instance_path(instance_dir, &rel)
            .ok_or_else(|| CoreError::msg("Invalid mrpack path"))?;
        let download_url = file
            .downloads
            .first()
            .ok_or_else(|| CoreError::msg("mrpack missing download"))?;
        let category = pack_file_category(&rel);
        let file_name = Path::new(&rel)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("file")
            .to_string();
        let project_id = project_id_from_download_url(download_url, &rel);
        let mut entry = to_installed_entry(
            &ResolvedContentFile {
                provider: "modrinth".into(),
                project_id: project_id.clone(),
                version_id: version_id_from_download_url(download_url)
                    .unwrap_or_else(|| version_id.to_string()),
                slug: file_name
                    .rsplit_once('.')
                    .map(|(s, _)| s.to_string())
                    .unwrap_or_else(|| file_name.clone()),
                name: file_name.clone(),
                version_number: version_number.to_string(),
                category: category.clone(),
                file_name: file_name.clone(),
                download_url: download_url.clone(),
                icon_url: icon_url.map(|s| s.to_string()),
                sha1: file.hashes_sha1.clone(),
                sha512: file.hashes_sha512.clone(),
                size: file.file_size,
            },
            false,
        );
        if let Some(env) = &file.env {
            entry
                .as_object_mut()
                .unwrap()
                .insert("env".into(), env.clone());
        }

        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent)?;
        }
        let staging = dest.with_extension(format!("download-{}", Uuid::new_v4()));
        let session_id = format!("content-{instance_id}-{project_id}");
        if let Err(err) = self
            .download_to_file_ua(
                download_url,
                &staging,
                file.hashes_sha1.as_deref(),
                &session_id,
                pack_name,
                &file_name,
                instance_id,
                &project_id,
            )
            .await
        {
            self.emit_content_job_finished(
                &session_id,
                pack_name,
                &file_name,
                instance_id,
                &project_id,
                false,
            );
            return Err(err);
        }
        self.emit_content_job_finished(
            &session_id,
            pack_name,
            &file_name,
            instance_id,
            &project_id,
            true,
        );

        let parent_rel = Path::new(&rel)
            .parent()
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .unwrap_or_default();
        let can_index = parent_rel == category_dir(&category).replace('\\', "/");
        if can_index {
            if let Some((slug, name, icon)) = metadata.get(&project_id) {
                let obj = entry.as_object_mut().unwrap();
                obj.insert("slug".into(), json!(slug));
                obj.insert("name".into(), json!(name));
                obj.insert("iconUrl".into(), json!(icon));
                obj.insert("projectMetadataResolved".into(), json!(true));
            }
            self.finalize_installed(
                instance_id,
                instance_dir,
                "modrinth",
                &project_id,
                &category,
                &file_name,
                entry,
                &staging,
                &dest,
            )?;
        } else {
            let _ = fs::remove_file(&dest);
            fs::rename(&staging, &dest).or_else(|_| {
                fs::copy(&staging, &dest)?;
                fs::remove_file(&staging)?;
                Ok::<(), std::io::Error>(())
            })?;
        }
        Ok(())
    }

    pub async fn list_mrpack_export_candidates(&self, instance_id: &str) -> CoreResult<Value> {
        let profile = self
            .instances
            .get(instance_id)?
            .ok_or_else(|| CoreError::msg(format!("Instance not found: {instance_id}")))?;
        let instance_dir = self.instances.instance_dir(instance_id);
        let index = self.read_index(instance_id)?;
        let mut contents = Vec::new();
        let mut content_paths = HashSet::new();
        for item in &index.items {
            if item.get("category").and_then(|v| v.as_str()) == Some("modpack") {
                continue;
            }
            let category = item.get("category").and_then(|v| v.as_str()).unwrap_or("mod");
            let file_name = item.get("fileName").and_then(|v| v.as_str()).unwrap_or("");
            let rel = format!("{}/{}", category_dir(category), file_name).replace('\\', "/");
            let full = safe_instance_path(&instance_dir, &rel);
            let Some(full) = full else { continue };
            let Ok(meta) = fs::metadata(&full) else { continue };
            content_paths.insert(rel.to_lowercase());
            contents.push(json!({
              "id": item.get("id"),
              "name": item.get("name"),
              "category": category,
              "path": rel,
              "size": meta.len(),
              "defaultSelected": item.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true),
              "indexEligible": item.get("downloadUrl").and_then(|v| v.as_str()).is_some()
            }));
        }
        let mut overrides = Vec::new();
        for rel in list_files_recursive(&instance_dir, "")? {
            let lower = rel.to_lowercase();
            if is_export_excluded(&rel) || content_paths.contains(&lower) {
                continue;
            }
            let full = instance_dir.join(&rel);
            let Ok(meta) = fs::metadata(&full) else { continue };
            let root = rel.split('/').next().unwrap_or(rel.as_str());
            overrides.push(json!({
              "path": rel.replace('\\', "/"),
              "size": meta.len(),
              "defaultSelected": default_selected_export_root(root)
            }));
        }
        overrides.sort_by(|a, b| {
            let ap = a.get("path").and_then(|v| v.as_str()).unwrap_or("");
            let bp = b.get("path").and_then(|v| v.as_str()).unwrap_or("");
            ap.cmp(bp)
        });
        Ok(json!({
          "name": profile.get("name"),
          "summary": profile.get("notes").and_then(|v| v.as_str()).filter(|s| !s.trim().is_empty()).map(|s| s.to_string())
            .unwrap_or_else(|| format!("{} exported by Fledge", profile.get("name").and_then(|v| v.as_str()).unwrap_or("Instance"))),
          "contents": contents,
          "overrides": overrides
        }))
    }

    pub async fn list_mrpack_export_dir(
        &self,
        instance_id: &str,
        relative_path: &str,
    ) -> CoreResult<Value> {
        let _profile = self
            .instances
            .get(instance_id)?
            .ok_or_else(|| CoreError::msg(format!("Instance not found: {instance_id}")))?;
        let instance_dir = self.instances.instance_dir(instance_id);
        let normalized = relative_path
            .replace('\\', "/")
            .trim_matches('/')
            .to_string();
        if normalized.contains("..")
            || (!normalized.is_empty() && is_export_excluded(&normalized))
        {
            return Err(CoreError::msg("Invalid export path"));
        }
        let dir = if normalized.is_empty() {
            instance_dir.clone()
        } else {
            instance_dir.join(&normalized)
        };
        let Ok(read) = fs::read_dir(&dir) else {
            return Ok(json!({ "path": normalized, "entries": [] }));
        };
        let mut entries = Vec::new();
        for entry in read.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            let child = if normalized.is_empty() {
                name.clone()
            } else {
                format!("{normalized}/{name}")
            };
            let child_norm = child.replace('\\', "/");
            if is_export_excluded(&child_norm) {
                continue;
            }
            if name.eq_ignore_ascii_case(".fledge") || name.eq_ignore_ascii_case("profile.json") {
                continue;
            }
            if normalized.is_empty() && regex_icon(&name) {
                continue;
            }
            let Ok(ft) = entry.file_type() else { continue };
            let Ok(meta) = entry.metadata() else { continue };
            let kind = if ft.is_dir() { "directory" } else { "file" };
            let root_name = if normalized.is_empty() {
                name.as_str()
            } else {
                normalized.split('/').next().unwrap_or(name.as_str())
            };
            let mtime_ms = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as f64)
                .unwrap_or(0.0);
            entries.push(json!({
              "name": name,
              "path": child_norm,
              "kind": kind,
              "size": if ft.is_dir() { 0 } else { meta.len() },
              "mtimeMs": mtime_ms,
              "defaultSelected": default_selected_export_root(root_name)
            }));
        }
        entries.sort_by(|a, b| {
            let ak = a.get("kind").and_then(|v| v.as_str()).unwrap_or("");
            let bk = b.get("kind").and_then(|v| v.as_str()).unwrap_or("");
            match (ak, bk) {
                ("directory", "file") => std::cmp::Ordering::Less,
                ("file", "directory") => std::cmp::Ordering::Greater,
                _ => {
                    let an = a.get("name").and_then(|v| v.as_str()).unwrap_or("");
                    let bn = b.get("name").and_then(|v| v.as_str()).unwrap_or("");
                    an.to_lowercase().cmp(&bn.to_lowercase())
                }
            }
        });
        Ok(json!({ "path": normalized, "entries": entries }))
    }

    pub async fn export_mrpack(
        &self,
        instance_id: &str,
        destination: &str,
        options: Option<&Value>,
    ) -> CoreResult<()> {
        let profile = self
            .instances
            .get(instance_id)?
            .ok_or_else(|| CoreError::msg(format!("Instance not found: {instance_id}")))?;
        let instance_dir = self.instances.instance_dir(instance_id);
        let index = self.read_index(instance_id)?;
        let mut zip_entries: HashMap<String, Vec<u8>> = HashMap::new();
        let mut pack_files = Vec::new();
        let mut referenced = HashSet::new();

        let selected_content: Option<HashSet<String>> = options.and_then(|o| {
            o.get("contentIds")
                .and_then(|v| v.as_array())
                .map(|a| {
                    a.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
        });
        let selected_overrides: Option<HashSet<String>> = options.and_then(|o| {
            o.get("overridePaths")
                .and_then(|v| v.as_array())
                .map(|a| {
                    a.iter()
                        .filter_map(|v| v.as_str().map(|s| s.replace('\\', "/").to_lowercase()))
                        .collect()
                })
        });

        for item in &index.items {
            let id = item.get("id").and_then(|v| v.as_str()).unwrap_or("");
            if let Some(sel) = &selected_content {
                if !sel.contains(id) {
                    continue;
                }
            } else if item.get("enabled").and_then(|v| v.as_bool()) == Some(false) {
                continue;
            }
            let category = item.get("category").and_then(|v| v.as_str()).unwrap_or("mod");
            if category == "modpack" {
                continue;
            }
            let file_name = item.get("fileName").and_then(|v| v.as_str()).unwrap_or("");
            let rel = format!("{}/{}", category_dir(category), file_name).replace('\\', "/");
            let Some(full) = safe_instance_path(&instance_dir, &rel) else {
                continue;
            };
            let Ok(data) = fs::read(&full) else { continue };
            let download_url = item.get("downloadUrl").and_then(|v| v.as_str());
            if let Some(url) = download_url {
                let (sha1, sha512) = file_hashes(&data);
                pack_files.push(json!({
                  "path": rel,
                  "hashes": { "sha1": sha1, "sha512": sha512 },
                  "env": item.get("env").cloned().unwrap_or(json!({"client":"required","server":"required"})),
                  "downloads": [url],
                  "fileSize": data.len()
                }));
                referenced.insert(rel.to_lowercase());
            } else {
                zip_entries.insert(format!("overrides/{rel}"), data);
                referenced.insert(rel.to_lowercase());
            }
        }

        for rel_native in list_files_recursive(&instance_dir, "")? {
            let rel = rel_native.replace('\\', "/");
            let lower = rel.to_lowercase();
            if is_export_excluded(&rel) || referenced.contains(&lower) {
                continue;
            }
            if let Some(sel) = &selected_overrides {
                if !is_export_path_selected(&rel, sel) {
                    continue;
                }
            } else if options.is_some() {
                continue;
            }
            if let Ok(data) = fs::read(instance_dir.join(&rel_native)) {
                zip_entries.insert(format!("overrides/{rel}"), data);
            }
        }

        let mut dependencies = json!({ "minecraft": profile.get("minecraftVersion") });
        let loader = profile.get("loader").and_then(|v| v.as_str()).unwrap_or("vanilla");
        if loader != "vanilla" {
            if let Some(lv) = profile.get("loaderVersion").and_then(|v| v.as_str()) {
                let key = match loader {
                    "fabric" => "fabric-loader",
                    "quilt" => "quilt-loader",
                    other => other,
                };
                dependencies
                    .as_object_mut()
                    .unwrap()
                    .insert(key.into(), json!(lv));
            }
        }
        let version_id = options
            .and_then(|o| o.get("versionId"))
            .and_then(|v| v.as_str())
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .unwrap_or("1.0.0");
        let mrpack_index = json!({
          "formatVersion": 1,
          "game": "minecraft",
          "versionId": version_id,
          "name": options.and_then(|o| o.get("name")).and_then(|v| v.as_str()).filter(|s| !s.trim().is_empty())
            .map(|s| s.to_string())
            .unwrap_or_else(|| profile.get("name").and_then(|v| v.as_str()).unwrap_or("modpack").to_string()),
          "summary": options.and_then(|o| o.get("summary")).and_then(|v| v.as_str()).filter(|s| !s.trim().is_empty())
            .map(|s| s.to_string())
            .or_else(|| profile.get("notes").and_then(|v| v.as_str()).map(|s| s.to_string()))
            .unwrap_or_else(|| format!("{} exported by Fledge", profile.get("name").and_then(|v| v.as_str()).unwrap_or("Instance"))),
          "files": pack_files,
          "dependencies": dependencies
        });
        zip_entries.insert(
            "modrinth.index.json".into(),
            serde_json::to_vec_pretty(&mrpack_index)?,
        );
        write_zip_entries(Path::new(destination), &zip_entries)
    }

    pub fn set_enabled(
        &self,
        instance_id: &str,
        entry_id: &str,
        enabled: bool,
    ) -> CoreResult<Value> {
        let index_lock = self.lock_index(instance_id);
        let _guard = index_lock.lock();
        let mut index = self.read_index(instance_id)?;
        let entry = index
            .items
            .iter_mut()
            .find(|i| i.get("id").and_then(|v| v.as_str()) == Some(entry_id))
            .ok_or_else(|| CoreError::msg("Content entry not found"))?;
        if entry.get("enabled").and_then(|v| v.as_bool()) == Some(enabled) {
            return Ok(entry.clone());
        }
        let category = entry
            .get("category")
            .and_then(|v| v.as_str())
            .unwrap_or("mod")
            .to_string();
        let file_name = entry
            .get("fileName")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let dir = self
            .instances
            .instance_dir(instance_id)
            .join(category_dir(&category));
        let active = dir.join(&file_name);
        let disabled = PathBuf::from(format!("{}.disabled", active.display()));
        if enabled {
            if disabled.exists() {
                let _ = fs::rename(&disabled, &active);
            }
        } else if active.exists() {
            let _ = fs::rename(&active, &disabled);
        }
        entry
            .as_object_mut()
            .unwrap()
            .insert("enabled".into(), json!(enabled));
        let out = entry.clone();
        self.write_index(instance_id, &index)?;
        Ok(out)
    }

    pub fn remove(&self, instance_id: &str, entry_id: &str) -> CoreResult<()> {
        let index_lock = self.lock_index(instance_id);
        let _guard = index_lock.lock();
        let mut index = self.read_index(instance_id)?;
        let Some(pos) = index
            .items
            .iter()
            .position(|i| i.get("id").and_then(|v| v.as_str()) == Some(entry_id))
        else {
            return Ok(());
        };
        let entry = index.items.remove(pos);
        let category = entry
            .get("category")
            .and_then(|v| v.as_str())
            .unwrap_or("mod");
        let file_name = entry.get("fileName").and_then(|v| v.as_str()).unwrap_or("");
        let enabled = entry
            .get("enabled")
            .and_then(|v| v.as_bool())
            .unwrap_or(true);
        let path = self
            .instances
            .instance_dir(instance_id)
            .join(category_dir(category))
            .join(file_name);
        delete_file_quiet(&path, enabled);
        self.write_index(instance_id, &index)?;
        Ok(())
    }

    pub async fn check_updates(&self, instance_id: &str) -> CoreResult<Value> {
        let profile = self
            .instances
            .get(instance_id)?
            .ok_or_else(|| CoreError::msg(format!("Instance not found: {instance_id}")))?;
        let mut index = self.read_index(instance_id)?;
        let loaders = loader_to_filters(
            profile
                .get("loader")
                .and_then(|v| v.as_str())
                .unwrap_or("vanilla"),
        );
        let game_version = profile.get("minecraftVersion").and_then(|v| v.as_str());
        for entry in &mut index.items {
            let provider = entry.get("provider").and_then(|v| v.as_str()).unwrap_or("");
            if provider != "modrinth" {
                entry
                    .as_object_mut()
                    .unwrap()
                    .insert("updateAvailable".into(), json!(false));
                continue;
            }
            let project_id = entry
                .get("projectId")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let version_id = entry
                .get("versionId")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let category = entry
                .get("category")
                .and_then(|v| v.as_str())
                .unwrap_or("mod");
            let entry_loaders = if category == "mod" {
                loaders.clone()
            } else {
                vec![]
            };
            match self
                .modrinth
                .find_update(project_id, version_id, category, game_version, &entry_loaders)
                .await
            {
                Ok(Some((vid, vnum))) => {
                    let obj = entry.as_object_mut().unwrap();
                    obj.insert("updateAvailable".into(), json!(true));
                    obj.insert("latestVersionId".into(), json!(vid));
                    obj.insert("latestVersionNumber".into(), json!(vnum));
                    obj.insert("latestVersionType".into(), json!("release"));
                }
                _ => {
                    let obj = entry.as_object_mut().unwrap();
                    obj.insert("updateAvailable".into(), json!(false));
                    obj.remove("latestVersionId");
                    obj.remove("latestVersionNumber");
                    obj.remove("latestVersionType");
                }
            }
        }
        let index_lock = self.lock_index(instance_id);
        let _guard = index_lock.lock();
        self.write_index(instance_id, &index)?;
        Ok(Value::Array(index.items))
    }

    pub fn list_media(&self, instance_id: &str, kind: &str) -> CoreResult<Value> {
        let dir = self.instances.instance_dir(instance_id).join(kind);
        let Ok(entries) = fs::read_dir(&dir) else {
            return Ok(json!([]));
        };
        let mut items = Vec::new();
        for entry in entries.flatten() {
            let Ok(ft) = entry.file_type() else { continue };
            if !ft.is_file() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().into_owned();
            if kind == "screenshots"
                && !name
                    .to_ascii_lowercase()
                    .ends_with(".png")
                && ![".jpg", ".jpeg", ".webp", ".gif"]
                    .iter()
                    .any(|e| name.to_ascii_lowercase().ends_with(e))
            {
                continue;
            }
            let Ok(meta) = entry.metadata() else { continue };
            let mtime = meta
                .modified()
                .ok()
                .map(|t| {
                    let dt: chrono::DateTime<chrono::Utc> = t.into();
                    dt.to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
                });
            items.push(json!({
              "name": name,
              "path": entry.path().to_string_lossy(),
              "mtime": mtime,
              "size": meta.len()
            }));
        }
        items.sort_by(|a, b| {
            let ap = a.get("mtime").and_then(|v| v.as_str()).unwrap_or("");
            let bp = b.get("mtime").and_then(|v| v.as_str()).unwrap_or("");
            bp.cmp(ap)
        });
        Ok(Value::Array(items))
    }

    pub fn resolve_screenshot_path(&self, instance_id: &str, file_name: &str) -> CoreResult<PathBuf> {
        let base = Path::new(file_name)
            .file_name()
            .and_then(|s| s.to_str())
            .ok_or_else(|| CoreError::msg("Invalid screenshot file name"))?;
        if base != file_name.replace('\\', "/").rsplit('/').next().unwrap_or("") {
            return Err(CoreError::msg("Invalid screenshot file name"));
        }
        if base.contains('\0') || base == "." || base == ".." {
            return Err(CoreError::msg("Invalid screenshot file name"));
        }
        let lower = base.to_ascii_lowercase();
        if ![".png", ".jpg", ".jpeg", ".webp", ".gif"]
            .iter()
            .any(|e| lower.ends_with(e))
        {
            return Err(CoreError::msg("Invalid screenshot file name"));
        }
        let dir = self
            .instances
            .instance_dir(instance_id)
            .join("screenshots");
        let full = dir.join(base);
        Ok(full)
    }

    /// ゲーム起動中でも読めるよう共有モードで開き、data URL を返す。
    pub fn read_screenshot_data_url(
        &self,
        instance_id: &str,
        file_name: &str,
    ) -> CoreResult<Value> {
        let full = self.resolve_screenshot_path(instance_id, file_name)?;
        if !full.is_file() {
            return Ok(Value::Null);
        }
        let bytes = read_bytes_shared(&full).map_err(|e| CoreError::msg(e.to_string()))?;
        let ext = full
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        let mime = match ext.as_str() {
            "jpg" | "jpeg" => "image/jpeg",
            "webp" => "image/webp",
            "gif" => "image/gif",
            _ => "image/png",
        };
        Ok(Value::String(format!(
            "data:{mime};base64,{}",
            B64.encode(bytes)
        )))
    }

    pub fn delete_media(&self, instance_id: &str, kind: &str, file_name: &str) -> CoreResult<()> {
        if kind != "screenshots" {
            return Err(CoreError::msg("Unsupported media kind"));
        }
        let full = self.resolve_screenshot_path(instance_id, file_name)?;
        fs::remove_file(full)?;
        Ok(())
    }

    pub fn read_log_file(&self, instance_id: &str, file_name: &str) -> CoreResult<Value> {
        let base = Path::new(file_name)
            .file_name()
            .and_then(|s| s.to_str())
            .ok_or_else(|| CoreError::msg("Invalid log file name"))?;
        let logs_dir = self.instances.instance_dir(instance_id).join("logs");
        let full = logs_dir.join(base);
        let max = 512 * 1024;
        let bytes = if base.ends_with(".gz") {
            let file = fs::File::open(&full)?;
            let mut decoder = flate2::read::GzDecoder::new(file);
            let mut buf = Vec::new();
            decoder.read_to_end(&mut buf)?;
            buf
        } else {
            fs::read(&full)?
        };
        let truncated = bytes.len() > max;
        let slice = if truncated {
            &bytes[bytes.len() - max..]
        } else {
            &bytes[..]
        };
        let text = String::from_utf8_lossy(slice).into_owned();
        Ok(json!({
          "name": base,
          "text": text,
          "truncated": truncated
        }))
    }

    fn create_seeded_instance(
        &self,
        name: &str,
        minecraft_version: &str,
        loader: &str,
        loader_version: Option<&str>,
    ) -> CoreResult<Value> {
        let settings = self.settings.get()?;
        let memory_max = settings
            .get("defaultMemoryMaxMb")
            .and_then(|v| v.as_u64());
        let jvm_args: Vec<String> = settings
            .get("defaultJvmArgs")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();
        let mut input = json!({
          "name": name,
          "minecraftVersion": minecraft_version,
          "loader": loader,
          "memoryMaxMb": memory_max.unwrap_or(4096),
          "jvmArgs": jvm_args
        });
        if let Some(lv) = loader_version {
            input
                .as_object_mut()
                .unwrap()
                .insert("loaderVersion".into(), json!(lv));
        }
        let profile = self.instances.create(
            &input,
            CreateDefaults {
                memory_max_mb: memory_max,
                jvm_args: &jvm_args,
                seed_minecraft_initial_settings: true,
                pending_minecraft_options: json!({}),
                pending_minecraft_debug_overlay: json!({}),
            },
        )?;
        let id = profile["id"].as_str().unwrap().to_string();
        let selected = settings.get("selectedInstanceId").cloned();
        let mut order = settings
            .get("libraryInstanceOrder")
            .and_then(|v| v.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        if !order.contains(&id) {
            order.push(id.clone());
        }
        let mut patch = json!({ "libraryInstanceOrder": order });
        if selected.is_none() || selected.as_ref().is_some_and(|v| v.is_null()) {
            patch
                .as_object_mut()
                .unwrap()
                .insert("selectedInstanceId".into(), json!(id));
        }
        self.settings.set(patch)?;
        Ok(profile)
    }

    async fn resolve_loader_version(
        &self,
        loader: &str,
        minecraft_version: &str,
        preferred: Option<&str>,
    ) -> CoreResult<Option<String>> {
        if loader == "vanilla" {
            return Ok(None);
        }
        if let Some(p) = preferred.map(|s| s.trim()).filter(|s| !s.is_empty()) {
            return Ok(Some(p.to_string()));
        }
        let list = self
            .versions
            .list_loader_versions(loader, minecraft_version, false)
            .await?;
        let versions = list.versions;
        let preferred_entry = versions
            .iter()
            .find(|v| v.recommended == Some(true))
            .or_else(|| versions.iter().find(|v| v.stable == Some(true)))
            .or_else(|| versions.first());
        Ok(preferred_entry.map(|v| v.id.clone()))
    }

    fn publish_instance_listed(&self, profile: &Value) {
        let id = profile.get("id").and_then(|v| v.as_str()).unwrap_or("");
        self.events.emit_progress(ProgressEvent {
            scope: "download".into(),
            kind: Some("content".into()),
            job_id: Some(format!("instance-create-{id}")),
            session_id: Some(format!("instance-create-{id}")),
            current: 0.0,
            total: 1.0,
            percent: None,
            bytes_per_second: None,
            message_key: Some("content.creatingInstance".into()),
            status: Some("active".into()),
            meta: Some(json!({
              "instanceId": id,
              "projectName": profile.get("name"),
              "instanceReady": true
            })),
        });
    }

    fn finish_instance_create_progress(&self, profile_id: &str, ok: bool) {
        self.events.emit_progress(ProgressEvent {
            scope: "download".into(),
            kind: Some("content".into()),
            job_id: Some(format!("instance-create-{profile_id}")),
            session_id: Some(format!("instance-create-{profile_id}")),
            current: 1.0,
            total: 1.0,
            percent: Some(100.0),
            bytes_per_second: None,
            message_key: Some("content.creatingInstance".into()),
            status: Some(if ok { "completed" } else { "failed" }.into()),
            meta: Some(json!({ "instanceId": profile_id, "instanceReady": true })),
        });
    }

    async fn download_and_finalize(
        &self,
        instance_id: &str,
        instance_dir: &Path,
        resolved: &ResolvedContentFile,
    ) -> CoreResult<Value> {
        let dest_dir = instance_dir.join(category_dir(&resolved.category));
        {
            let dir = dest_dir.clone();
            tokio::task::spawn_blocking(move || fs::create_dir_all(dir))
                .await
                .map_err(|e| CoreError::msg(e.to_string()))??;
        }
        let dest_path = dest_dir.join(&resolved.file_name);
        let staging = dest_path.with_extension(format!("download-{}", Uuid::new_v4()));
        let entry = to_installed_entry(resolved, true);
        let session_id = format!("content-{instance_id}-{}", resolved.project_id);
        let result = self
            .download_to_file_ua(
                &resolved.download_url,
                &staging,
                resolved.sha1.as_deref(),
                &session_id,
                &resolved.name,
                &resolved.file_name,
                instance_id,
                &resolved.project_id,
            )
            .await;
        if let Err(err) = result {
            self.emit_content_job_finished(
                &session_id,
                &resolved.name,
                &resolved.file_name,
                instance_id,
                &resolved.project_id,
                false,
            );
            return Err(err);
        }
        // 配置（rename / index）は IO 枠で直列化し、閲覧 UI へのディスク負荷を抑える
        let _io = self.concurrency.acquire_io(GateClass::Interactive).await;
        let finalize = {
            let service = self.clone_service();
            let instance_id = instance_id.to_string();
            let instance_dir = instance_dir.to_path_buf();
            let provider = resolved.provider.clone();
            let project_id = resolved.project_id.clone();
            let category = resolved.category.clone();
            let file_name = resolved.file_name.clone();
            let entry_clone = entry.clone();
            let staging = staging.clone();
            let dest_path = dest_path.clone();
            tokio::task::spawn_blocking(move || {
                service.finalize_installed(
                    &instance_id,
                    &instance_dir,
                    &provider,
                    &project_id,
                    &category,
                    &file_name,
                    entry_clone,
                    &staging,
                    &dest_path,
                )
            })
            .await
            .map_err(|e| CoreError::msg(e.to_string()))?
        };
        drop(_io);
        if let Err(err) = finalize {
            self.emit_content_job_finished(
                &session_id,
                &resolved.name,
                &resolved.file_name,
                instance_id,
                &resolved.project_id,
                false,
            );
            return Err(err);
        }
        self.emit_content_job_finished(
            &session_id,
            &resolved.name,
            &resolved.file_name,
            instance_id,
            &resolved.project_id,
            true,
        );
        Ok(entry)
    }

    #[allow(clippy::too_many_arguments)]
    fn emit_content_job_progress(
        &self,
        session_id: &str,
        name: &str,
        file: &str,
        instance_id: &str,
        project_id: &str,
        current: f64,
        total: f64,
        percent: Option<f64>,
        status: &str,
    ) {
        self.events.emit_progress(ProgressEvent {
            scope: "download".into(),
            kind: Some("content".into()),
            session_id: Some(session_id.into()),
            job_id: Some(session_id.into()),
            current,
            total,
            percent,
            bytes_per_second: None,
            message_key: Some("content.downloading".into()),
            status: Some(status.into()),
            meta: Some(json!({
              "name": name,
              "file": file,
              "instanceId": instance_id,
              "projectId": project_id,
            })),
        });
    }

    fn emit_content_job_finished(
        &self,
        session_id: &str,
        name: &str,
        file: &str,
        instance_id: &str,
        project_id: &str,
        ok: bool,
    ) {
        self.events.emit_progress(ProgressEvent {
            scope: "download".into(),
            kind: Some("content".into()),
            session_id: Some(session_id.into()),
            job_id: Some(session_id.into()),
            current: 1.0,
            total: 1.0,
            percent: Some(100.0),
            bytes_per_second: None,
            message_key: Some(
                if ok {
                    "content.installed"
                } else {
                    "content.installFailed"
                }
                .into(),
            ),
            status: Some(if ok { "completed" } else { "failed" }.into()),
            meta: Some(json!({
              "name": name,
              "file": file,
              "instanceId": instance_id,
              "projectId": project_id,
            })),
        });
    }

    #[allow(clippy::too_many_arguments)]
    async fn download_to_file_ua(
        &self,
        url: &str,
        dest: &Path,
        expected_sha1: Option<&str>,
        session_id: &str,
        name: &str,
        file: &str,
        instance_id: &str,
        project_id: &str,
    ) -> CoreResult<()> {
        let events = Arc::clone(&self.events);
        let session_id_owned = session_id.to_string();
        let name_owned = name.to_string();
        let file_owned = file.to_string();
        let instance_id_owned = instance_id.to_string();
        let project_id_owned = project_id.to_string();
        let mut last_emit = std::time::Instant::now()
            .checked_sub(PROGRESS_EMIT_INTERVAL)
            .unwrap_or_else(std::time::Instant::now);

        stream_download_to_file(
            content_http_client(),
            url,
            dest,
            expected_sha1,
            Some(&self.concurrency),
            GateClass::Interactive,
            |current, total| {
                if last_emit.elapsed() < PROGRESS_EMIT_INTERVAL && current + 1 < total {
                    return;
                }
                last_emit = std::time::Instant::now();
                let percent = if total > 0 {
                    Some((current as f64 / total as f64) * 100.0)
                } else {
                    None
                };
                events.emit_progress(ProgressEvent {
                    scope: "download".into(),
                    kind: Some("content".into()),
                    session_id: Some(session_id_owned.clone()),
                    job_id: Some(session_id_owned.clone()),
                    current: current as f64,
                    total: total as f64,
                    percent,
                    bytes_per_second: None,
                    message_key: Some("content.downloading".into()),
                    status: Some("active".into()),
                    meta: Some(json!({
                      "name": name_owned,
                      "file": file_owned,
                      "instanceId": instance_id_owned,
                      "projectId": project_id_owned,
                    })),
                });
            },
        )
        .await
    }

    async fn download_bytes_with_progress(
        &self,
        url: &str,
        session_id: &str,
        name: &str,
        file: &str,
        project_id: &str,
    ) -> CoreResult<Vec<u8>> {
        let _fetch = self.concurrency.acquire_fetch(GateClass::Interactive).await;
        let response = content_http_client()
            .get(url)
            .send()
            .await
            .map_err(|e| CoreError::msg(e.to_string()))?
            .error_for_status()
            .map_err(|e| CoreError::msg(e.to_string()))?;
        let total = response.content_length().unwrap_or(0) as f64;
        let mut stream = response.bytes_stream();
        let mut buf = Vec::new();
        let mut current = 0f64;
        let mut last_emit = std::time::Instant::now()
            .checked_sub(PROGRESS_EMIT_INTERVAL)
            .unwrap_or_else(std::time::Instant::now);
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| CoreError::msg(e.to_string()))?;
            current += chunk.len() as f64;
            buf.extend_from_slice(&chunk);
            let at_end = total > 0.0 && current >= total;
            if at_end || last_emit.elapsed() >= PROGRESS_EMIT_INTERVAL {
                last_emit = std::time::Instant::now();
                self.emit_content_job_progress(
                    session_id,
                    name,
                    file,
                    "",
                    project_id,
                    current,
                    if total > 0.0 { total } else { current },
                    if total > 0.0 {
                        Some((current / total) * 100.0)
                    } else {
                        None
                    },
                    "active",
                );
            }
        }
        Ok(buf)
    }

    #[allow(clippy::too_many_arguments)]
    fn finalize_installed(
        &self,
        instance_id: &str,
        instance_dir: &Path,
        provider: &str,
        project_id: &str,
        category: &str,
        file_name: &str,
        entry: Value,
        staging: &Path,
        dest: &Path,
    ) -> CoreResult<()> {
        let index_lock = self.lock_index(instance_id);
        let _guard = index_lock.lock();
        if self.instances.get(instance_id)?.is_none() {
            let _ = fs::remove_file(staging);
            return Ok(());
        }
        let mut index = self.read_index(instance_id)?;
        let previous: Vec<Value> = index
            .items
            .iter()
            .filter(|i| {
                i.get("provider").and_then(|v| v.as_str()) == Some(provider)
                    && i.get("projectId").and_then(|v| v.as_str()) == Some(project_id)
            })
            .cloned()
            .collect();
        for old in &previous {
            let old_cat = old.get("category").and_then(|v| v.as_str()).unwrap_or(category);
            let old_file = old.get("fileName").and_then(|v| v.as_str()).unwrap_or("");
            let enabled = old.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true);
            delete_file_quiet(
                &instance_dir.join(category_dir(old_cat)).join(old_file),
                enabled,
            );
            index.items.retain(|i| {
                i.get("id").and_then(|v| v.as_str()) != old.get("id").and_then(|v| v.as_str())
            });
        }
        let _ = fs::remove_file(dest);
        fs::rename(staging, dest).or_else(|_| {
            fs::copy(staging, dest)?;
            fs::remove_file(staging)?;
            Ok::<(), std::io::Error>(())
        })?;
        let _ = file_name;
        index.items.push(entry);
        self.write_index(instance_id, &index)?;
        Ok(())
    }

    fn lock_index(&self, instance_id: &str) -> Arc<Mutex<()>> {
        let mut map = self.index_locks.lock();
        map.entry(instance_id.to_string())
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone()
    }

    fn index_path(&self, instance_id: &str) -> PathBuf {
        self.instances
            .instance_dir(instance_id)
            .join(INDEX_DIR)
            .join(INDEX_FILE)
    }

    fn read_index(&self, instance_id: &str) -> CoreResult<IndexFile> {
        let path = self.index_path(instance_id);
        match fs::read_to_string(&path) {
            Ok(raw) => {
                let parsed: Value = serde_json::from_str(&raw)?;
                let items = parsed
                    .get("items")
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default();
                Ok(IndexFile { items })
            }
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(IndexFile { items: vec![] }),
            Err(err) => Err(err.into()),
        }
    }

    fn write_index(&self, instance_id: &str, index: &IndexFile) -> CoreResult<()> {
        let path = self.index_path(instance_id);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let data = json!({ "items": index.items });
        fs::write(path, serde_json::to_string_pretty(&data)?)?;
        Ok(())
    }
}

struct IndexFile {
    items: Vec<Value>,
}

/// Windows ではゲーム等がファイルを掴んでいても読めるよう共有モードで開く。
fn read_bytes_shared(path: &Path) -> std::io::Result<Vec<u8>> {
    #[cfg(windows)]
    {
        use std::fs::OpenOptions;
        use std::os::windows::fs::OpenOptionsExt;
        // FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE
        let mut file = OpenOptions::new()
            .read(true)
            .share_mode(0x0000_0007)
            .open(path)?;
        let mut buf = Vec::new();
        file.read_to_end(&mut buf)?;
        Ok(buf)
    }
    #[cfg(not(windows))]
    {
        fs::read(path)
    }
}

fn category_dir(category: &str) -> String {
    match category {
        "mod" => "mods".into(),
        "resourcepack" => "resourcepacks".into(),
        "shader" => "shaderpacks".into(),
        "plugin" => "plugins".into(),
        "datapack" => "world/datapacks".into(),
        _ => "mods".into(),
    }
}

/// 拡張子と zip 内構造からカテゴリを推定する。
fn detect_local_content_category(path: &Path) -> Option<String> {
    let name = path.file_name()?.to_str()?.to_lowercase();
    if name.ends_with(".mrpack") {
        return Some("modpack".into());
    }
    if name.ends_with(".jar") {
        return Some("mod".into());
    }
    if !name.ends_with(".zip") {
        return None;
    }
    let file = fs::File::open(path).ok()?;
    let mut archive = ZipArchive::new(file).ok()?;
    let mut has_pack_mcmeta = false;
    let mut has_shaders = false;
    let mut has_data = false;
    let mut has_assets = false;
    for i in 0..archive.len() {
        let Ok(entry) = archive.by_index(i) else { continue };
        let n = entry.name().replace('\\', "/").to_lowercase();
        if n == "pack.mcmeta" || n.ends_with("/pack.mcmeta") {
            has_pack_mcmeta = true;
        }
        if n.starts_with("shaders/") || n.contains("/shaders/") {
            has_shaders = true;
        }
        if n.starts_with("data/") || n.contains("/data/") {
            has_data = true;
        }
        if n.starts_with("assets/") || n.contains("/assets/") {
            has_assets = true;
        }
    }
    if has_shaders {
        return Some("shader".into());
    }
    if has_data && has_pack_mcmeta && !has_assets {
        return Some("datapack".into());
    }
    if has_pack_mcmeta || has_assets {
        return Some("resourcepack".into());
    }
    // 不明な zip はリソースパックとして扱う（よくある配布形式）
    Some("resourcepack".into())
}

fn loader_to_filters(loader: &str) -> Vec<String> {
    match loader {
        "fabric" => vec!["fabric".into()],
        "forge" => vec!["forge".into()],
        "neoforge" => vec!["neoforge".into()],
        "quilt" => vec!["quilt".into()],
        _ => vec![],
    }
}

fn pick_loader(loaders: &[String]) -> String {
    let set: HashSet<_> = loaders.iter().map(|s| s.to_lowercase()).collect();
    if set.contains("fabric") {
        "fabric".into()
    } else if set.contains("quilt") {
        "quilt".into()
    } else if set.contains("neoforge") {
        "neoforge".into()
    } else if set.contains("forge") {
        "forge".into()
    } else {
        "vanilla".into()
    }
}

fn to_installed_entry(resolved: &ResolvedContentFile, meta_resolved: bool) -> Value {
    json!({
      "id": Uuid::new_v4().to_string(),
      "provider": resolved.provider,
      "projectId": resolved.project_id,
      "versionId": resolved.version_id,
      "slug": resolved.slug,
      "name": resolved.name,
      "versionNumber": resolved.version_number,
      "category": resolved.category,
      "fileName": resolved.file_name,
      "iconUrl": resolved.icon_url,
      "downloadUrl": resolved.download_url,
      "sha1": resolved.sha1,
      "sha512": resolved.sha512,
      "fileSize": resolved.size,
      "projectMetadataResolved": meta_resolved,
      "enabled": true,
      "installedAt": chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
      "updateAvailable": false
    })
}

fn string_array(v: Option<&Value>) -> Vec<String> {
    v.and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default()
}

fn delete_file_quiet(path: &Path, enabled: bool) {
    let target = if enabled {
        path.to_path_buf()
    } else {
        PathBuf::from(format!("{}.disabled", path.display()))
    };
    let _ = fs::remove_file(target);
}

fn file_hashes(data: &[u8]) -> (String, String) {
    let mut h1 = Sha1::new();
    h1.update(data);
    let mut h512 = Sha512::new();
    h512.update(data);
    (hex::encode(h1.finalize()), hex::encode(h512.finalize()))
}

fn is_export_excluded(rel: &str) -> bool {
    let normalized = rel.replace('\\', "/");
    let lower = normalized.to_lowercase();
    let root = normalized
        .split('/')
        .next()
        .unwrap_or("")
        .to_lowercase();
    normalized == "profile.json"
        || regex_icon(&normalized)
        || EXPORT_EXCLUDED.contains(&root.as_str())
        || lower.ends_with(".disabled")
}

fn is_export_path_selected(rel: &str, selected: &HashSet<String>) -> bool {
    let lower = rel.replace('\\', "/").to_lowercase();
    for sel_raw in selected {
        let sel = sel_raw.trim_end_matches('/').to_lowercase();
        if sel.is_empty() {
            continue;
        }
        if lower == sel || lower.starts_with(&format!("{sel}/")) {
            return true;
        }
    }
    false
}

fn default_selected_export_root(name: &str) -> bool {
    let lower = name.to_lowercase();
    if EXPORT_DEFAULT_UNSELECTED.contains(&lower.as_str()) {
        return false;
    }
    EXPORT_DEFAULT_SELECTED.contains(&lower.as_str())
}

fn regex_icon(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.starts_with("icon.") && !lower.contains('/')
}

fn list_files_recursive(root: &Path, rel: &str) -> CoreResult<Vec<String>> {
    let dir = if rel.is_empty() {
        root.to_path_buf()
    } else {
        root.join(rel)
    };
    let Ok(entries) = fs::read_dir(&dir) else {
        return Ok(vec![]);
    };
    let mut files = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let child = if rel.is_empty() {
            name.clone()
        } else {
            format!("{rel}/{name}").replace('\\', "/")
        };
        let Ok(ft) = entry.file_type() else { continue };
        if ft.is_dir() {
            files.extend(list_files_recursive(root, &child)?);
        } else if ft.is_file() {
            files.push(child);
        }
    }
    Ok(files)
}

