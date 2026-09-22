//! Content install / media / mrpack — Modrinth-only, matching 0.4 ContentService.

mod modrinth;
mod mrpack;

use crate::error::{CoreError, CoreResult};
use crate::instances::{CreateDefaults, InstanceStore};
use crate::progress::{EventBus, ProgressEvent};
use crate::settings::SettingsStore;
use crate::versions::VersionService;
use futures_util::StreamExt;
use modrinth::{ModrinthProvider, ResolvedContentFile};
use mrpack::{
    client_files, loader_from_mrpack, loader_version_from_mrpack, minecraft_from_mrpack,
    pack_file_category, parse_mrpack_index, project_id_from_download_url, safe_instance_path,
    unzip_to_entries, version_id_from_download_url, write_mrpack_overrides, write_zip_entries,
    MrpackIndexFile,
};
use parking_lot::Mutex;
use serde_json::{json, Value};
use sha1::{Digest, Sha1};
use sha2::Sha512;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};
use uuid::Uuid;

const INDEX_DIR: &str = ".fledge";
const INDEX_FILE: &str = "content-index.json";
const UA_DOWNLOAD: &str = "Fledge/0.5.0 (content-download)";
/// ダウンロード中の進捗通知間隔（UI / IPC 負荷を抑える）
const PROGRESS_EMIT_INTERVAL: Duration = Duration::from_millis(150);

const EXPORT_EXCLUDED: &[&str] = &[
    ".fledge",
    "saves",
    "logs",
    "screenshots",
    "crash-reports",
    "backups",
];

pub struct ContentService {
    instances: Arc<InstanceStore>,
    settings: Arc<SettingsStore>,
    versions: Arc<VersionService>,
    events: Arc<EventBus>,
    modrinth: ModrinthProvider,
    index_locks: Mutex<HashMap<String, ()>>,
}

impl ContentService {
    pub fn new(
        instances: Arc<InstanceStore>,
        settings: Arc<SettingsStore>,
        versions: Arc<VersionService>,
        events: Arc<EventBus>,
    ) -> Self {
        Self {
            instances,
            settings,
            versions,
            events,
            modrinth: ModrinthProvider::new(),
            index_locks: Mutex::new(HashMap::new()),
        }
    }

    pub fn list_providers(&self) -> Value {
        json!([{ "id": "modrinth", "name": "Modrinth", "available": true }])
    }

    pub async fn list_category_tags(&self) -> CoreResult<Value> {
        self.modrinth.list_category_tags().await
    }

    pub async fn search(&self, query: &Value) -> CoreResult<Value> {
        self.modrinth.search(query).await
    }

