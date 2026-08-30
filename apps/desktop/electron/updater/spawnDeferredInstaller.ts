import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * Electron は Job Object（KILL_ON_JOB_CLOSE）で子プロセスをまとめて落とす。
 * `detached` / `cmd start` だけでは足りないことがあるため、
 * WMI Win32_Process.Create でジョブ外に待機スクリプトを作ってから終了する。
 *
 * NSIS の /D= は最後の引数で、パスにスペースがあっても引用符を付けない。
 */
export async function spawnInstallerAfterAppExit(
  installerPath: string,
  installDir: string,
  pidToWaitFor: number = process.pid,
): Promise<void> {
  const dir = path.dirname(installerPath)
  await fs.mkdir(dir, { recursive: true })

  const scriptPath = path.join(dir, 'run-installer.cmd')
  const logPath = path.join(dir, 'update-log.txt')
  const installDirArg = installDir.replace(/[\\/]+$/, '')

  // batch の set "VAR=..." 用（" を除去）
  const batSet = (s: string) => s.replace(/"/g, '')

  const content = [
    '@echo off',
    'setlocal EnableExtensions EnableDelayedExpansion',
    `set "TARGET_PID=${Math.floor(pidToWaitFor)}"`,
    `set "INSTALLER=${batSet(installerPath)}"`,
    `set "INSTALLDIR=${batSet(installDirArg)}"`,
    `set "LOG=${batSet(logPath)}"`,
    'echo [%date% %time%] wait pid=!TARGET_PID!>>"!LOG!"',
    'echo [%date% %time%] installer=!INSTALLER!>>"!LOG!"',
    'echo [%date% %time%] installDir=!INSTALLDIR!>>"!LOG!"',
    ':wait',
    'tasklist /FI "PID eq !TARGET_PID!" /NH 2>NUL | find "!TARGET_PID!" >NUL',
    'if not errorlevel 1 (',
    '  timeout /t 1 /nobreak >nul',
    '  goto wait',
    ')',
    'echo [%date% %time%] pid exited, settling...>>"!LOG!"',
    'timeout /t 2 /nobreak >nul',
    'if not exist "!INSTALLER!" (',
    '  echo [%date% %time%] ERROR installer missing>>"!LOG!"',
    '  exit /b 2',
    ')',
    'echo [%date% %time%] launching NSIS>>"!LOG!"',
    // /D= は最後・引用符なし（スペース含みパス対応）
    '"!INSTALLER!" --updated /S --force-run /D=!INSTALLDIR!',
    'set "EC=!ERRORLEVEL!"',
    'echo [%date% %time%] NSIS exit=!EC!>>"!LOG!"',
    '(del "%~f0") >nul 2>&1',
    'exit /b !EC!',
    '',
  ].join('\r\n')

  await fs.writeFile(scriptPath, content, 'utf8')

  // 旧 PowerShell 待機は残っていても無視
  try {
    await fs.unlink(path.join(dir, 'run-installer.ps1'))
  } catch {
    /* ok */
  }

  // WMI でジョブ外プロセスを生成（同期。成功してからアプリ終了する）
  const cmdLine = `cmd.exe /d /c ""${scriptPath.replace(/'/g, "''")}""`
  const ps = [
    `$r = ([wmiclass]'Win32_Process').Create('${cmdLine}')`,
    'if ($null -eq $r) { throw "WMI Create returned null" }',
    'if ($r.ReturnValue -ne 0) { throw "WMI Create failed: $($r.ReturnValue)" }',
    'Write-Output $r.ProcessId',
  ].join('; ')

  try {
    const out = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-Command', ps],
      {
        windowsHide: true,
        timeout: 20_000,
        encoding: 'utf8',
      },
    )
    await fs.appendFile(
      logPath,
      `[${new Date().toISOString()}] spawned waiter pid=${String(out).trim()} script=${scriptPath}\n`,
      'utf8',
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await fs.appendFile(
      logPath,
      `[${new Date().toISOString()}] ERROR spawn waiter: ${message}\n`,
      'utf8',
    )
    throw new Error('updater.applyFailed')
  }
}
