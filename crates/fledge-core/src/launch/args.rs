//! Build Java command line for Minecraft (classpath, memory, session host, templates).

use crate::minecraft::{library_artifact_rel_path, natives_root, ResolvedVersion};
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

pub const LAUNCHER_NAME: &str = "Fledge";
pub const LAUNCHER_VERSION: &str = "0.5.0";

const VANILLA_DISCORD_DETECT: &str =
    "-DAllowMcDiscordDetection=net.minecraft.client.main.Main";
const DISABLE_VANILLA_DISCORD: &str = "-Dminecraft.client.discord.disable=true";

#[derive(Debug, Clone)]
pub struct LaunchCredentials {
    pub uuid: String,
    pub name: String,
    pub access_token: String,
}

#[derive(Debug, Clone)]
pub struct DisplayOptions {
    pub fullscreen: bool,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone)]
pub struct LaunchArgInput {
    pub java_path: String,
    pub version_id: String,
    pub minecraft_root: PathBuf,
    pub instance_dir: PathBuf,
    pub resolved: ResolvedVersion,
    pub credentials: LaunchCredentials,
    pub memory_min_mb: u64,
    pub memory_max_mb: u64,
    pub extra_jvm_args: Vec<String>,
    pub display: DisplayOptions,
    pub fledge_discord_rpc: bool,
    pub session_host: Option<String>,
}

pub fn build_java_command(input: &LaunchArgInput) -> Vec<String> {
    let natives = natives_root(&input.minecraft_root, &input.version_id);
    let classpath = build_classpath(
        &input.minecraft_root,
        &input.resolved,
        &input.version_id,
    );
    let assets_root = input.minecraft_root.join("assets");
    let assets_index = input
        .resolved
        .asset_index
        .as_ref()
        .map(|a| a.id.clone())
        .or_else(|| input.resolved.assets.clone())
        .unwrap_or_else(|| "legacy".into());
    let version_type = input
        .resolved
        .version_type
        .clone()
        .unwrap_or_else(|| "release".into());
    let version_name = input.version_id.clone();

    let mut vars: HashMap<String, String> = HashMap::new();
    vars.insert(
        "natives_directory".into(),
        natives.to_string_lossy().into_owned(),
    );
    vars.insert("launcher_name".into(), LAUNCHER_NAME.into());
    vars.insert("launcher_version".into(), LAUNCHER_VERSION.into());
    vars.insert("classpath".into(), classpath);
    vars.insert("auth_player_name".into(), input.credentials.name.clone());
    vars.insert("version_name".into(), version_name.clone());
    vars.insert(
        "game_directory".into(),
        input.instance_dir.to_string_lossy().into_owned(),
    );
    vars.insert(
        "assets_root".into(),
        assets_root.to_string_lossy().into_owned(),
    );
    vars.insert("assets_index_name".into(), assets_index);
    vars.insert("auth_uuid".into(), input.credentials.uuid.clone());
    vars.insert(
        "auth_access_token".into(),
        input.credentials.access_token.clone(),
    );
    vars.insert("clientid".into(), String::new());
    vars.insert("auth_xuid".into(), String::new());
    vars.insert("user_type".into(), "msa".into());
    vars.insert("version_type".into(), version_type);
    vars.insert("resolution_width".into(), input.display.width.to_string());
    vars.insert(
        "resolution_height".into(),
        input.display.height.to_string(),
    );

    let mut args = Vec::new();
    args.push(input.java_path.clone());

    // Memory
    args.push(format!("-Xms{}M", input.memory_min_mb));
    args.push(format!("-Xmx{}M", input.memory_max_mb));

    // Extra JVM (discord + session host)
    let extras = with_launch_jvm_args(
        &input.extra_jvm_args,
        input.fledge_discord_rpc,
        input.session_host.as_deref(),
    );
    for e in extras {
        args.push(substitute(&e, &vars));
    }

    // Version JVM args
    for a in &input.resolved.jvm_args {
        args.push(substitute(a, &vars));
    }

    // Ensure natives path if missing from version args
    let has_natives = args.iter().any(|a| a.contains("java.library.path"));
    if !has_natives {
        // 旧 JSON: サブディレクトリ無し。26.x 系は version JVM 引数側に /java 付きで入る。
        let lib_path = library_path_when_missing(&input.resolved.jvm_args, &natives);
        args.push(format!(
            "-Djava.library.path={}",
            lib_path.to_string_lossy()
        ));
    }
    let has_cp = args.iter().any(|a| a == "-cp" || a == "-classpath");
    if !has_cp {
        args.push("-cp".into());
        args.push(vars["classpath"].clone());
    }

    args.push(input.resolved.main_class.clone());

    for a in &input.resolved.game_args {
        args.push(substitute(a, &vars));
    }

    if input.display.fullscreen {
        if !args.iter().any(|a| a == "--fullscreen") {
            args.push("--fullscreen".into());
        }
    } else {
        // width/height usually via templates; ensure present for legacy
        if !args.iter().any(|a| a == "--width") {
            args.push("--width".into());
            args.push(input.display.width.to_string());
            args.push("--height".into());
            args.push(input.display.height.to_string());
        }
    }

    args
}

