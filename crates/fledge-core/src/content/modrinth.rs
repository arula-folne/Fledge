//! Modrinth API client (v2).

use crate::error::{CoreError, CoreResult};
use parking_lot::Mutex;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::time::Duration;

const API: &str = "https://api.modrinth.com/v2";
const UA: &str = "Fledge/0.5.0 (https://github.com/arula-folne/Fledge; content-manager)";
const FETCH_TIMEOUT_MS: u64 = 20_000;

const LOADER_CATS: &[&str] = &[
    "fabric", "forge", "neoforge", "quilt", "bukkit", "paper", "spigot", "purpur",
];

#[derive(Clone)]
pub struct ResolvedContentFile {
    pub provider: String,
    pub project_id: String,
    pub version_id: String,
    pub slug: String,
    pub name: String,
    pub version_number: String,
    pub category: String,
    pub file_name: String,
    pub download_url: String,
    pub icon_url: Option<String>,
    pub sha1: Option<String>,
    pub sha512: Option<String>,
    pub size: Option<u64>,
}

pub struct ModrinthProvider {
    locale: Mutex<Option<String>>,
    category_tags_cache: Mutex<Option<Value>>,
}

impl ModrinthProvider {
    pub fn new() -> Self {
        Self {
            locale: Mutex::new(None),
            category_tags_cache: Mutex::new(None),
        }
    }

    pub async fn search(&self, query: &Value) -> CoreResult<Value> {
        let category = query
            .get("category")
            .and_then(|v| v.as_str())
            .unwrap_or("mod");
        let limit = query.get("limit").and_then(|v| v.as_u64()).unwrap_or(20);
        let offset = query.get("offset").and_then(|v| v.as_u64()).unwrap_or(0);
        let sort = query
            .get("sort")
            .and_then(|v| v.as_str())
            .unwrap_or("relevance");

        let mut facets: Vec<Vec<String>> = vec![vec![format!("project_type:{}", type_map(category))]];
        if let Some(gv) = query.get("gameVersion").and_then(|v| v.as_str()) {
            if !gv.is_empty() {
                facets.push(vec![format!("versions:{gv}")]);
            }
        }
        if let Some(loaders) = query.get("loaders").and_then(|v| v.as_array()) {
            let cats: Vec<String> = loaders
                .iter()
                .filter_map(|v| v.as_str().map(|s| format!("categories:{s}")))
                .collect();
            if !cats.is_empty() {
                facets.push(cats);
            }
        }
        if let Some(tags) = query.get("tags").and_then(|v| v.as_array()) {
            let cats: Vec<String> = tags
                .iter()
                .filter_map(|v| v.as_str().map(|s| format!("categories:{s}")))
                .collect();
            if !cats.is_empty() {
                facets.push(cats);
            }
        }
        if let Some(envs) = query.get("environments").and_then(|v| v.as_array()) {
            let has = |name: &str| envs.iter().any(|v| v.as_str() == Some(name));
            if has("client") {
                facets.push(vec![
                    "client_side:required".into(),
                    "client_side:optional".into(),
                ]);
            }
            if has("server") {
                facets.push(vec![
                    "server_side:required".into(),
                    "server_side:optional".into(),
                ]);
            }
        }

        let mut params = vec![
            ("limit".into(), limit.to_string()),
            ("offset".into(), offset.to_string()),
            ("index".into(), sort.to_string()),
            ("facets".into(), serde_json::to_string(&facets)?),
        ];
        if let Some(q) = query.get("query").and_then(|v| v.as_str()) {
            let trimmed = q.trim();
            if !trimmed.is_empty() {
                params.push(("query".into(), trimmed.to_string()));
            }
        }

        let data: Value = self.api_get(&format!("/search?{}", encode_params(&params))).await?;
        let hits_raw = data.get("hits").and_then(|v| v.as_array()).cloned().unwrap_or_default();
        let hits: Vec<Value> = hits_raw.iter().filter_map(hit_to_project).collect();
        let total = data
            .get("total_hits")
            .and_then(|v| v.as_u64())
            .unwrap_or(hits.len() as u64);
        Ok(json!({
          "hits": hits,
          "total": total,
          "offset": offset,
          "limit": limit
        }))
    }

