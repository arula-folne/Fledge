use fledge_core::{AppState, CreateDefaults};
use serde_json::{json, Value};
use std::sync::Arc;
use tauri::{AppHandle, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
pub async fn fledge_invoke(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, Arc<AppState>>,
    method: String,
    args: Option<Value>,
) -> Result<Value, String> {
    let args = args.unwrap_or(Value::Null);
    dispatch(&app, &window, state.inner(), &method, args).await
}

async fn dispatch(
    app: &AppHandle,
    window: &WebviewWindow,
    state: &Arc<AppState>,
    method: &str,
    args: Value,
) -> Result<Value, String> {
    match method {
        // settings
        "settings:get" => state.settings.get().map_err(map_err),
        "settings:set" => {
            let touches_window = crate::window_chrome::settings_patch_touches_window(&args);
            let discord_changed = args.get("discordRichPresence").is_some();
            let next = state.settings.set(args).map_err(map_err)?;
            state.auth.set_client_id(
                next.get("msaClientId").and_then(|v| v.as_str()),
            );
            if touches_window {
                crate::window_chrome::apply_launcher_window_size(window, &next);
            }
            if discord_changed {
                let enabled = next
                    .get("discordRichPresence")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                state.discord.set_enabled(enabled);
            }
            Ok(next)
        }
        "settings:reset" => {
            let next = state.settings.reset().map_err(map_err)?;
            crate::window_chrome::apply_launcher_window_size(window, &next);
            let enabled = next
                .get("discordRichPresence")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            state.discord.set_enabled(enabled);
            Ok(next)
        }
        "settings:export-options" => {
            let dest = app
                .dialog()
                .file()
                .set_file_name("option.flg")
                .add_filter("Fledge Options", &["flg"])
                .blocking_save_file()
                .map(|p| p.to_string());
            let Some(mut path) = dest else {
                return Ok(Value::Null);
            };
            if !path.to_ascii_lowercase().ends_with(".flg") {
                path.push_str(".flg");
            }
            fledge_core::write_options_flg_file(&state.settings, &path).map_err(map_err)?;
            Ok(json!(path))
        }
        "settings:import-options" => {
            let file = app
                .dialog()
                .file()
                .add_filter("Fledge Options", &["flg"])
                .blocking_pick_file()
                .map(|p| p.to_string());
            let Some(path) = file else {
                return Ok(Value::Null);
            };
            let next =
                fledge_core::read_and_import_options_flg_file(&state.settings, &path)
                    .map_err(map_err)?;
            state.auth.set_client_id(
                next.get("msaClientId").and_then(|v| v.as_str()),
            );
            crate::window_chrome::apply_launcher_window_size(window, &next);
            let enabled = next
                .get("discordRichPresence")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            state.discord.set_enabled(enabled);
            Ok(next)
        }
        // paths
        "paths:get" => Ok(state.path_info()),
        "paths:get-app-directory" => Ok(state.app_directory_info()),
        "paths:set-app-directory" => {
            let next = if args.is_null() {
                None
            } else if let Some(s) = args.as_str() {
                Some(s.to_string())
            } else {
                return Err("path must be a string or null".into());
            };
            state
                .set_app_directory(next.as_deref())
                .map_err(map_err)
        }
        "paths:open" | "shell:open-path" => {
            let target = first_string(&args).ok_or_else(|| "path required".to_string())?;
            app.opener()
                .open_path(target, None::<&str>)
                .map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
        "dialog:select-folder" => {
            let folder = app
                .dialog()
                .file()
                .blocking_pick_folder()
                .map(|p| p.to_string());
            Ok(json!(folder))
        }

        // instances
        "instances:list" => state
            .instances
            .list()
            .map(|v| json!(v))
            .map_err(map_err),
        "instances:get" => {
            let id = first_string(&args).ok_or_else(|| "id required".to_string())?;
            state
                .instances
                .get(&id)
                .map(|v| json!(v))
                .map_err(map_err)
        }
        "instances:create" => create_instance(state, &args),
        "instances:update" => {
            let (id, partial) = two_args(&args)?;
            let id = id.as_str().ok_or_else(|| "id required".to_string())?;
            let updated = state
                .instances
                .update(id, &partial)
                .map_err(map_err)?;
            Ok(updated)
        }
        "instances:duplicate" => {
            let id = first_string(&args).ok_or_else(|| "id required".to_string())?;
            let copied = state.instances.duplicate(&id).map_err(map_err)?;
            let order = state.string_list_from_settings("libraryInstanceOrder");
            let at = order.iter().position(|x| x == &id);
            let mut next_order = order;
            if let Some(idx) = at {
                next_order.insert(idx + 1, copied["id"].as_str().unwrap().to_string());
            } else {
                next_order.push(copied["id"].as_str().unwrap().to_string());
            }
            state
                .settings
                .set(json!({ "libraryInstanceOrder": next_order }))
                .map_err(map_err)?;
            Ok(copied)
        }
        "instances:remove" => {
            let id = first_string(&args).ok_or_else(|| "id required".to_string())?;
            state.instances.remove(&id).map_err(map_err)?;
            let list = state.instances.list().map_err(map_err)?;
            let settings = state.settings.get().map_err(map_err)?;
            let selected = settings
                .get("selectedInstanceId")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let last_played = settings
                .get("lastPlayedInstanceId")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let order: Vec<String> = state
                .string_list_from_settings("libraryInstanceOrder")
                .into_iter()
                .filter(|x| x != &id)
                .collect();
            let next_selected = if selected.as_deref() == Some(id.as_str()) {
                list.first()
                    .and_then(|p| p.get("id"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            } else {
                selected
            };
            let next_last = if last_played.as_deref() == Some(id.as_str()) {
                None
            } else {
                last_played
            };
            state
                .settings
                .set(json!({
                  "selectedInstanceId": next_selected,
                  "lastPlayedInstanceId": next_last,
                  "libraryInstanceOrder": order
                }))
                .map_err(map_err)?;
            Ok(Value::Null)
        }
        "instances:open-folder" => {
            let id = first_string(&args).ok_or_else(|| "id required".to_string())?;
            let path = state.instances.instance_dir(&id);
            app.opener()
                .open_path(path.to_string_lossy(), None::<&str>)
                .map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
        "instances:open-subfolder" => {
            let (id_v, sub_v) = two_args(&args)?;
            let id = id_v.as_str().ok_or_else(|| "id required".to_string())?;
            let sub = sub_v.as_str().ok_or_else(|| "subfolder required".to_string())?;
            let path = state
                .instances
                .open_subfolder_path(id, sub)
                .map_err(map_err)?;
            app.opener()
                .open_path(path.to_string_lossy(), None::<&str>)
                .map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
        "instances:get-icon" => {
            let id = first_string(&args).ok_or_else(|| "id required".to_string())?;
            state
                .instances
                .get_icon_data_url(&id)
                .map(|v| json!(v))
                .map_err(map_err)
        }

        // auth
        "auth:session" => {
            let (account, status) = state.auth.get_session().map_err(map_err)?;
            Ok(json!({
              "account": account,
              "status": status.as_str()
            }))
        }
        "auth:list" => state
            .auth
            .list_accounts()
            .map(|v| json!(v))
            .map_err(map_err),
        "auth:login" => {
            let client_id = state.auth.client_id();
            let code = crate::login_window::capture_microsoft_auth_code(app, &client_id).await?;
            let account = state
                .auth
                .login_with_code(&code)
                .await
                .map_err(map_err)?;
            // Sync msa client id from settings after login in case it changed
            if let Ok(settings) = state.settings.get() {
                state.auth.set_client_id(
                    settings
                        .get("msaClientId")
                        .and_then(|v| v.as_str()),
                );
            }
            import_microsoft_skin_best_effort(state, &account.id).await;
            Ok(serde_json::to_value(account).unwrap_or(Value::Null))
        }
        "auth:logout" => {
            let id = first_string(&args);
            state
                .auth
                .logout(id.as_deref())
                .map_err(map_err)?;
            Ok(Value::Null)
        }
        "auth:switch" => {
            let id = first_string(&args).ok_or_else(|| "accountId required".to_string())?;
            let account = state.auth.switch_account(&id).map_err(map_err)?;
            // Best-effort refresh in background
            let auth = Arc::clone(&state.auth);
            let id2 = id.clone();
            let state2 = Arc::clone(state);
            tauri::async_runtime::spawn(async move {
                let _ = auth.ensure_credentials(Some(&id2)).await;
                import_microsoft_skin_best_effort(&state2, &id2).await;
            });
            Ok(serde_json::to_value(account).unwrap_or(Value::Null))
        }
        "auth:remove" => {
            let id = first_string(&args).ok_or_else(|| "accountId required".to_string())?;
            state.auth.logout(Some(&id)).map_err(map_err)?;
            Ok(Value::Null)
        }

        // news
        "news:list" => state.news.list().await.map_err(map_err),

        // versions
        "versions:list-minecraft" => {
            let include_snapshots = args
                .get("includeSnapshots")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);
            let force = args
                .get("force")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let result = state
                .versions
                .list_minecraft_versions(include_snapshots, force)
                .await
                .map_err(map_err)?;
            Ok(serde_json::to_value(result).unwrap_or(Value::Null))
        }
        "versions:list-loaders" => {
            let loader = args
                .get("loader")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "loader required".to_string())?;
            let minecraft_version = args
                .get("minecraftVersion")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "minecraftVersion required".to_string())?;
            let force = args
                .get("force")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let result = state
                .versions
                .list_loader_versions(loader, minecraft_version, force)
                .await
                .map_err(map_err)?;
            Ok(serde_json::to_value(result).unwrap_or(Value::Null))
        }
        "versions:list-loader-games" => {
            let loader = args
                .get("loader")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "loader required".to_string())?;
            let force = args
                .get("force")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let result = state
                .versions
                .list_loader_game_versions(loader, force)
                .await
                .map_err(map_err)?;
            Ok(serde_json::to_value(result).unwrap_or(Value::Null))
        }
        "versions:refresh" => {
            let target = args.get("target").and_then(|v| v.as_str());
            let mc = args.get("minecraftVersion").and_then(|v| v.as_str());
            state
                .versions
                .refresh(target, mc)
                .await
                .map_err(map_err)?;
            Ok(Value::Null)
        }

        // java
        "java:list" => state
            .java
            .list_runtimes()
            .map(|v| serde_json::to_value(v).unwrap_or(Value::Null))
            .map_err(map_err),
        "java:install" => {
            let major = first_u32(&args).ok_or_else(|| "major required".to_string())?;
            let view = state.java.install(major).await.map_err(map_err)?;
            Ok(serde_json::to_value(view).unwrap_or(Value::Null))
        }
        "java:reinstall" => {
            let major = first_u32(&args).ok_or_else(|| "major required".to_string())?;
            let view = state.java.reinstall(major).await.map_err(map_err)?;
            Ok(serde_json::to_value(view).unwrap_or(Value::Null))
        }
        "java:uninstall" => {
            let major = first_u32(&args).ok_or_else(|| "major required".to_string())?;
            let view = state.java.uninstall(major).await.map_err(map_err)?;
            Ok(serde_json::to_value(view).unwrap_or(Value::Null))
        }
        "java:verify" => {
            let major = first_u32(&args).ok_or_else(|| "major required".to_string())?;
            let result = state.java.verify(major).map_err(map_err)?;
            Ok(serde_json::to_value(result).unwrap_or(Value::Null))
        }
        "java:open-folder" => {
            let major = first_u32(&args).ok_or_else(|| "major required".to_string())?;
            let view = state.java.get_runtime_view(major).map_err(map_err)?;
            let target = if view.installed {
                view.java_path
                    .as_ref()
                    .and_then(|p| std::path::Path::new(p).parent())
                    .map(|p| p.to_string_lossy().into_owned())
                    .unwrap_or(view.install_dir)
            } else if view.removable {
                view.install_dir
            } else {
                std::path::Path::new(&view.install_dir)
                    .parent()
                    .map(|p| p.to_string_lossy().into_owned())
                    .unwrap_or(view.install_dir)
            };
            let _ = std::fs::create_dir_all(&target);
            app.opener()
                .open_path(target, None::<&str>)
                .map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }

        "content:providers" => Ok(state.content.list_providers()),
        "content:search" => state.content.search(&args).await.map_err(map_err),
        "content:get-project" => {
            let id = first_string(&args).ok_or_else(|| "projectId required".to_string())?;
            state.content.get_project(&id).await.map_err(map_err)
        }
        "content:list-versions" => state.content.list_versions(&args).await.map_err(map_err),
        "content:install" => {
            let result = state.content.install(&args).await.map_err(map_err)?;
            Ok(result)
        }
        "content:list-installed" => {
            let (id_v, cat_v) = two_args_optional(&args)?;
            let id = id_v
                .as_str()
                .or_else(|| args.as_str())
                .ok_or_else(|| "instanceId required".to_string())?;
            let category = cat_v.and_then(|v| v.as_str().map(|s| s.to_string()));
            state
                .content
                .list_installed(id, category.as_deref())
                .await
                .map_err(map_err)
        }
        "content:set-enabled" => {
            let (id, entry, enabled) = three_args(&args)?;
            let id = id.as_str().ok_or_else(|| "instanceId required".to_string())?;
            let entry = entry.as_str().ok_or_else(|| "entryId required".to_string())?;
            let enabled = enabled.as_bool().ok_or_else(|| "enabled required".to_string())?;
            let result = state
                .content
                .set_enabled(id, entry, enabled)
                .map_err(map_err)?;
            Ok(result)
        }
        "content:remove" => {
            let (id, entry) = two_args(&args)?;
            let id = id.as_str().ok_or_else(|| "instanceId required".to_string())?;
            let entry = entry.as_str().ok_or_else(|| "entryId required".to_string())?;
            state.content.remove(id, entry).map_err(map_err)?;
            Ok(Value::Null)
        }
        "content:check-updates" => {
            let id = first_string(&args).ok_or_else(|| "instanceId required".to_string())?;
            state.content.check_updates(&id).await.map_err(map_err)
        }
        "content:list-media" => {
            let (id, kind) = two_args(&args)?;
            let id = id.as_str().ok_or_else(|| "instanceId required".to_string())?;
            let kind = kind.as_str().ok_or_else(|| "kind required".to_string())?;
            state.content.list_media(id, kind).map_err(map_err)
        }
        "content:delete-media" => {
            let (id, kind, file) = three_args(&args)?;
            let id = id.as_str().ok_or_else(|| "instanceId required".to_string())?;
            let kind = kind.as_str().ok_or_else(|| "kind required".to_string())?;
            let file = file.as_str().ok_or_else(|| "fileName required".to_string())?;
            state
                .content
                .delete_media(id, kind, file)
                .map_err(map_err)?;
            Ok(Value::Null)
        }
        "content:copy-screenshot" => {
            let (id, file) = two_args(&args)?;
            let id = id.as_str().ok_or_else(|| "instanceId required".to_string())?;
            let file = file.as_str().ok_or_else(|| "fileName required".to_string())?;
            let path = state
                .content
                .resolve_screenshot_path(id, file)
                .map_err(map_err)?;
            copy_image_to_clipboard(&path)?;
            Ok(Value::Null)
        }
        "content:read-log" => {
            let (id, file) = two_args(&args)?;
            let id = id.as_str().ok_or_else(|| "instanceId required".to_string())?;
            let file = file.as_str().ok_or_else(|| "fileName required".to_string())?;
            state.content.read_log_file(id, file).map_err(map_err)
        }
        "content:list-category-tags" => state.content.list_category_tags().await.map_err(map_err),
        "content:create-instance" => {
            let profile = state
                .content
                .create_instance_from_project(&args)
                .await
                .map_err(map_err)?;
            Ok(profile)
        }
        "content:pick-mrpack" => {
            let file = app
                .dialog()
                .file()
                .add_filter("Modrinth Modpack", &["mrpack"])
                .blocking_pick_file()
                .map(|p| p.to_string());
            Ok(json!(file))
        }
        "content:import-mrpack" => {
            let file = app
                .dialog()
                .file()
                .add_filter("Modrinth Modpack", &["mrpack"])
                .blocking_pick_file()
                .map(|p| p.to_string());
            let Some(path) = file else {
                return Ok(Value::Null);
            };
            let profile = state
                .content
                .import_mrpack_from_file(&path)
                .await
                .map_err(map_err)?;
            Ok(profile)
        }
        "content:import-mrpack-from-path" => {
            let path = first_string(&args).ok_or_else(|| "filePath required".to_string())?;
            let profile = state
                .content
                .import_mrpack_from_file(&path)
                .await
                .map_err(map_err)?;
            Ok(profile)
        }
        "content:list-mrpack-export-candidates" => {
            let id = first_string(&args).ok_or_else(|| "instanceId required".to_string())?;
            state
                .content
                .list_mrpack_export_candidates(&id)
                .await
                .map_err(map_err)
        }
        "content:export-mrpack" => {
            let (id_v, opts_v) = two_args_optional(&args)?;
            let id = id_v
                .as_str()
                .ok_or_else(|| "instanceId required".to_string())?;
            let profile = state
                .instances
                .get(id)
                .map_err(map_err)?
                .ok_or_else(|| format!("Instance not found: {id}"))?;
            let name = profile
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("modpack");
            let safe_name: String = name
                .chars()
                .map(|c| {
                    if r#"<>:"/\|?*"#.contains(c) || (c as u32) < 32 {
                        '_'
                    } else {
                        c
                    }
                })
                .collect();
            let safe_name = if safe_name.trim().is_empty() {
                "modpack".into()
            } else {
                safe_name
            };
            let dest = app
                .dialog()
                .file()
                .set_file_name(format!("{safe_name}.mrpack"))
                .add_filter("Modrinth Modpack", &["mrpack"])
                .blocking_save_file()
                .map(|p| p.to_string());
            let Some(mut path) = dest else {
                return Ok(Value::Null);
            };
            if !path.to_ascii_lowercase().ends_with(".mrpack") {
                path.push_str(".mrpack");
            }
            state
                .content
                .export_mrpack(id, &path, opts_v.as_ref())
                .await
                .map_err(map_err)?;
            Ok(json!(path))
        }

        // skins
        "skins:list" => state.skins.list().map_err(map_err),
        "skins:upload" => {
            let name = args
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("Skin");
            let model = args
                .get("model")
                .and_then(|v| v.as_str())
                .unwrap_or("wide");
            let original = args
                .get("originalName")
                .and_then(|v| v.as_str())
                .unwrap_or("skin.png");
            let bytes = args
                .get("bytes")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_u64().map(|n| n as u8))
                        .collect::<Vec<_>>()
                })
                .ok_or_else(|| "bytes required".to_string())?;
            let thumb = args
                .get("thumbDataUrl")
                .and_then(|v| v.as_str())
                .map(fledge_core::decode_thumb_data_url)
                .transpose()
                .map_err(map_err)?;
            let skin = state
                .skins
                .upload(
                    name,
                    model,
                    &bytes,
                    original,
                    thumb
                        .as_ref()
                        .map(|(b, e)| (b.as_slice(), e.as_str())),
                    false,
                )
                .map_err(map_err)?;
            Ok(skin)
        }
        "skins:update" => {
            let id = args
                .get("id")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "id required".to_string())?;
            let name = args.get("name").and_then(|v| v.as_str());
            let model = args.get("model").and_then(|v| v.as_str());
            let original = args.get("originalName").and_then(|v| v.as_str());
            let bytes = args.get("bytes").and_then(|v| v.as_array()).map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_u64().map(|n| n as u8))
                    .collect::<Vec<_>>()
            });
            let skin = state
                .skins
                .update(id, name, model, bytes.as_deref(), original)
                .map_err(map_err)?;
            let settings = state.settings.get().map_err(map_err)?;
            if settings.get("selectedSkinId").and_then(|v| v.as_str()) == Some(id) {
                let apply_model = model.or_else(|| {
                    settings
                        .get("skinModel")
                        .and_then(|v| v.as_str())
                });
                if let Some(model) = model {
                    state
                        .settings
                        .set(json!({ "skinModel": model }))
                        .map_err(map_err)?;
                }
                if bytes.is_some() || model.is_some() {
                    if let Some(m) = apply_model {
                        schedule_skin_apply(state, id, m);
                    }
                }
            }
            Ok(skin)
        }
        "skins:remove" => {
            let id = first_string(&args).ok_or_else(|| "id required".to_string())?;
            state.skins.remove(&id).map_err(map_err)?;
            let settings = state.settings.get().map_err(map_err)?;
            if settings.get("selectedSkinId").and_then(|v| v.as_str()) == Some(id.as_str()) {
                state
                    .settings
                    .set(json!({ "selectedSkinId": "steve", "skinModel": "wide" }))
                    .map_err(map_err)?;
                schedule_skin_apply(state, "steve", "wide");
            }
            Ok(Value::Null)
        }
        "skins:get-data" => {
            let id = first_string(&args).ok_or_else(|| "id required".to_string())?;
            state
                .skins
                .read_data_url(&id)
                .map(|v| json!(v))
                .map_err(map_err)
        }
        "skins:resolve-path" => {
            let id = first_string(&args).ok_or_else(|| "id required".to_string())?;
            state
                .skins
                .resolve_png_path(&id)
                .map(|v| json!(v))
                .map_err(map_err)
        }
        "skins:get-thumb" => {
            let (id, model) = two_args(&args)?;
            let id = id.as_str().ok_or_else(|| "id required".to_string())?;
            let model = model.as_str().unwrap_or("wide");
            state
                .skins
                .read_thumb_data_url(id, model)
                .map(|v| json!(v))
                .map_err(map_err)
        }
        "skins:resolve-thumb-path" => {
            let (id, model) = two_args(&args)?;
            let id = id.as_str().ok_or_else(|| "id required".to_string())?;
            let model = model.as_str().unwrap_or("wide");
            state
                .skins
                .resolve_thumb_path(id, model)
                .map(|v| json!(v))
                .map_err(map_err)
        }
        "skins:save-thumb" => {
            let (id, model, data_url) = three_args(&args)?;
            let id = id.as_str().ok_or_else(|| "id required".to_string())?;
            let model = model.as_str().unwrap_or("wide");
            let data_url = data_url
                .as_str()
                .ok_or_else(|| "dataUrl required".to_string())?;
            let (bytes, ext) = fledge_core::decode_thumb_data_url(data_url).map_err(map_err)?;
            state
                .skins
                .write_thumb(id, model, &bytes, &ext)
                .map_err(map_err)?;
            Ok(Value::Null)
        }
        "skins:select" => {
            let skin_id = args
                .get("skinId")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "skinId required".to_string())?;
            let mut patch = json!({ "selectedSkinId": skin_id });
            if let Some(model) = args.get("model").and_then(|v| v.as_str()) {
                patch
                    .as_object_mut()
                    .unwrap()
                    .insert("skinModel".into(), json!(model));
            }
            let next = state.settings.set(patch).map_err(map_err)?;
            let model = next
                .get("skinModel")
                .and_then(|v| v.as_str())
                .unwrap_or("wide");
            let selected = next
                .get("selectedSkinId")
                .and_then(|v| v.as_str())
                .unwrap_or(skin_id);
            schedule_skin_apply(state, selected, model);
            Ok(next)
        }
        "capes:list" => {
            let (account, _) = state.auth.get_session().map_err(map_err)?;
            let Some(account) = account else {
                return Ok(json!([]));
            };
            state
                .skin_applier
                .list_capes(&account.id)
                .await
                .map_err(map_err)
        }
        "capes:select" => {
            let cape_id = if args.is_null() {
                None
            } else {
                args.as_str().map(|s| s.to_string())
            };
            let (account, _) = state.auth.get_session().map_err(map_err)?;
            let account = account.ok_or_else(|| "ログインが必要です".to_string())?;
            state
                .skin_applier
                .select_cape(&account.id, cape_id.as_deref())
                .await
                .map_err(map_err)
        }
        "capes:fetch-texture" => {
            let url = args
                .as_str()
                .ok_or_else(|| "url required".to_string())?;
            let data_url = fledge_core::fetch_cape_texture_data_url(url)
                .await
                .map_err(map_err)?;
            Ok(Value::String(data_url))
        }

        // launch
        "launch:start" => {
            let profile_id = if let Some(arr) = args.as_array() {
                arr.first()
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            } else {
                first_string(&args)
            }
            .or_else(|| {
                args.get("profileId")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            })
            .ok_or_else(|| "profileId required".to_string())?;
            let account_id = args
                .as_array()
                .and_then(|a| a.get(1))
                .and_then(|opts| opts.get("accountId"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .or_else(|| {
                    args.get("accountId")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                });
            state
                .launch
                .start(&profile_id, account_id.as_deref())
                .await
                .map_err(map_err)
        }
        "launch:prepare" => {
            let profile_id = first_string(&args)
                .or_else(|| {
                    args.get("profileId")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                })
                .ok_or_else(|| "profileId required".to_string())?;
            state
                .launch
                .prepare(&profile_id)
                .await
                .map_err(map_err)
        }
        "launch:cancel" => {
            let session_id = first_string(&args);
            state.launch.cancel(session_id.as_deref());
            Ok(Value::Null)
        }
        "launch:kill" => {
            let session_id = first_string(&args);
            state.launch.kill(session_id.as_deref());
            Ok(Value::Null)
        }
        "launch:sessions" => Ok(json!(state.launch.list_sessions())),

        // updater
        "updater:check" => {
            let channel = first_string(&args).unwrap_or_else(|| "stable".into());
            let channel = if channel == "prerelease" {
                "prerelease"
            } else {
                "stable"
            };
            state.updater.check(channel).await.map_err(map_err)
        }
        "updater:apply" => {
            if state.is_dev {
                return Err("updater.noop".into());
            }
            let channel = first_string(&args).unwrap_or_else(|| "stable".into());
            let channel = if channel == "prerelease" {
                "prerelease"
            } else {
                "stable"
            };
            state.updater.apply(channel).await.map_err(map_err)?;
            let handle = app.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_millis(400)).await;
                handle.exit(0);
            });
            Ok(Value::Null)
        }

        // app
        "app:startup-info" => Ok(state.startup_info()),
        "app:relaunch" => {
            app.restart();
        }
        "app:factory-reset" => {
            state.factory_reset().map_err(map_err)?;
            Ok(Value::Null)
        }
        "app:uninstall" => {
            if state.is_dev {
                return Err("settings.uninstallDevOnly".into());
            }
            state.launch.kill(None);
            state.session_proxy.stop();
            tokio::time::sleep(std::time::Duration::from_millis(600)).await;

            let install_root = fledge_core::resolve_install_root();
            if fledge_core::find_uninstaller(&install_root).is_some() {
                fledge_core::schedule_complete_uninstall(&install_root).map_err(map_err)?;
                let handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_millis(400)).await;
                    handle.exit(0);
                });
            } else {
                // No known uninstaller — open Apps & Features so the user can remove Fledge.
                fledge_core::open_apps_and_features().map_err(map_err)?;
            }
            Ok(Value::Null)
        }
        "cache:clear" => Ok(Value::Null),

        // window
        "window:minimize" => {
            window.minimize().map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
        "window:maximize-toggle" => {
            if window.is_maximized().map_err(|e| e.to_string())? {
                window.unmaximize().map_err(|e| e.to_string())?;
            } else {
                window.maximize().map_err(|e| e.to_string())?;
            }
            Ok(Value::Null)
        }
        "window:close" => {
            window.close().map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
        "window:is-maximized" => Ok(json!(window.is_maximized().map_err(|e| e.to_string())?)),

        other => Err(format!("unknown method: {other}")),
    }
}