    pub async fn get_project(&self, project_id: &str) -> CoreResult<Value> {
        let id = project_id.trim();
        if id.is_empty() {
            return Err(CoreError::msg("Project id required"));
        }
        self.modrinth.get_project(id).await
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
        let versions = self
            .modrinth
            .list_versions(id, game_version, &loaders)
            .await?;
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
                let _lock = self.lock_index(instance_id);
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

        let files = self
            .modrinth
            .resolve_install_set(
                project_id,
                category,
                version_id,
                game_version,
                &loaders,
                Some(loader),
                &installed,
            )
            .await?;
        if files.is_empty() {
            return Err(CoreError::msg("Compatible version not found on Modrinth"));
        }
        let primary = files.last().unwrap().clone();
        let instance_dir = self.instances.instance_dir(instance_id);
        let installed_by: HashMap<String, Value> = index
            .items
            .iter()
            .filter_map(|i| {
                Some((
                    i.get("projectId")?.as_str()?.to_string(),
                    i.clone(),
                ))
            })
            .collect();

        let mut primary_entry: Option<Value> = None;
        for resolved in &files {
            if let Some(current) = installed_by.get(&resolved.project_id) {
                if current.get("versionId").and_then(|v| v.as_str())
                    == Some(resolved.version_id.as_str())
                {
                    if resolved.project_id == primary.project_id {
                        primary_entry = Some(current.clone());
                    }
                    continue;
                }
            }
            let dir = instance_dir.join(category_dir(&resolved.category));
            fs::create_dir_all(&dir)?;
            let entry = self
                .download_and_finalize(instance_id, &instance_dir, resolved)
                .await?;
            if resolved.project_id == primary.project_id {
                primary_entry = Some(entry);
            }
        }
        Ok(primary_entry.unwrap_or_else(|| to_installed_entry(&primary, true)))
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
        let game_version = req.get("gameVersion").and_then(|v| v.as_str());
        let loaders = string_array(req.get("loaders"));
        let page = self.modrinth.get_project(project_id).await?;
        let mut versions = self
            .modrinth
            .list_versions(project_id, game_version, &loaders)
            .await?;
        let version_id = req.get("versionId").and_then(|v| v.as_str());
        let mut version = if let Some(vid) = version_id {
            versions.iter().find(|v| v.get("id").and_then(|x| x.as_str()) == Some(vid)).cloned()
        } else {
            versions.first().cloned()
        };
        if version.is_none() && version_id.is_some() {
            versions = self.modrinth.list_versions(project_id, None, &[]).await?;
            version = versions
                .iter()
                .find(|v| v.get("id").and_then(|x| x.as_str()) == version_id)
                .cloned();
        }
        let version =
            version.ok_or_else(|| CoreError::msg("Compatible version not found on Modrinth"))?;
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
        let bytes = match download_bytes_with_progress(
            &resolved.download_url,
            &self.events,
            &session_id,
            pack_name,
            &resolved.file_name,
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
        let entries = unzip_to_entries(bytes)?;
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

        let result = async {
            let instance_dir = self.instances.instance_dir(&profile_id);
            write_mrpack_overrides(&instance_dir, &entries)?;
            let pack_files = client_files(&index);
            let project_ids: Vec<String> = pack_files
                .iter()
                .map(|f| {
                    project_id_from_download_url(f.downloads.first().map(|s| s.as_str()).unwrap_or(""), &f.path)
                })
                .filter(|id| !id.starts_with("pack:"))
                .collect();
            let metadata = self
                .modrinth
                .get_project_metadata(&project_ids)
                .await
                .unwrap_or_default();
            for file in pack_files {
                self.install_mrpack_file(
                    &profile_id,
                    &instance_dir,
                    file,
                    pack_name,
                    version_id,
                    version_number,
                    icon_url.as_deref(),
                    &metadata,
                )
                .await?;
            }
            Ok::<(), CoreError>(())
        }
        .await;

        match result {
            Ok(()) => {
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
        if let Err(err) = download_to_file_ua(
            download_url,
            &staging,
            file.hashes_sha1.as_deref(),
            &self.events,
            &session_id,
            pack_name,
            &file_name,
        )
        .await
        {
            self.emit_content_job_finished(&session_id, pack_name, &file_name, instance_id, false);
            return Err(err);
        }
        self.emit_content_job_finished(&session_id, pack_name, &file_name, instance_id, true);

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
            overrides.push(json!({
              "path": rel.replace('\\', "/"),
              "size": meta.len(),
              "defaultSelected": true
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
                if !sel.contains(&lower) {
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
        let mrpack_index = json!({
          "formatVersion": 1,
          "game": "minecraft",
          "versionId": Uuid::new_v4().to_string(),
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
        let _lock = self.lock_index(instance_id);
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
        let _lock = self.lock_index(instance_id);
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
        let _lock = self.lock_index(instance_id);
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
          "memoryMaxMb": memory_max.unwrap_or(2048),
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
        fs::create_dir_all(&dest_dir)?;
        let dest_path = dest_dir.join(&resolved.file_name);
        let staging = dest_path.with_extension(format!("download-{}", Uuid::new_v4()));
        let entry = to_installed_entry(resolved, true);
        let session_id = format!("content-{instance_id}-{}", resolved.project_id);
        let result = download_to_file_ua(
            &resolved.download_url,
            &staging,
            resolved.sha1.as_deref(),
            &self.events,
            &session_id,
            &resolved.name,
            &resolved.file_name,
        )
        .await;
        if let Err(err) = result {
            self.emit_content_job_finished(
                &session_id,
                &resolved.name,
                &resolved.file_name,
                instance_id,
                false,
            );
            return Err(err);
        }
        self.finalize_installed(
            instance_id,
            instance_dir,
            &resolved.provider,
            &resolved.project_id,
            &resolved.category,
            &resolved.file_name,
            entry.clone(),
            &staging,
            &dest_path,
        )?;
        self.emit_content_job_finished(
            &session_id,
            &resolved.name,
            &resolved.file_name,
            instance_id,
            true,
        );
        Ok(entry)
    }

    fn emit_content_job_finished(
        &self,
        session_id: &str,
        name: &str,
        file: &str,
        instance_id: &str,
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
            })),
        });
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
        let _lock = self.lock_index(instance_id);
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

    fn lock_index(&self, instance_id: &str) -> parking_lot::MutexGuard<'_, HashMap<String, ()>> {
        let mut map = self.index_locks.lock();
        map.entry(instance_id.to_string()).or_insert(());
        // Hold the outer mutex as coarse lock (simpler than per-key)
        map
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

async fn download_bytes_with_progress(
    url: &str,
    events: &EventBus,
    session_id: &str,
    name: &str,
    file: &str,
) -> CoreResult<Vec<u8>> {
    let client = reqwest::Client::new();
    let response = client
        .get(url)
        .header("User-Agent", UA_DOWNLOAD)
        .send()
        .await
        .map_err(|e| CoreError::msg(e.to_string()))?
        .error_for_status()
        .map_err(|e| CoreError::msg(e.to_string()))?;
    let total = response.content_length().unwrap_or(0) as f64;
    let mut stream = response.bytes_stream();
    let mut buf = Vec::new();
    let mut current = 0f64;
    let mut last_emit = Instant::now() - PROGRESS_EMIT_INTERVAL;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| CoreError::msg(e.to_string()))?;
        current += chunk.len() as f64;
        buf.extend_from_slice(&chunk);
        let at_end = total > 0.0 && current >= total;
        if at_end || last_emit.elapsed() >= PROGRESS_EMIT_INTERVAL {
            last_emit = Instant::now();
            events.emit_progress(ProgressEvent {
                scope: "download".into(),
                kind: Some("content".into()),
                session_id: Some(session_id.into()),
                job_id: Some(session_id.into()),
                current,
                total: if total > 0.0 { total } else { current },
                percent: if total > 0.0 {
                    Some((current / total) * 100.0)
                } else {
                    None
                },
                bytes_per_second: None,
                message_key: Some("content.downloading".into()),
                status: Some("active".into()),
                meta: Some(json!({ "name": name, "file": file })),
            });
        }
    }
    Ok(buf)
}

async fn download_to_file_ua(
    url: &str,
    dest: &Path,
    expected_sha1: Option<&str>,
    events: &EventBus,
    session_id: &str,
    name: &str,
    file: &str,
) -> CoreResult<()> {
    if dest.is_file() {
        if let Some(expected) = expected_sha1 {
            if crate::download::file_sha1(dest)? == expected.to_ascii_lowercase() {
                return Ok(());
            }
        }
    }
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    let client = reqwest::Client::new();
    let response = client
        .get(url)
        .header("User-Agent", UA_DOWNLOAD)
        .send()
        .await
        .map_err(|e| CoreError::msg(e.to_string()))?
        .error_for_status()
        .map_err(|e| CoreError::msg(e.to_string()))?;
    let total = response.content_length().unwrap_or(0) as f64;
    let tmp = dest.with_extension("download-part");
    let mut stream = response.bytes_stream();
    let mut out = fs::File::create(&tmp)?;
    let mut hasher = Sha1::new();
    let mut current = 0f64;
    let mut last_emit = Instant::now() - PROGRESS_EMIT_INTERVAL;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| CoreError::msg(e.to_string()))?;
        out.write_all(&chunk)?;
        hasher.update(&chunk);
        current += chunk.len() as f64;
        let at_end = total > 0.0 && current >= total;
        if at_end || last_emit.elapsed() >= PROGRESS_EMIT_INTERVAL {
            last_emit = Instant::now();
            events.emit_progress(ProgressEvent {
                scope: "download".into(),
                kind: Some("content".into()),
                session_id: Some(session_id.into()),
                job_id: Some(session_id.into()),
                current,
                total: if total > 0.0 { total } else { current },
                percent: if total > 0.0 {
                    Some((current / total) * 100.0)
                } else {
                    None
                },
                bytes_per_second: None,
                message_key: Some("content.downloading".into()),
                status: Some("active".into()),
                meta: Some(json!({ "name": name, "file": file })),
            });
        }
    }
    out.flush()?;
    drop(out);
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
    let _ = fs::remove_file(dest);
    fs::rename(&tmp, dest).or_else(|_| {
        fs::copy(&tmp, dest)?;
        fs::remove_file(&tmp)?;
        Ok::<(), std::io::Error>(())
    })?;
    Ok(())
}
