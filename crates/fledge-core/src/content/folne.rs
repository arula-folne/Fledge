//! folne 公式サイト（www.folne.net）コンテンツ API。
//! Modrinth と同じく、サイトがカタログ＋ファイル配布を担う。

use crate::content::modrinth::ResolvedContentFile;
use crate::error::{CoreError, CoreResult};
use crate::updater::APP_VERSION;
use serde_json::{json, Value};
use std::env;
use std::time::Duration;

const DEFAULT_API: &str = "https://www.folne.net/api/content";
const FETCH_TIMEOUT_MS: u64 = 20_000;

fn user_agent() -> String {
    format!("Fledge/{APP_VERSION} (https://github.com/arula-folne/Fledge; folne-content)")
}

pub struct FolneProvider;

impl FolneProvider {
    pub fn new() -> Self {
        Self
    }

    fn api_base() -> String {
        env::var("FLEDGE_FOLNE_CONTENT_API")
            .ok()
            .map(|s| s.trim().trim_end_matches('/').to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| DEFAULT_API.to_string())
    }

    async fn api_get(&self, path: &str) -> CoreResult<Value> {
        let url = format!("{}{path}", Self::api_base());
        let client = reqwest::Client::builder()
            .timeout(Duration::from_millis(FETCH_TIMEOUT_MS))
            .user_agent(user_agent())
            .build()
            .map_err(|e| CoreError::msg(e.to_string()))?;
        let res = client
            .get(&url)
            .header("Accept", "application/json")
            .send()
            .await
            .map_err(|e| CoreError::msg(e.to_string()))?;
        if !res.status().is_success() {
            let status = res.status().as_u16();
            let body = res.text().await.unwrap_or_default();
            return Err(CoreError::msg(format!(
                "folne content API {status}: {}",
                body.chars().take(200).collect::<String>()
            )));
        }
        res.json()
            .await
            .map_err(|e| CoreError::msg(e.to_string()))
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

        let mut params: Vec<(String, String)> = vec![
            ("category".into(), category.to_string()),
            ("limit".into(), limit.to_string()),
            ("offset".into(), offset.to_string()),
            ("sort".into(), sort.to_string()),
            ("locale".into(), "ja".to_string()),
        ];
        if let Some(q) = query.get("query").and_then(|v| v.as_str()) {
            let trimmed = q.trim();
            if !trimmed.is_empty() {
                params.push(("query".into(), trimmed.to_string()));
            }
        }
        if let Some(gv) = query.get("gameVersion").and_then(|v| v.as_str()) {
            if !gv.is_empty() {
                params.push(("gameVersion".into(), gv.to_string()));
            }
        }
        if let Some(loaders) = query.get("loaders").and_then(|v| v.as_array()) {
            let joined: Vec<&str> = loaders.iter().filter_map(|v| v.as_str()).collect();
            if !joined.is_empty() {
                params.push(("loaders".into(), joined.join(",")));
            }
        }
        if let Some(tags) = query.get("tags").and_then(|v| v.as_array()) {
            let joined: Vec<&str> = tags.iter().filter_map(|v| v.as_str()).collect();
            if !joined.is_empty() {
                params.push(("tags".into(), joined.join(",")));
            }
        }

        let qs = params
            .iter()
            .map(|(k, v)| format!("{k}={}", urlencoding_simple(v)))
            .collect::<Vec<_>>()
            .join("&");
        let data = self.api_get(&format!("/search?{qs}")).await?;
        let hits = data
            .get("hits")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter_map(normalize_hit)
            .collect::<Vec<_>>();
        let total = data
            .get("total")
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
        let page = self
            .api_get(&format!(
                "/projects/{}?locale=ja",
                urlencoding_simple(project_id)
            ))
            .await?;
        // Ensure provider is stamped on the nested project object.
        if let Some(project) = page.get("project").cloned() {
            if let Some(hit) = normalize_hit(project) {
                let mut out = page;
                if let Some(obj) = out.as_object_mut() {
                    obj.insert("project".into(), hit);
                }
                return Ok(out);
            }
        }
        Ok(page)
    }

    pub async fn list_versions(
        &self,
        project_id: &str,
        game_version: Option<&str>,
        loaders: &[String],
    ) -> CoreResult<Vec<Value>> {
        let mut params = Vec::new();
        if let Some(gv) = game_version.filter(|s| !s.is_empty()) {
            params.push(format!("gameVersion={}", urlencoding_simple(gv)));
        }
        if !loaders.is_empty() {
            params.push(format!(
                "loaders={}",
                urlencoding_simple(&loaders.join(","))
            ));
        }
        let qs = if params.is_empty() {
            String::new()
        } else {
            format!("?{}", params.join("&"))
        };
        let versions = self
            .api_get(&format!(
                "/projects/{}/versions{qs}",
                urlencoding_simple(project_id)
            ))
            .await?;
        Ok(versions.as_array().cloned().unwrap_or_default())
    }