fn create_instance(state: &Arc<AppState>, args: &Value) -> Result<Value, String> {
    let settings = state.settings.get().map_err(map_err)?;
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
    let profile = state
        .instances
        .create(
            args,
            CreateDefaults {
                memory_max_mb: memory_max,
                jvm_args: &jvm_args,
                seed_minecraft_initial_settings: true,
                pending_minecraft_options: json!({}),
                pending_minecraft_debug_overlay: json!({}),
            },
        )
        .map_err(map_err)?;

    let id = profile["id"].as_str().unwrap().to_string();
    let selected = settings.get("selectedInstanceId").cloned();
    let mut order = state.string_list_from_settings("libraryInstanceOrder");
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
    state.settings.set(patch).map_err(map_err)?;
    Ok(profile)
}

fn map_err(err: impl ToString) -> String {
    err.to_string()
}

fn first_string(args: &Value) -> Option<String> {
    if let Some(s) = args.as_str() {
        return Some(s.to_string());
    }
    if let Some(arr) = args.as_array() {
        if let Some(s) = arr.first().and_then(|v| v.as_str()) {
            return Some(s.to_string());
        }
    }
    args.get("id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            args.get("path")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        })
}

fn first_u32(args: &Value) -> Option<u32> {
    if let Some(n) = args.as_u64() {
        return Some(n as u32);
    }
    if let Some(arr) = args.as_array() {
        if let Some(n) = arr.first().and_then(|v| v.as_u64()) {
            return Some(n as u32);
        }
    }
    args.get("major").and_then(|v| v.as_u64()).map(|n| n as u32)
}

fn two_args(args: &Value) -> Result<(Value, Value), String> {
    if let Some(arr) = args.as_array() {
        if arr.len() >= 2 {
            return Ok((arr[0].clone(), arr[1].clone()));
        }
    }
    Err("expected [arg0, arg1]".into())
}

fn three_args(args: &Value) -> Result<(Value, Value, Value), String> {
    if let Some(arr) = args.as_array() {
        if arr.len() >= 3 {
            return Ok((arr[0].clone(), arr[1].clone(), arr[2].clone()));
        }
    }
    Err("expected [arg0, arg1, arg2]".into())
}

fn two_args_optional(args: &Value) -> Result<(Value, Option<Value>), String> {
    if let Some(arr) = args.as_array() {
        let first = arr.first().cloned().unwrap_or(Value::Null);
        let second = arr.get(1).cloned();
        return Ok((first, second));
    }
    Ok((args.clone(), None))
}

fn schedule_skin_apply(state: &Arc<AppState>, skin_id: &str, model: &str) {
    let applier = Arc::clone(&state.skin_applier);
    let launch = Arc::clone(&state.launch);
    let auth = Arc::clone(&state.auth);
    let settings = Arc::clone(&state.settings);
    let skin_id = skin_id.to_string();
    let model = model.to_string();
    tauri::async_runtime::spawn(async move {
        let mut ids = launch.busy_account_ids();
        if ids.is_empty() {
            if let Ok((Some(account), _)) = auth.get_session() {
                ids.push(account.id);
            }
        }
        let cape_id = settings
            .get()
            .ok()
            .and_then(|s| {
                s.get("skinCapeIds")
                    .and_then(|m| m.as_object())
                    .and_then(|m| m.get(&skin_id))
                    .map(|v| v.as_str().map(|s| s.to_string()))
            });
        for account_id in ids {
            let _ = applier.apply(&skin_id, &model, &account_id).await;
            // Some(None) = 明示的にマントなし / Some(Some(id)) = 指定マント / None = 未設定で触れない
            if let Some(cape) = &cape_id {
                let _ = applier
                    .select_cape(&account_id, cape.as_deref())
                    .await;
            }
        }
    });
}

async fn import_microsoft_skin_best_effort(state: &Arc<AppState>, account_id: &str) {
    let Ok(creds) = state.auth.ensure_credentials(Some(account_id)).await else {
        return;
    };
    let Some(token) = creds.get("accessToken").and_then(|v| v.as_str()) else {
        return;
    };
    let Ok(Some((png, model))) =
        fledge_core::fetch_active_minecraft_skin(token).await
    else {
        return;
    };
    let digest = fledge_core::hash_skin_png(&png);
    let Ok(list) = state.skins.list() else {
        return;
    };
    if let Some(arr) = list.as_array() {
        for existing in arr.iter().filter(|s| s.get("source").and_then(|v| v.as_str()) == Some("upload")) {
            let Some(id) = existing.get("id").and_then(|v| v.as_str()) else {
                continue;
            };
            if let Ok(Some(hash)) = state.skins.hash_uploaded_png(id) {
                if hash == digest {
                    let _ = state.settings.set(json!({
                      "selectedSkinId": id,
                      "skinModel": model
                    }));
                    return;
                }
            }
        }
    }
    let name = format!(
        "{} のスキン",
        state
            .auth
            .list_accounts()
            .ok()
            .and_then(|accounts| {
                accounts
                    .into_iter()
                    .find(|a| a.id == account_id)
                    .map(|a| a.display_name)
            })
            .unwrap_or_else(|| "Microsoft".into())
    );
    if let Ok(skin) = state.skins.upload(
        &name,
        &model,
        &png,
        "microsoft-skin.png",
        None,
        true,
    ) {
        if let Some(id) = skin.get("id").and_then(|v| v.as_str()) {
            let _ = state.settings.set(json!({
              "selectedSkinId": id,
              "skinModel": model
            }));
        }
    }
}

fn copy_image_to_clipboard(path: &std::path::Path) -> Result<(), String> {
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    let img = image_from_bytes(&bytes)?;
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_image(img).map_err(|e| e.to_string())?;
    Ok(())
}

fn image_from_bytes(bytes: &[u8]) -> Result<arboard::ImageData<'static>, String> {
    let img = image::load_from_memory(bytes).map_err(|_| "library.screenshotCopyFailed".to_string())?;
    let rgba = img.to_rgba8();
    let (w, h) = rgba.dimensions();
    Ok(arboard::ImageData {
        width: w as usize,
        height: h as usize,
        bytes: std::borrow::Cow::Owned(rgba.into_raw()),
    })
}
