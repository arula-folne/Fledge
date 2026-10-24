//! Deferred NSIS apply + uninstall helpers (Windows).
//!
//! Update path must use Tauri's `/UPDATE` (not Electron's `--updated`) so Data / AppData
//! are not wiped. Staging must NOT live under `$LOCALAPPDATA\\Fledge` (install dir).

use crate::error::{CoreError, CoreResult};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

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
/// Tauri NSIS: `/UPDATE /S /D=<installDir>` (`/D=` must be last, unquoted).
///
/// The waiter is created with WMI `Win32_Process.Create` so it survives Job Object
/// teardown when the app exits (plain `spawn` can die with the parent).
/// Before NSIS / relaunch it kills leftover `fledge-desktop.exe` so file replace and
/// single-instance handoff succeed, and retries launch once if the first start vanishes.
pub fn spawn_installer_after_exit(
    installer_path: &Path,
    install_dir: &Path,
    pid_to_wait_for: u32,
) -> CoreResult<()> {
    let dir = updater_staging_dir();
    fs::create_dir_all(&dir)?;

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

    let vbs_path = dir.join(format!("run-installer-{pid_to_wait_for}.vbs"));
    let log_path = dir.join("update-log.txt");

    let installer = vbs_str(&staged_installer);
    let install_dir_arg = vbs_str(install_dir);
    let log = vbs_str(&log_path);

    let vbs = format!(
        r#"Option Explicit
Dim sh, wmi, col, installer, installDir, logFile, pid, app, fso, ec, folder, file
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
Set wmi = GetObject("winmgmts:\\.\root\cimv2")
pid = {pid}
installer = "{installer}"
installDir = "{install_dir}"
logFile = "{log}"
Sub Log(msg)
  On Error Resume Next
  Dim ts
  Set ts = fso.OpenTextFile(logFile, 8, True)
  ts.WriteLine Now & " " & msg
  ts.Close
End Sub
Sub KillFledgeApps()
  On Error Resume Next
  Dim p
  For Each p In wmi.ExecQuery("SELECT ProcessId,Name FROM Win32_Process WHERE Name='fledge-desktop.exe' OR Name='Fledge.exe'")
    Log "kill leftover " & p.Name & " pid=" & p.ProcessId
    p.Terminate
  Next
  On Error GoTo 0
End Sub
Function CountFledgeApps()
  Dim n, p
  n = 0
  On Error Resume Next
  For Each p In wmi.ExecQuery("SELECT ProcessId FROM Win32_Process WHERE Name='fledge-desktop.exe' OR Name='Fledge.exe'")
    n = n + 1
  Next
  On Error GoTo 0
  CountFledgeApps = n
End Function
Log "wait pid=" & pid
Do
  Set col = wmi.ExecQuery("SELECT ProcessId FROM Win32_Process WHERE ProcessId=" & pid)
  If col.Count = 0 Then Exit Do
  WScript.Sleep 800
Loop
Log "pid exited, settling"
WScript.Sleep 2500
KillFledgeApps
WScript.Sleep 1500
If Not fso.FileExists(installer) Then
  Log "ERROR installer missing"
  WScript.Quit 2
End If
Log "launching NSIS /UPDATE /S /D=" & installDir
ec = sh.Run("""" & installer & """ /UPDATE /S /D=" & installDir, 0, True)
Log "NSIS exit=" & ec
If ec <> 0 Then
  Log "ERROR NSIS failed"
  WScript.Quit ec
End If
' Prefer Tauri main binary; old Electron stub Fledge.exe must not win.
app = ""
If fso.FileExists(installDir & "\fledge-desktop.exe") Then
  app = installDir & "\fledge-desktop.exe"
ElseIf fso.FileExists(installDir & "\Fledge.exe") Then
  app = installDir & "\Fledge.exe"
Else
  Set folder = fso.GetFolder(installDir)
  For Each file In folder.Files
    If LCase(fso.GetExtensionName(file.Name)) = "exe" Then
      If LCase(file.Name) <> "uninstall.exe" And LCase(file.Name) <> "uninstall fledge.exe" Then
        app = file.Path
        Exit For
      End If
    End If
  Next
End If
If app = "" Then
  Log "ERROR app missing after install"
  WScript.Quit 3
End If
If fso.GetFile(app).Size < 1000000 Then
  Log "ERROR app too small after install size=" & fso.GetFile(app).Size
  WScript.Quit 4
End If
KillFledgeApps
WScript.Sleep 1200
Log "starting app " & app
' cmd start で完全に独立起動（wscript 終了後も残る）
sh.Run "cmd.exe /c start """" /B """ & app & """ --updated", 0, True
WScript.Sleep 3500
If CountFledgeApps() = 0 Then
  Log "retry launch (single-instance race?)"
  KillFledgeApps
  WScript.Sleep 1000
  sh.Run "cmd.exe /c start """" /B """ & app & """ --updated", 0, True
  WScript.Sleep 2500
  If CountFledgeApps() = 0 Then
    Log "ERROR app did not stay running after launch"
    WScript.Quit 5
  End If
End If
Log "done running=" & CountFledgeApps()
On Error Resume Next
fso.DeleteFile WScript.ScriptFullName, True
WScript.Quit 0
"#,
        pid = pid_to_wait_for,
        installer = installer,
        install_dir = install_dir_arg,
        log = log,
    );

    fs::write(&vbs_path, vbs.replace('\n', "\r\n"))?;

    let waiter_pid = spawn_wscript_outside_job(&vbs_path)?;
    if waiter_pid == 0 {
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
                "[{}] spawned wscript waiter target_pid={pid_to_wait_for} waiter_pid={waiter_pid}",
                chrono::Utc::now().to_rfc3339(),
            )
        });

    Ok(())
}

/// Job Object 外で待機スクリプトを起動する。
///
/// 以前のインライン PowerShell + `DETACHED_PROCESS` は stdout が空のまま
/// `waiter_pid=0` で成功扱いになり、VBS が動かず再起動されないことがあった。
fn spawn_wscript_outside_job(vbs_path: &Path) -> CoreResult<u32> {
    match spawn_wscript_direct(vbs_path) {
        Ok(pid) if pid_alive_soon(pid) => return Ok(pid),
        Ok(pid) => tracing::warn!(pid, "direct wscript not alive; trying WMI"),
        Err(err) => tracing::warn!(error = %err, "direct wscript failed; trying WMI"),
    }

    match spawn_wscript_via_wmi_ps1(vbs_path) {
        Ok(pid) if pid_alive_soon(pid) => Ok(pid),
        Ok(pid) => {
            tracing::error!(pid, "WMI wscript pid invalid or dead");
            Err(CoreError::msg("updater.applyFailed"))
        }
        Err(err) => {
            tracing::error!(error = %err, "WMI wscript spawn failed");
            Err(err)
        }
    }
}

fn spawn_wscript_direct(vbs_path: &Path) -> CoreResult<u32> {
    let child = Command::new("wscript.exe")
        .args(["//B", "//Nologo", &vbs_path.to_string_lossy()])
        // DETACHED_PROCESS は付けない（出力喪失・起動失敗の原因になる）
        .creation_flags(CREATE_NO_WINDOW | CREATE_BREAKAWAY_FROM_JOB | CREATE_NEW_PROCESS_GROUP)
        .spawn()
        .map_err(|e| CoreError::msg(format!("updater.applyFailed: {e}")))?;
    Ok(child.id())
}

/// 引用符問題を避けるため .ps1 を書いてから実行する。
fn spawn_wscript_via_wmi_ps1(vbs_path: &Path) -> CoreResult<u32> {
    let dir = vbs_path.parent().unwrap_or_else(|| Path::new("."));
    let ps1_path = dir.join(format!("spawn-waiter-{}.ps1", std::process::id()));
    let vbs_arg = vbs_path.to_string_lossy().replace('\'', "''");
    let script = format!(
        "$cmd = 'wscript.exe //B //Nologo \"{vbs_arg}\"'\r\n\
         $r = ([wmiclass]'Win32_Process').Create($cmd)\r\n\
         if ($null -eq $r) {{ throw 'WMI Create returned null' }}\r\n\
         if ($r.ReturnValue -ne 0) {{ throw \"WMI Create failed: $($r.ReturnValue)\" }}\r\n\
         if (-not $r.ProcessId) {{ throw 'WMI Create returned empty ProcessId' }}\r\n\
         Write-Output $r.ProcessId\r\n"
    );
    fs::write(&ps1_path, script)?;

    let output = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            &ps1_path.to_string_lossy(),
        ])
        .creation_flags(CREATE_NO_WINDOW | CREATE_BREAKAWAY_FROM_JOB | CREATE_NEW_PROCESS_GROUP)
        .output();

    let _ = fs::remove_file(&ps1_path);

    match output {
        Ok(out) if out.status.success() => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let pid = stdout
                .lines()
                .rev()
                .find_map(|line| line.trim().parse::<u32>().ok())
                .unwrap_or(0);
            if pid == 0 {
                let stderr = String::from_utf8_lossy(&out.stderr);
                tracing::warn!(stdout = %stdout, stderr = %stderr, "WMI waiter returned pid 0");
                return Err(CoreError::msg("updater.applyFailed"));
            }
            Ok(pid)
        }
        Ok(out) => {
            let err = String::from_utf8_lossy(&out.stderr);
            Err(CoreError::msg(format!("updater.applyFailed: {err}")))
        }
        Err(err) => Err(CoreError::msg(format!("updater.applyFailed: {err}"))),
    }
}

fn pid_alive_soon(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }
    std::thread::sleep(Duration::from_millis(250));
    pid_alive(pid)
}

fn pid_alive(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }
    let output = Command::new("tasklist.exe")
        .args(["/FI", &format!("PID eq {pid}"), "/NH"])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            stdout.contains(&pid.to_string())
        }
        Err(_) => false,
    }
}

/// After app exit: run NSIS uninstaller if present, else remove install root,
/// then wipe Fledge AppData (MSA / settings / WebView2).
pub fn schedule_complete_uninstall(install_root: &Path) -> CoreResult<()> {
    let pid = std::process::id();
    let uninstaller = find_uninstaller(install_root);
    let vbs_path = std::env::temp_dir().join(format!("fledge-uninstall-{pid}.vbs"));

    let root = vbs_str(install_root);
    let roaming = vbs_str(&roaming_fledge_dir());
    let staging = vbs_str(&updater_staging_dir());
    let bundle_roaming = vbs_str(&bundle_id_dirs()[0]);
    let bundle_local = vbs_str(&bundle_id_dirs()[1]);
    let uninst = uninstaller
        .as_ref()
        .map(|p| vbs_str(p))
        .unwrap_or_default();

    let uninstall_run = if uninstaller.is_some() {
        format!(
            r#"If fso.FileExists("{uninst}") Then
  sh.Run """{uninst}"" /S", 0, True
  WScript.Sleep 1500
End If
"#
        )
    } else {
        String::new()
    };

    let vbs = format!(
        r#"Option Explicit
Dim sh, wmi, col, fso, pid
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
Set wmi = GetObject("winmgmts:\\.\root\cimv2")
pid = {pid}
Do
  Set col = wmi.ExecQuery("SELECT ProcessId FROM Win32_Process WHERE ProcessId=" & pid)
  If col.Count = 0 Then Exit Do
  WScript.Sleep 800
Loop
WScript.Sleep 1500
{uninstall_run}If fso.FolderExists("{root}") Then fso.DeleteFolder "{root}", True
If fso.FolderExists("{roaming}") Then fso.DeleteFolder "{roaming}", True
If fso.FolderExists("{staging}") Then fso.DeleteFolder "{staging}", True
If fso.FolderExists("{bundle_roaming}") Then fso.DeleteFolder "{bundle_roaming}", True
If fso.FolderExists("{bundle_local}") Then fso.DeleteFolder "{bundle_local}", True
On Error Resume Next
sh.Run "reg delete ""HKCU\Software\Fledge"" /f", 0, True
fso.DeleteFile WScript.ScriptFullName, True
"#,
        pid = pid,
        uninstall_run = uninstall_run,
        root = root,
        roaming = roaming,
        staging = staging,
        bundle_roaming = bundle_roaming,
        bundle_local = bundle_local,
    );

    fs::write(&vbs_path, vbs.replace('\n', "\r\n"))?;

    Command::new("wscript.exe")
        .args(["//B", "//Nologo", &vbs_path.to_string_lossy()])
        .creation_flags(CREATE_NO_WINDOW)
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

/// Escape a path for embedding inside a VBScript `"..."` string.
fn vbs_str(path: &Path) -> String {
    path.to_string_lossy()
        .trim_end_matches(['\\', '/'])
        .replace('"', "\"\"")
}

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
#[cfg(windows)]
const CREATE_BREAKAWAY_FROM_JOB: u32 = 0x0100_0000;
#[cfg(windows)]
const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;

#[cfg(not(windows))]
const CREATE_BREAKAWAY_FROM_JOB: u32 = 0;
#[cfg(not(windows))]
const CREATE_NEW_PROCESS_GROUP: u32 = 0;

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