    pub async fn get_project(&self, project_id: &str) -> CoreResult<Value> {
        let raw: Value = self
            .api_get(&format!("/project/{}", urlencoding_simple(project_id)))
            .await?;
        let project = project_to_detail(&raw, &[])?;
        Ok(json!({ "project": project, "versions": [] }))
    }

    pub async fn list_versions(
        &self,
        project_id: &str,
        game_version: Option<&str>,
        loaders: &[String],
    ) -> CoreResult<Vec<Value>> {
        let mut params = Vec::new();
        if let Some(gv) = game_version.filter(|s| !s.is_empty()) {
            params.push(("game_versions".into(), serde_json::to_string(&vec![gv])?));
        }
        if !loaders.is_empty() {
            params.push(("loaders".into(), serde_json::to_string(loaders)?));
        }
        let qs = if params.is_empty() {
            String::new()
        } else {
            format!("?{}", encode_params(&params))
        };
        let versions: Value = self
            .api_get(&format!(
                "/project/{}/version{qs}",
                urlencoding_simple(project_id)
            ))
            .await?;
        let arr = versions.as_array().cloned().unwrap_or_default();
        Ok(arr.into_iter().take(40).map(map_version).collect())
    }

    pub async fn list_category_tags(&self) -> CoreResult<Value> {
        if let Some(cached) = self.category_tags_cache.lock().clone() {
            return Ok(cached);
        }
        let raw: Value = self.api_get("/tag/category").await?;
        let tags: Vec<Value> = raw
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .map(|t| {
                json!({
                  "name": t.get("name"),
                  "projectType": t.get("project_type"),
                  "header": t.get("header"),
                  "icon": t.get("icon").and_then(|v| v.as_str()).unwrap_or("")
                })
            })
            .collect();
        let out = Value::Array(tags);
        *self.category_tags_cache.lock() = Some(out.clone());
        Ok(out)
    }

    pub async fn get_project_metadata(
        &self,
        ids: &[String],
    ) -> CoreResult<HashMap<String, (String, String, Option<String>)>> {
        let projects = self.fetch_projects_by_ids(ids).await?;
        Ok(projects
            .into_iter()
            .map(|(id, p)| {
                (
                    id,
                    (
                        p.get("slug").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        p.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        p.get("icon_url")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                    ),
                )
            })
            .collect())
    }

    pub async fn resolve_install_set(
        &self,
        project_id: &str,
        category: &str,
        version_id: Option<&str>,
        game_version: Option<&str>,
        loaders: &[String],
        loader: Option<&str>,
        installed: &HashMap<String, String>,
    ) -> CoreResult<Vec<ResolvedContentFile>> {
        if category == "modpack" {
            let version = self
                .fetch_version(project_id, version_id, game_version, loaders)
                .await?;
            let pid = version
                .get("project_id")
                .and_then(|v| v.as_str())
                .unwrap_or(project_id);
            let meta: Value = self
                .api_get(&format!("/project/{}", urlencoding_simple(pid)))
                .await?;
            return Ok(vec![to_resolved_file(&meta, &version, "modpack")?]);
        }

        let mut chosen: HashMap<String, ResolvedContentFile> = HashMap::new();
        let mut pinned: HashSet<String> = HashSet::new();
        let mut project_cache: HashMap<String, Value> = HashMap::new();
        let mut root_project_id: Option<String> = None;

        // Implicit libraries
        for (lib_id, _slug) in implicit_libraries(loader, category) {
            if is_implicit_target(project_id, &lib_id) {
                continue;
            }
            if installed.contains_key(&lib_id) || chosen.contains_key(&lib_id) {
                continue;
            }
            self.walk_deps(
                &lib_id,
                "mod",
                None,
                game_version,
                loaders,
                1,
                &mut chosen,
                &mut pinned,
                &mut project_cache,
                &mut root_project_id,
                installed,
            )
            .await?;
        }

        self.walk_deps(
            project_id,
            category,
            version_id,
            game_version,
            loaders,
            0,
            &mut chosen,
            &mut pinned,
            &mut project_cache,
            &mut root_project_id,
            installed,
        )
        .await?;

        let root = root_project_id.ok_or_else(|| {
            CoreError::msg("Compatible version not found on Modrinth")
        })?;
        let mut files: Vec<_> = chosen.into_values().collect();
        if files.is_empty() {
            return Err(CoreError::msg("Compatible version not found on Modrinth"));
        }
        if let Some(pos) = files.iter().position(|f| f.project_id == root) {
            let primary = files.remove(pos);
            files.push(primary);
        }
        Ok(files)
    }

