//! Deferred NSIS apply + uninstall helpers (Windows).
//!
//! Update path must use Tauri's `/UPDATE` (not Electron's `--updated`) so Data / AppData
//! are not wiped. Staging must NOT live under `$LOCALAPPDATA\\Fledge` (install dir).

use crate::error::{CoreError, CoreResult};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Install root for packaged Tauri / NSIS layout (exe directory).
pub fn resolve_install_root() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."))
}

/// Staging outside the install tree. `$LOCALAPPDATA\\Fledge` is the NSIS install dir
/// (case-insensitive), so we must not use `...\\fledge\\updater` there.
pub fn updater_staging_dir() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("fledge-updater")
}

/// `%APPDATA%\\fledge` — settings / MSA accounts (dirs::config_dir).
pub fn roaming_fledge_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("fledge")
}

/// Tauri / WebView2 identifier folder under Local + Roaming.
pub fn bundle_id_dirs() -> [PathBuf; 2] {
    let id = "net.folne.fledge";
    [
        dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(id),
        dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(id),
    ]
}

/// Wipe launcher identity data (MSA tokens, settings, WebView2 profile, updater cache).
/// Safe to call after uninstall; does not touch Minecraft worlds outside Fledge roots.
pub fn wipe_fledge_user_data() {
    safe_rm_path(&roaming_fledge_dir());
    safe_rm_path(&updater_staging_dir());
    for dir in bundle_id_dirs() {
        safe_rm_path(&dir);
    }
    // Legacy Electron / accidental casing
    if let Some(roaming) = dirs::config_dir() {
        safe_rm_path(&roaming.join("Fledge"));
    }
}

fn safe_rm_path(path: &Path) {
    if !path.exists() {
        return;
    }
    let result = if path.is_dir() {
        fs::remove_dir_all(path)
    } else {
        fs::remove_file(path)
    };
    if let Err(err) = result {
        tracing::warn!("could not remove {}: {err}", path.display());
    }
}

/// Stage a hidden waiter that runs NSIS after this process exits, then relaunches.
///
/// Tauri NSIS: `/UPDATE /S /D=<installDir>` — `/UPDATE` sets UpdateMode so uninstall hooks
/// do not wipe user data. Do not use Electron's `--updated` here.
pub fn spawn_installer_after_exit(
    installer_path: &Path,
    install_dir: &Path,
    pid_to_wait_for: u32,
) -> CoreResult<()> {
    let dir = updater_staging_dir();
    fs::create_dir_all(&dir)?;

    // Keep installer copy in staging (may already be there)
    let staged_installer = if installer_path.starts_with(&dir) {
        installer_path.to_path_buf()
    } else {
        let name = installer_path
            .file_name()
            .ok_or_else(|| CoreError::msg("updater.applyFailed"))?;
        let dest = dir.join(name);
        if installer_path != dest {
            fs::copy(installer_path, &dest)?;
        }
        dest
    };

    let script_path = dir.join(format!("run-installer-{pid_to_wait_for}.cmd"));
    let log_path = dir.join("update-log.txt");

    let installer = bat_set(&staged_installer);
    let install_dir_arg = bat_set(install_dir);
    let log = bat_set(&log_path);

    let content = format!(
        r#"@echo off
setlocal EnableExtensions EnableDelayedExpansion
set "TARGET_PID={pid}"
set "INSTALLER={installer}"
set "INSTALLDIR={install_dir}"
set "LOG={log}"
echo wait pid=!TARGET_PID!>>"!LOG!"
echo installer=!INSTALLER!>>"!LOG!"
echo installDir=!INSTALLDIR!>>"!LOG!"
:wait
tasklist /FI "PID eq !TARGET_PID!" /NH 2>NUL | find "!TARGET_PID!" >NUL
if not errorlevel 1 (
  ping -n 2 127.0.0.1 >nul
  goto wait
)
echo pid exited, settling>>"!LOG!"
ping -n 2 127.0.0.1 >nul
if not exist "!INSTALLER!" (
  echo ERROR installer missing>>"!LOG!"
  exit /b 2
)
echo launching NSIS>>"!LOG!"
"!INSTALLER!" /UPDATE /S /D=!INSTALLDIR!
set "EC=!ERRORLEVEL!"
echo NSIS exit=!EC!>>"!LOG!"
if not "!EC!"=="0" (
  echo ERROR NSIS failed, not starting app>>"!LOG!"
  exit /b !EC!
)
set "APP="
if exist "!INSTALLDIR!\Fledge.exe" set "APP=!INSTALLDIR!\Fledge.exe"
if not defined APP if exist "!INSTALLDIR!\fledge-desktop.exe" set "APP=!INSTALLDIR!\fledge-desktop.exe"
if not defined APP (
  for %%F in ("!INSTALLDIR!\*.exe") do (
    if /I not "%%~nxF"=="uninstall.exe" if /I not "%%~nxF"=="Uninstall Fledge.exe" (
      set "APP=%%~fF"
      goto found_app
    )
  )
)
:found_app
if defined APP (
  echo starting app>>"!LOG!"
  start "" "!APP!" --updated
) else (
  echo ERROR app missing after install>>"!LOG!"
  exit /b 3
)
echo done>>"!LOG!"
del "%~f0" >nul 2>&1
exit /b !EC!
"#,
        pid = pid_to_wait_for,
        installer = installer,
        install_dir = install_dir_arg,
        log = log,
    );

    fs::write(&script_path, content.replace('\n', "\r\n"))?;

    // No PowerShell / wscript — those flash a console. Detached hidden cmd only.
    Command::new("cmd.exe")
        .args(["/d", "/c", &script_path.to_string_lossy()])
        .creation_flags(CREATE_NO_WINDOW | DETACHED_PROCESS)
        .spawn()
        .map_err(|e| CoreError::msg(format!("updater.applyFailed: {e}")))?;

    let _ = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .and_then(|mut f| {
            use std::io::Write;
            writeln!(
                f,
                "[{}] spawned hidden cmd waiter",
                chrono::Utc::now().to_rfc3339(),
            )
        });

    Ok(())
}