fn build_classpath(
    minecraft_root: &Path,
    resolved: &ResolvedVersion,
    version_id: &str,
) -> String {
    let mut entries = Vec::new();
    for lib in &resolved.libraries {
        if lib.is_native_only {
            continue;
        }
        if let Some(rel) = library_artifact_rel_path(lib) {
            entries.push(
                minecraft_root
                    .join("libraries")
                    .join(rel)
                    .to_string_lossy()
                    .into_owned(),
            );
        }
    }
    let jar_id = resolved
        .jar
        .as_deref()
        .or(resolved.minecraft_version.as_deref())
        .unwrap_or(version_id);
    entries.push(
        minecraft_root
            .join("versions")
            .join(jar_id)
            .join(format!("{jar_id}.jar"))
            .to_string_lossy()
            .into_owned(),
    );
    entries.join(";")
}

pub fn session_host_jvm_args(session_host: &str) -> Vec<String> {
    vec![
        "-Dminecraft.api.env=custom".into(),
        "-Dminecraft.api.auth.host=https://authserver.mojang.com".into(),
        "-Dminecraft.api.account.host=https://api.mojang.com".into(),
        format!("-Dminecraft.api.session.host={session_host}"),
        "-Dminecraft.api.services.host=https://api.minecraftservices.com".into(),
        "-Dminecraft.api.profiles.host=https://api.mojang.com".into(),
    ]
}

fn with_discord_jvm_args(base: &[String], fledge_rpc: bool) -> Vec<String> {
    let mut next: Vec<String> = base
        .iter()
        .filter(|arg| {
            *arg != VANILLA_DISCORD_DETECT
                && *arg != DISABLE_VANILLA_DISCORD
                && !arg.starts_with("-DAllowMcDiscordDetection=")
        })
        .cloned()
        .collect();
    if fledge_rpc {
        next.push(DISABLE_VANILLA_DISCORD.into());
    } else {
        next.push(VANILLA_DISCORD_DETECT.into());
    }
    next
}

fn with_launch_jvm_args(
    base: &[String],
    fledge_rpc: bool,
    session_host: Option<&str>,
) -> Vec<String> {
    let mut next = with_discord_jvm_args(base, fledge_rpc)
        .into_iter()
        .filter(|arg| {
            !arg.starts_with("-Dminecraft.api.env=")
                && !arg.starts_with("-Dminecraft.api.auth.host=")
                && !arg.starts_with("-Dminecraft.api.account.host=")
                && !arg.starts_with("-Dminecraft.api.session.host=")
                && !arg.starts_with("-Dminecraft.api.services.host=")
                && !arg.starts_with("-Dminecraft.api.profiles.host=")
        })
        .collect::<Vec<_>>();
    if let Some(host) = session_host {
        next.extend(session_host_jvm_args(host));
    }
    next
}

fn library_path_when_missing(jvm_args: &[String], natives_base: &Path) -> PathBuf {
    const PREFIX: &str = "-Djava.library.path=${natives_directory}";
    for a in jvm_args {
        let Some(rest) = a.strip_prefix(PREFIX) else { continue };
        let rest = rest.trim_start_matches(['/', '\\']);
        if rest.is_empty() {
            return natives_base.to_path_buf();
        }
        let sub = rest.split(['/', '\\']).next().unwrap_or(rest);
        if !sub.is_empty() && !sub.contains('$') {
            return natives_base.join(sub);
        }
    }
    natives_base.to_path_buf()
}

fn substitute(template: &str, vars: &HashMap<String, String>) -> String {
    let mut out = template.to_string();
    for (k, v) in vars {
        out = out.replace(&format!("${{{k}}}"), v);
    }
    out
}

/// True when Minecraft version supports `-Dminecraft.api.session.host` (1.20.2+).
pub fn supports_session_host(minecraft_version: &str) -> bool {
    let v = minecraft_version.trim();
    if let Some(caps) = parse_release(v) {
        let (maj, min, patch) = caps;
        if maj > 1 {
            return true;
        }
        if maj == 1 {
            if min > 20 {
                return true;
            }
            if min == 20 && patch >= 2 {
                return true;
            }
        }
        return false;
    }
    // Snapshots 23w31a+ roughly 1.20.2 — treat unknown as true for safety on modern
    if v.contains('w') {
        return true;
    }
    false
}

fn parse_release(version: &str) -> Option<(u32, u32, u32)> {
    let mut parts = version.split('.');
    let major: u32 = parts.next()?.parse().ok()?;
    let minor: u32 = parts.next()?.parse().ok()?;
    let patch: u32 = parts
        .next()
        .and_then(|s| {
            let digits: String = s.chars().take_while(|c| c.is_ascii_digit()).collect();
            digits.parse().ok()
        })
        .unwrap_or(0);
    Some((major, minor, patch))
}

pub fn memory_from_profile(profile: &Value) -> (u64, u64) {
    let max = profile
        .pointer("/memory/maxMb")
        .and_then(|v| v.as_u64())
        .or_else(|| profile.get("memoryMaxMb").and_then(|v| v.as_u64()))
        .unwrap_or(2048);
    let min = profile
        .pointer("/memory/minMb")
        .and_then(|v| v.as_u64())
        .unwrap_or_else(|| max.min(512));
    (min, max)
}

pub fn jvm_args_from_profile(profile: &Value) -> Vec<String> {
    profile
        .get("jvmArgs")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default()
}