    pub async fn resolve_install(
        &self,
        project_id: &str,
        category: &str,
        version_id: Option<&str>,
        game_version: Option<&str>,
        loaders: &[String],
    ) -> CoreResult<ResolvedContentFile> {
        let files = self
            .resolve_install_set(
                project_id,
                category,
                version_id,
                game_version,
                loaders,
                None,
                &HashMap::new(),
            )
            .await?;
        files
            .into_iter()
            .next_back()
            .ok_or_else(|| CoreError::msg("Compatible version not found on Modrinth"))
    }

    pub async fn find_update(
        &self,
        project_id: &str,
        version_id: &str,
        category: &str,
        game_version: Option<&str>,
        loaders: &[String],
    ) -> CoreResult<Option<(String, String)>> {
        let _ = category;
        let versions = self.list_versions(project_id, game_version, loaders).await?;
        // 新しい順。プレリリースではなく安定版（release）の更新のみ通知する
        let latest_stable_index = versions.iter().position(|v| {
            match v.get("versionType").and_then(|t| t.as_str()) {
                None | Some("release") => true,
                _ => false,
            }
        });
        let Some(latest_stable_index) = latest_stable_index else {
            return Ok(None);
        };
        let latest = &versions[latest_stable_index];
        let id = latest.get("id").and_then(|v| v.as_str()).unwrap_or("");
        if id == version_id || id.is_empty() {
            return Ok(None);
        }
        let current_index = versions
            .iter()
            .position(|v| v.get("id").and_then(|x| x.as_str()) == Some(version_id));
        // 現在版より古い安定版は「更新」にしない
        if let Some(cur) = current_index {
            if latest_stable_index > cur {
                return Ok(None);
            }
        }
        let number = latest
            .get("versionNumber")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        Ok(Some((id.to_string(), number)))
    }

    #[allow(clippy::too_many_arguments)]
    async fn walk_deps(
        &self,
        project_ref: &str,
        category: &str,
        version_id: Option<&str>,
        game_version: Option<&str>,
        loaders: &[String],
        depth: u32,
        chosen: &mut HashMap<String, ResolvedContentFile>,
        pinned: &mut HashSet<String>,
        project_cache: &mut HashMap<String, Value>,
        root_project_id: &mut Option<String>,
        installed: &HashMap<String, String>,
    ) -> CoreResult<()> {
        if depth > 24 {
            return Err(CoreError::msg("依存関係が深すぎるため解決できませんでした"));
        }
        let version = self
            .fetch_version(project_ref, version_id, game_version, loaders)
            .await?;
        let project_id = version
            .get("project_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| CoreError::msg("Modrinth version missing project_id"))?
            .to_string();

        if let Some(existing) = chosen.get(&project_id) {
            let vid = version.get("id").and_then(|v| v.as_str()).unwrap_or("");
            if existing.version_id == vid || version_id.is_none() {
                return Ok(());
            }
            if pinned.contains(&project_id) {
                return Err(CoreError::msg(format!(
                    "依存関係で要求されるバージョンが衝突しています: {}",
                    existing.name
                )));
            }
            chosen.remove(&project_id);
        }
        if version_id.is_some() {
            pinned.insert(project_id.clone());
        }

        let mut required_deps: Vec<(String, Option<String>)> = Vec::new();
        if let Some(deps) = version.get("dependencies").and_then(|v| v.as_array()) {
            for dep in deps {
                let dep_type = dep.get("dependency_type").and_then(|v| v.as_str()).unwrap_or("");
                let dep_project = dep
                    .get("project_id")
                    .and_then(|v| v.as_str())
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty());
                let Some(dep_project) = dep_project else {
                    continue;
                };
                if dep_type == "required" {
                    let dep_ver = dep
                        .get("version_id")
                        .and_then(|v| v.as_str())
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty());
                    required_deps.push((dep_project, dep_ver));
                }
            }
        }