/// After app exit: run NSIS uninstaller if present, else remove install root,
/// then wipe Fledge AppData (MSA / settings / WebView2).
pub fn schedule_complete_uninstall(install_root: &Path) -> CoreResult<()> {
    let pid = std::process::id();
    let uninstaller = find_uninstaller(install_root);
    let script_path = std::env::temp_dir().join(format!("fledge-uninstall-{pid}.cmd"));

    let root = esc_cmd(install_root);
    let roaming = esc_cmd(&roaming_fledge_dir());
    let staging = esc_cmd(&updater_staging_dir());
    let bundle_roaming = esc_cmd(&bundle_id_dirs()[0]);
    let bundle_local = esc_cmd(&bundle_id_dirs()[1]);
    let uninst = uninstaller
        .as_ref()
        .map(|p| esc_cmd(p))
        .unwrap_or_default();

    let uninstall_block = if uninstaller.is_some() {
        format!(
            r#"if exist "{uninst}" (
  start /wait "" "{uninst}" /S
  timeout /t 2 /nobreak >NUL
)
"#
        )
    } else {
        String::new()
    };

    let script = format!(
        r#"@echo off
setlocal
:wait
tasklist /FI "PID eq {pid}" 2>NUL | find "{pid}" >NUL
if not errorlevel 1 (
  timeout /t 1 /nobreak >NUL
  goto wait
)
timeout /t 2 /nobreak >NUL
{uninstall_block}if exist "{root}" (
  rmdir /s /q "{root}"
)
if exist "{roaming}" rmdir /s /q "{roaming}"
if exist "{staging}" rmdir /s /q "{staging}"
if exist "{bundle_roaming}" rmdir /s /q "{bundle_roaming}"
if exist "{bundle_local}" rmdir /s /q "{bundle_local}"
reg delete "HKCU\Software\Fledge" /f >NUL 2>&1
del "%~f0"
"#
    );

    fs::write(&script_path, script.replace('\n', "\r\n"))?;

    Command::new("cmd.exe")
        .args(["/d", "/c", &script_path.to_string_lossy()])
        .creation_flags(CREATE_NO_WINDOW | DETACHED_PROCESS)
        .spawn()
        .map_err(|e| CoreError::msg(format!("settings.uninstallFailed: {e}")))?;

    Ok(())
}

/// Open Windows Settings → Apps (fallback when uninstaller is unknown).
pub fn open_apps_and_features() -> CoreResult<()> {
    let status = Command::new("cmd.exe")
        .args(["/d", "/c", "start", "", "ms-settings:appsfeatures"])
        .creation_flags(CREATE_NO_WINDOW)
        .status();
    match status {
        Ok(s) if s.success() => Ok(()),
        _ => {
            Command::new("control.exe")
                .arg("appwiz.cpl")
                .creation_flags(CREATE_NO_WINDOW)
                .spawn()
                .map_err(|e| CoreError::msg(format!("settings.uninstallFailed: {e}")))?;
            Ok(())
        }
    }
}

pub fn find_uninstaller(install_root: &Path) -> Option<PathBuf> {
    let candidates = [
        install_root.join("uninstall.exe"),
        install_root.join("Uninstall Fledge.exe"),
        install_root.join("Uninstall.exe"),
    ];
    candidates.into_iter().find(|p| p.is_file())
}

fn bat_set(path: &Path) -> String {
    path.to_string_lossy()
        .trim_end_matches(['\\', '/'])
        .replace('"', "")
}

fn esc_cmd(path: &Path) -> String {
    path.to_string_lossy().replace('%', "%%")
}

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
#[cfg(windows)]
const DETACHED_PROCESS: u32 = 0x0000_0008;

#[cfg(windows)]
trait CreationFlagsExt {
    fn creation_flags(&mut self, flags: u32) -> &mut Self;
}

#[cfg(windows)]
impl CreationFlagsExt for Command {
    fn creation_flags(&mut self, flags: u32) -> &mut Self {
        use std::os::windows::process::CommandExt;
        CommandExt::creation_flags(self, flags)
    }
}

#[cfg(not(windows))]
trait CreationFlagsExt {
    fn creation_flags(&mut self, _flags: u32) -> &mut Self;
}

#[cfg(not(windows))]
impl CreationFlagsExt for Command {
    fn creation_flags(&mut self, _flags: u32) -> &mut Self {
        self
    }
}

#[cfg(not(windows))]
const CREATE_NO_WINDOW: u32 = 0;
#[cfg(not(windows))]
const DETACHED_PROCESS: u32 = 0;