    pub async fn resolve_install(
        &self,
        project_id: &str,
        category: &str,
        version_id: Option<&str>,
        game_version: Option<&str>,
        loaders: &[String],
    ) -> CoreResult<ResolvedContentFile> {
        let mut params = vec![
            format!("projectId={}", urlencoding_simple(project_id)),
            format!("category={}", urlencoding_simple(category)),
        ];
        if let Some(vid) = version_id.filter(|s| !s.is_empty()) {
            params.push(format!("versionId={}", urlencoding_simple(vid)));
        }
        if let Some(gv) = game_version.filter(|s| !s.is_empty()) {
            params.push(format!("gameVersion={}", urlencoding_simple(gv)));
        }
        if !loaders.is_empty() {
            params.push(format!(
                "loaders={}",
                urlencoding_simple(&loaders.join(","))
            ));
        }
        let data = self
            .api_get(&format!("/resolve?{}", params.join("&")))
            .await?;
        let download_url = data
            .get("downloadUrl")
            .and_then(|v| v.as_str())
            .ok_or_else(|| CoreError::msg("Compatible version not found on folne"))?
            .to_string();
        let file_name = data
            .get("fileName")
            .and_then(|v| v.as_str())
            .ok_or_else(|| CoreError::msg("Compatible version not found on folne"))?
            .to_string();
        Ok(ResolvedContentFile {
            provider: "folne".into(),
            project_id: data
                .get("projectId")
                .and_then(|v| v.as_str())
                .unwrap_or(project_id)
                .to_string(),
            version_id: data
                .get("versionId")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            slug: data
                .get("slug")
                .and_then(|v| v.as_str())
                .unwrap_or(project_id)
                .to_string(),
            name: data
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or(project_id)
                .to_string(),
            version_number: data
                .get("versionNumber")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            category: data
                .get("category")
                .and_then(|v| v.as_str())
                .unwrap_or(category)
                .to_string(),
            file_name,
            download_url,
            icon_url: data
                .get("iconUrl")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            sha1: data
                .get("sha1")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            sha512: data
                .get("sha512")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            size: data.get("size").and_then(|v| v.as_u64()),
        })
    }
}

fn normalize_hit(raw: Value) -> Option<Value> {
    let obj = raw.as_object()?;
    let id = obj.get("id")?.as_str()?.to_string();
    let project_type = obj.get("projectType")?.as_str()?.to_string();
    let mut out = json!({
      "provider": "folne",
      "id": id,
      "slug": obj.get("slug").and_then(|v| v.as_str()).unwrap_or(""),
      "name": obj.get("name").and_then(|v| v.as_str()).unwrap_or(""),
      "description": obj.get("description").and_then(|v| v.as_str()).unwrap_or(""),
      "iconUrl": obj.get("iconUrl"),
      "downloads": obj.get("downloads").and_then(|v| v.as_u64()).unwrap_or(0),
      "follows": obj.get("follows").and_then(|v| v.as_u64()).unwrap_or(0),
      "author": obj.get("author"),
      "displayCategories": obj.get("displayCategories").cloned().unwrap_or(json!([])),
      "dateModified": obj.get("dateModified"),
      "categories": obj.get("categories").cloned().unwrap_or(json!([])),
      "gameVersions": obj.get("gameVersions").cloned().unwrap_or(json!([])),
      "loaders": obj.get("loaders").cloned().unwrap_or(json!([])),
      "projectType": project_type
    });
    // Preserve detail-only fields when present.
    if let Some(body) = obj.get("body") {
        out.as_object_mut()?.insert("body".into(), body.clone());
    }
    if let Some(published) = obj.get("publishedAt") {
        out.as_object_mut()?
            .insert("publishedAt".into(), published.clone());
    }
    if let Some(donation) = obj.get("donationUrls") {
        out.as_object_mut()?
            .insert("donationUrls".into(), donation.clone());
    }
    if let Some(members) = obj.get("members") {
        out.as_object_mut()?
            .insert("members".into(), members.clone());
    }
    if let Some(gallery) = obj.get("gallery") {
        out.as_object_mut()?
            .insert("gallery".into(), gallery.clone());
    }
    Some(out)
}

fn urlencoding_simple(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
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