        if !project_cache.contains_key(&project_id) {
            let meta: Value = self
                .api_get(&format!("/project/{}", urlencoding_simple(&project_id)))
                .await?;
            project_cache.insert(project_id.clone(), meta);
        }
        let meta = project_cache.get(&project_id).unwrap().clone();
        if depth == 0 {
            *root_project_id = Some(
                meta.get("id")
                    .and_then(|v| v.as_str())
                    .unwrap_or(&project_id)
                    .to_string(),
            );
        }
        let resolved_category = map_category(
            meta.get("project_type")
                .and_then(|v| v.as_str())
                .unwrap_or(""),
        )
        .unwrap_or_else(|| category.to_string());

        for (dep_id, dep_ver) in required_deps {
            if installed.contains_key(&dep_id) && dep_ver.is_none() {
                continue;
            }
            Box::pin(self.walk_deps(
                &dep_id,
                "mod",
                dep_ver.as_deref(),
                game_version,
                loaders,
                depth + 1,
                chosen,
                pinned,
                project_cache,
                root_project_id,
                installed,
            ))
            .await?;
        }

        chosen.insert(
            project_id,
            to_resolved_file(&meta, &version, &resolved_category)?,
        );
        Ok(())
    }

    async fn fetch_version(
        &self,
        project_id: &str,
        version_id: Option<&str>,
        game_version: Option<&str>,
        loaders: &[String],
    ) -> CoreResult<Value> {
        if let Some(vid) = version_id.filter(|s| !s.is_empty()) {
            return self
                .api_get(&format!("/version/{}", urlencoding_simple(vid)))
                .await;
        }
        let mut params = Vec::new();
        if let Some(gv) = game_version.filter(|s| !s.is_empty()) {
            params.push(("game_versions".into(), serde_json::to_string(&vec![gv])?));
        }
        if !loaders.is_empty() {
            params.push(("loaders".into(), serde_json::to_string(loaders)?));
        }
        let qs = if params.is_empty() {
            String::new()
        } else {
            format!("?{}", encode_params(&params))
        };
        let raw: Value = self
            .api_get(&format!(
                "/project/{}/version{qs}",
                urlencoding_simple(project_id)
            ))
            .await?;
        let arr = raw.as_array().cloned().unwrap_or_default();
        arr.into_iter().next().ok_or_else(|| {
            CoreError::msg(format!("対応するバージョンが見つかりません: {project_id}"))
        })
    }

    async fn fetch_projects_by_ids(&self, ids: &[String]) -> CoreResult<HashMap<String, Value>> {
        let unique: Vec<String> = {
            let mut seen = HashSet::new();
            ids.iter()
                .filter_map(|id| {
                    let t = id.trim();
                    if t.is_empty() || !seen.insert(t.to_string()) {
                        None
                    } else {
                        Some(t.to_string())
                    }
                })
                .collect()
        };
        let mut out = HashMap::new();
        for chunk in unique.chunks(50) {
            let params = [("ids".into(), serde_json::to_string(chunk)?)];
            let list: Value = self
                .api_get(&format!("/projects?{}", encode_params(&params)))
                .await?;
            if let Some(arr) = list.as_array() {
                for p in arr {
                    if let Some(id) = p.get("id").and_then(|v| v.as_str()) {
                        out.insert(id.to_string(), p.clone());
                    }
                }
            }
        }
        Ok(out)
    }

    async fn api_get(&self, path: &str) -> CoreResult<Value> {
        let locale = {
            let mut loc = self.locale.lock();
            if loc.is_none() {
                *loc = Some("ja".into());
            }
            loc.clone().unwrap()
        };
        let accept_lang = accept_language_from_locale(&locale);
        let client = reqwest::Client::builder()
            .timeout(Duration::from_millis(FETCH_TIMEOUT_MS))
            .build()
            .map_err(|e| CoreError::msg(e.to_string()))?;
        let mut attempt = 0u32;
        loop {
            let res = client
                .get(format!("{API}{path}"))
                .header("Accept", "application/json")
                .header("Accept-Language", &accept_lang)
                .header("User-Agent", UA)
                .send()
                .await;
            match res {
                Ok(res) => {
                    let status = res.status();
                    if status.as_u16() == 429 && attempt < 2 {
                        let delay = res
                            .headers()
                            .get("Retry-After")
                            .and_then(|v| v.to_str().ok())
                            .and_then(|s| s.parse::<u64>().ok())
                            .unwrap_or(2);
                        tokio::time::sleep(Duration::from_secs(delay.min(10))).await;
                        attempt += 1;
                        continue;
                    }
                    if !status.is_success() {
                        let body = res.text().await.unwrap_or_default();
                        return Err(CoreError::msg(format!(
                            "Modrinth API {status}: {}",
                            body.chars().take(200).collect::<String>()
                        )));
                    }
                    return res
                        .json()
                        .await
                        .map_err(|e| CoreError::msg(e.to_string()));
                }
                Err(err) if attempt < 1 => {
                    tokio::time::sleep(Duration::from_millis(800 * (attempt as u64 + 1))).await;
                    attempt += 1;
                    let _ = err;
                    continue;
                }
                Err(err) => return Err(CoreError::msg(err.to_string())),
            }
        }
    }
}

