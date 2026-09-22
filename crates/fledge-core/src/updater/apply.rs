//! Deferred NSIS apply + uninstall helpers (Windows). Preserve Data/Instances.

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

/// Stage a hidden waiter that runs NSIS after this process exits, then relaunches.
///
/// NSIS args match 0.4: `/S --updated /D=<installDir>` so Data/Instances are not wiped
/// by uninstall hooks (update path ≠ uninstall path).
pub fn spawn_installer_after_exit(
    installer_path: &Path,
    install_dir: &Path,
    pid_to_wait_for: u32,
) -> CoreResult<()> {
    let dir = installer_path
        .parent()
        .ok_or_else(|| CoreError::msg("updater.applyFailed"))?;
    fs::create_dir_all(dir)?;

    let script_path = dir.join("run-installer.cmd");
    let vbs_path = dir.join("run-installer.vbs");
    let log_path = dir.join("update-log.txt");

    let installer = bat_set(installer_path);
    let install_dir_arg = bat_set(install_dir);
    let log = bat_set(&log_path);

    let content = format!(
        r#"@echo off
setlocal EnableExtensions EnableDelayedExpansion
set "TARGET_PID={pid}"
set "INSTALLER={installer}"
set "INSTALLDIR={install_dir}"
set "LOG={log}"
set "APP=!INSTALLDIR!\Fledge.exe"
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
"!INSTALLER!" --updated /S /D=!INSTALLDIR!
set "EC=!ERRORLEVEL!"
echo NSIS exit=!EC!>>"!LOG!"
if not "!EC!"=="0" (
  echo ERROR NSIS failed, not starting app>>"!LOG!"
  exit /b !EC!
)
if exist "!APP!" (
  echo starting app>>"!LOG!"
  start "" "!APP!" --updated
) else (
  for %%F in ("!INSTALLDIR!\*.exe") do (
    if /I not "%%~nxF"=="uninstall.exe" if /I not "%%~nxF"=="Uninstall Fledge.exe" (
      echo starting %%~nxF>>"!LOG!"
      start "" "%%~fF" --updated
      goto started
    )
  )
  echo ERROR app missing after install>>"!LOG!"
  exit /b 3
)
:started
echo done>>"!LOG!"
del "%~dp0run-installer.vbs" >nul 2>&1
del "%~f0" >nul 2>&1
exit /b !EC!
"#,
        pid = pid_to_wait_for,
        installer = installer,
        install_dir = install_dir_arg,
        log = log,
    );

    fs::write(&script_path, content.replace('\n', "\r\n"))?;

    let script_for_vbs = script_path.to_string_lossy().replace('"', "\"\"");
    let vbs = format!(
        "Set sh = CreateObject(\"WScript.Shell\")\r\nsh.Run \"cmd.exe /d /c \"\"{script_for_vbs}\"\"\", 0, False\r\n"
    );
    fs::write(&vbs_path, vbs)?;

    let vbs_arg = vbs_path.to_string_lossy().replace('\'', "''");
    let ps = format!(
        "$r = ([wmiclass]'Win32_Process').Create('wscript.exe //B \"{vbs_arg}\"'); if ($null -eq $r) {{ throw 'WMI Create returned null' }}; if ($r.ReturnValue -ne 0) {{ throw \"WMI Create failed: $($r.ReturnValue)\" }}; Write-Output $r.ProcessId"
    );

    let output = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-WindowStyle",
            "Hidden",
            "-Command",
            &ps,
        ])
        .output()
        .map_err(|e| CoreError::msg(format!("updater.applyFailed: {e}")))?;

    if !output.status.success() {
        let _ = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
            .and_then(|mut f| {
                use std::io::Write;
                writeln!(
                    f,
                    "[{}] ERROR spawn waiter: {}",
                    chrono::Utc::now().to_rfc3339(),
                    String::from_utf8_lossy(&output.stderr)
                )
            });
        return Err(CoreError::msg("updater.applyFailed"));
    }

    let _ = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .and_then(|mut f| {
            use std::io::Write;
            writeln!(
                f,
                "[{}] spawned hidden waiter wscript={}",
                chrono::Utc::now().to_rfc3339(),
                String::from_utf8_lossy(&output.stdout).trim()
            )
        });

    Ok(())
}

/// After app exit: run NSIS uninstaller if present, else remove install root.
/// Falls back to opening Windows Apps & Features when no uninstaller is found
/// and `open_apps_features_fallback` is true (caller decides).
pub fn schedule_complete_uninstall(install_root: &Path) -> CoreResult<()> {
    let pid = std::process::id();
    let uninstaller = find_uninstaller(install_root);
    let script_path = std::env::temp_dir().join(format!("fledge-uninstall-{pid}.cmd"));

    let root = esc_cmd(install_root);
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
del "%~f0"
"#
    );

    fs::write(&script_path, script.replace('\n', "\r\n"))?;

    Command::new("cmd.exe")
        .args(["/c", &script_path.to_string_lossy()])
        .creation_flags(CREATE_NO_WINDOW | DETACHED_PROCESS)
        .spawn()
        .map_err(|e| CoreError::msg(format!("settings.uninstallFailed: {e}")))?;

    Ok(())
}

/// Open Windows Settings → Apps (fallback when uninstaller is unknown).
pub fn open_apps_and_features() -> CoreResult<()> {
    // Prefer modern Settings URI; fall back to classic Control Panel.
    let status = Command::new("cmd.exe")
        .args(["/c", "start", "", "ms-settings:appsfeatures"])
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
