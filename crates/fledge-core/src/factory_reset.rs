use crate::error::CoreResult;
use crate::paths::PathLayout;
use std::fs;
use std::path::Path;

/// Wipe launcher settings and game data folders (binary install stays).
pub fn factory_reset(layout: &PathLayout, settings_root: &Path, config_root: &Path) -> CoreResult<()> {
    let settings_targets = [
        layout.settings.as_str(),
        layout.accounts.as_str(),
        layout.logs.as_str(),
        layout.news.as_str(),
    ];
    for target in settings_targets {
        safe_rm(Path::new(target));
    }
    // custom-root pointer
    safe_rm(&settings_root.join("custom-root.json"));

    wipe_config_root(config_root);
    if is_dedicated_game_data_bundle(config_root) {
        safe_rm(config_root);
    }

    Ok(())
}

fn wipe_config_root(root: &Path) {
    let names = [
        "instances",
        "meta",
        "caches",
        "temp",
        "skins",
        "java",
        "logs",
        "news",
        "synced-options",
        "Data",
        "Instances",
        "profiles",
        "data-root.json",
    ];
    for name in names {
        safe_rm(&root.join(name));
    }
}

fn is_dedicated_game_data_bundle(root: &Path) -> bool {
    root.file_name()
        .and_then(|s| s.to_str())
        .map(|s| {
            let lower = s.to_lowercase();
            lower == "data" || lower == "instance"
        })
        .unwrap_or(false)
}

fn safe_rm(path: &Path) {
    if !path.exists() {
        return;
    }
    let result = if path.is_dir() {
        fs::remove_dir_all(path)
    } else {
        fs::remove_file(path)
    };
    if let Err(err) = result {
        tracing::warn!("factory reset could not remove {}: {err}", path.display());
    }
}