fn to_resolved_file(project: &Value, version: &Value, category: &str) -> CoreResult<ResolvedContentFile> {
    let files = version
        .get("files")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let file = files
        .iter()
        .find(|f| f.get("primary").and_then(|v| v.as_bool()) == Some(true))
        .or_else(|| files.first())
        .ok_or_else(|| CoreError::msg("No downloadable file on Modrinth version"))?;
    Ok(ResolvedContentFile {
        provider: "modrinth".into(),
        project_id: project
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        version_id: version
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        slug: project
            .get("slug")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        name: project
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        version_number: version
            .get("version_number")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        category: category.to_string(),
        file_name: file
            .get("filename")
            .and_then(|v| v.as_str())
            .unwrap_or("file.jar")
            .to_string(),
        download_url: file
            .get("url")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        icon_url: project
            .get("icon_url")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        sha1: file
            .pointer("/hashes/sha1")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        sha512: file
            .pointer("/hashes/sha512")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        size: file.get("size").and_then(|v| v.as_u64()),
    })
}

fn type_map(category: &str) -> &str {
    match category {
        "mod" => "mod",
        "modpack" => "modpack",
        "resourcepack" => "resourcepack",
        "shader" => "shader",
        "datapack" => "datapack",
        "plugin" => "plugin",
        other => other,
    }
}

fn map_category(project_type: &str) -> Option<String> {
    match project_type {
        "mod" | "modpack" | "resourcepack" | "shader" | "datapack" => Some(project_type.into()),
        _ => None,
    }
}

fn loaders_from_cats(cats: &[String]) -> Vec<String> {
    cats.iter()
        .filter(|c| LOADER_CATS.contains(&c.as_str()))
        .cloned()
        .collect()
}

fn hit_to_project(hit: &Value) -> Option<Value> {
    let project_type = map_category(hit.get("project_type")?.as_str()?)?;
    let cats: Vec<String> = hit
        .get("categories")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    let display: Vec<String> = hit
        .get("display_categories")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    Some(json!({
      "provider": "modrinth",
      "id": hit.get("project_id"),
      "slug": hit.get("slug"),
      "name": hit.get("title"),
      "description": hit.get("description").and_then(|v| v.as_str()).unwrap_or(""),
      "iconUrl": hit.get("icon_url"),
      "downloads": hit.get("downloads").and_then(|v| v.as_u64()).unwrap_or(0),
      "follows": hit.get("follows").and_then(|v| v.as_u64()).unwrap_or(0),
      "author": hit.get("author"),
      "displayCategories": display,
      "dateModified": hit.get("date_modified"),
      "clientSide": hit.get("client_side"),
      "serverSide": hit.get("server_side"),
      "categories": cats,
      "gameVersions": [],
      "loaders": loaders_from_cats(&cats),
      "projectType": project_type
    }))
}

