import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * Electron の Job Object 外で「終了待ち → NSIS → 再起動」を走らせる。
 *
 * 重要:
 * - WMI 起動の cmd にはコンソールが無く、`timeout` はプロセスごと終了する
 *   （ログが settling で止まる原因）。待ちは `ping` のみ使う。
 * - 日付の「(日)」が batch の `()` ブロックを壊すので、ログに %date% を出さない。
 * - サイレント更新では Finish ページが飛ばされ `--force-run` が効かないことがあるため、
 *   NSIS 後にルートの Fledge.exe をこちらから起動する。
 */
export async function spawnInstallerAfterAppExit(
  installerPath: string,
  installDir: string,
  pidToWaitFor: number = process.pid,
): Promise<void> {
  const dir = path.dirname(installerPath)
  await fs.mkdir(dir, { recursive: true })

  const scriptPath = path.join(dir, 'run-installer.cmd')
  const vbsPath = path.join(dir, 'run-installer.vbs')
  const logPath = path.join(dir, 'update-log.txt')
  const installDirArg = installDir.replace(/[\\/]+$/, '')
  const batSet = (s: string) => s.replace(/"/g, '')

  const content = [
    '@echo off',
    'setlocal EnableExtensions EnableDelayedExpansion',
    `set "TARGET_PID=${Math.floor(pidToWaitFor)}"`,
    `set "INSTALLER=${batSet(installerPath)}"`,
    `set "INSTALLDIR=${batSet(installDirArg)}"`,
    `set "LOG=${batSet(logPath)}"`,
    `set "APP=!INSTALLDIR!\\Fledge.exe"`,
    'echo wait pid=!TARGET_PID!>>"!LOG!"',
    'echo installer=!INSTALLER!>>"!LOG!"',
    'echo installDir=!INSTALLDIR!>>"!LOG!"',
    ':wait',
    'tasklist /FI "PID eq !TARGET_PID!" /NH 2>NUL | find "!TARGET_PID!" >NUL',
    'if not errorlevel 1 (',
    '  ping -n 2 127.0.0.1 >nul',
    '  goto wait',
    ')',
    'echo pid exited, settling>>"!LOG!"',
    // timeout はコンソール無しだと cmd 自体を終了させる。ping で待つ。
    'ping -n 3 127.0.0.1 >nul',
    'if not exist "!INSTALLER!" (',
    '  echo ERROR installer missing>>"!LOG!"',
    '  exit /b 2',
    ')',
    'echo launching NSIS>>"!LOG!"',
    // /D= は最後・非クォート。--force-run は Finish スキップで効かないことがあるので付けない
    '"!INSTALLER!" --updated /S /D=!INSTALLDIR!',
    'set "EC=!ERRORLEVEL!"',
    'echo NSIS exit=!EC!>>"!LOG!"',
    'if not "!EC!"=="0" (',
    '  echo ERROR NSIS failed, not starting app>>"!LOG!"',
    '  exit /b !EC!',
    ')',
    'if not exist "!APP!" (',
    '  echo ERROR app missing after install: !APP!>>"!LOG!"',
    '  exit /b 3',
    ')',
    'echo starting app>>"!LOG!"',
    'start "" "!APP!" --updated',
    'echo done>>"!LOG!"',
    'del "%~dp0run-installer.vbs" >nul 2>&1',
    'del "%~f0" >nul 2>&1',
    'exit /b !EC!',
    '',
  ].join('\r\n')

  await fs.writeFile(scriptPath, content, 'utf8')

  // ウィンドウ 0 = 非表示。WMI 直 cmd だと黒窓が一瞬出る
  const vbs = [
    'Set sh = CreateObject("WScript.Shell")',
    `sh.Run "cmd.exe /d /c ""${scriptPath.replace(/"/g, '""')}""", 0, False`,
    '',
  ].join('\r\n')
  await fs.writeFile(vbsPath, vbs, 'utf8')

  try {
    await fs.unlink(path.join(dir, 'run-installer.ps1'))
  } catch {
    /* ok */
  }

  const cmdLine = `wscript.exe //B "${vbsPath.replace(/'/g, "''")}"`
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
      `[${new Date().toISOString()}] spawned hidden waiter wscript=${String(out).trim()}\n`,
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