fn project_to_detail(p: &Value, members: &[Value]) -> CoreResult<Value> {
    let project_type = map_category(
        p.get("project_type")
            .and_then(|v| v.as_str())
            .unwrap_or(""),
    )
    .ok_or_else(|| CoreError::msg("Unsupported project type"))?;
    let mut cats: Vec<String> = p
        .get("categories")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    if let Some(extra) = p.get("additional_categories").and_then(|v| v.as_array()) {
        for c in extra {
            if let Some(s) = c.as_str() {
                cats.push(s.to_string());
            }
        }
    }
    let loaders = if let Some(l) = p.get("loaders").and_then(|v| v.as_array()) {
        l.iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect()
    } else {
        loaders_from_cats(&cats)
    };
    let display: Vec<String> = cats
        .iter()
        .filter(|c| !LOADER_CATS.contains(&c.as_str()))
        .cloned()
        .collect();
    let body = p
        .get("body")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .chars()
        .take(12_000)
        .collect::<String>();
    Ok(json!({
      "provider": "modrinth",
      "id": p.get("id"),
      "slug": p.get("slug"),
      "name": p.get("title"),
      "description": p.get("description").and_then(|v| v.as_str()).unwrap_or(""),
      "iconUrl": p.get("icon_url"),
      "downloads": p.get("downloads").and_then(|v| v.as_u64()).unwrap_or(0),
      "follows": p.get("followers").and_then(|v| v.as_u64()).unwrap_or(0),
      "author": members.first().and_then(|m| m.get("username")),
      "displayCategories": display,
      "dateModified": p.get("updated"),
      "clientSide": p.get("client_side"),
      "serverSide": p.get("server_side"),
      "categories": cats,
      "gameVersions": p.get("game_versions").cloned().unwrap_or(json!([])),
      "loaders": loaders,
      "projectType": project_type,
      "body": body,
      "publishedAt": p.get("published"),
      "licenseId": p.pointer("/license/id"),
      "licenseName": p.pointer("/license/name"),
      "licenseUrl": p.pointer("/license/url"),
      "issuesUrl": p.get("issues_url"),
      "sourceUrl": p.get("source_url"),
      "wikiUrl": p.get("wiki_url"),
      "discordUrl": p.get("discord_url"),
      "donationUrls": [],
      "members": members,
      "gallery": []
    }))
}

fn map_version(v: Value) -> Value {
    // If already mapped (has versionNumber), return as-is; else map from Modrinth raw
    if v.get("versionNumber").is_some() {
        return v;
    }
    json!({
      "id": v.get("id"),
      "name": v.get("name"),
      "versionNumber": v.get("version_number"),
      "gameVersions": v.get("game_versions").cloned().unwrap_or(json!([])),
      "loaders": v.get("loaders").cloned().unwrap_or(json!([])),
      "featured": v.get("featured").and_then(|x| x.as_bool()).unwrap_or(false),
      "datePublished": v.get("date_published"),
      "downloads": v.get("downloads").and_then(|x| x.as_u64()).unwrap_or(0),
      "versionType": v.get("version_type")
    })
}

fn implicit_libraries(loader: Option<&str>, category: &str) -> Vec<(String, String)> {
    if category != "mod" {
        return vec![];
    }
    match loader {
        Some("fabric") => vec![("P7dR8mSH".into(), "fabric-api".into())],
        Some("quilt") => vec![("qvIfYCYJ".into(), "qsl".into())],
        _ => vec![],
    }
}

fn is_implicit_target(project_ref: &str, lib_id: &str) -> bool {
    project_ref.eq_ignore_ascii_case(lib_id)
}

fn accept_language_from_locale(locale: &str) -> String {
    let raw = locale.trim().replace('_', "-");
    let raw = if raw.is_empty() { "en" } else { &raw };
    let mut parts = raw.split('-');
    let lang = parts.next().unwrap_or("en").to_lowercase();
    let region: String = parts.collect::<Vec<_>>().join("-");
    let primary = if region.is_empty() {
        lang.clone()
    } else {
        let region_fmt = if region.len() == 2 {
            region.to_uppercase()
        } else {
            region.clone()
        };
        format!("{lang}-{region_fmt}")
    };
    let mut out = vec![primary.clone()];
    if !region.is_empty() && primary.to_lowercase() != lang {
        out.push(format!("{lang};q=0.9"));
    }
    if !lang.starts_with("en") {
        out.push("en;q=0.8".into());
    }
    out.join(",")
}

fn encode_params(params: &[(String, String)]) -> String {
    params
        .iter()
        .map(|(k, v)| format!("{}={}", urlencoding_simple(k), urlencoding_simple(v)))
        .collect::<Vec<_>>()
        .join("&")
}

fn urlencoding_simple(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}
