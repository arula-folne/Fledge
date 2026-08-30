import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * 指定 PID 終了後に NSIS サイレント更新を起動する。
 *
 * Electron は Windows Job Object で子プロセスを終了時に殺すため、
 * `cmd start` でジョブ外に出してから PowerShell を走らせる。
 */
export async function spawnInstallerAfterAppExit(
  installerPath: string,
  installDir: string,
  pidToWaitFor: number = process.pid,
): Promise<void> {
  const dir = path.dirname(installerPath)
  await fs.mkdir(dir, { recursive: true })

  const scriptPath = path.join(dir, 'run-installer.ps1')
  const installDirArg = installDir.replace(/[\\/]+$/, '')
  const errorLog = path.join(dir, 'update-error.txt')

  const q = (s: string) => `'${s.replace(/'/g, "''")}'`

  const content = [
    '$ErrorActionPreference = "Stop"',
    `$targetPid = ${Math.floor(pidToWaitFor)}`,
    `$installer = ${q(installerPath)}`,
    `$installDir = ${q(installDirArg)}`,
    `$errorLog = ${q(errorLog)}`,
    'try {',
    '  $deadline = (Get-Date).AddMinutes(3)',
    '  while ((Get-Date) -lt $deadline) {',
    '    $alive = Get-Process -Id $targetPid -ErrorAction SilentlyContinue',
    '    if (-not $alive) { break }',
    '    Start-Sleep -Milliseconds 500',
    '  }',
    '  Start-Sleep -Seconds 1',
    '  if (-not (Test-Path -LiteralPath $installer)) {',
    '    throw "Installer missing: $installer"',
    '  }',
    '  $argList = @("--updated", "/S", "--force-run", "/D=$installDir")',
    '  Start-Process -FilePath $installer -ArgumentList $argList | Out-Null',
    '} catch {',
    '  $_ | Out-File -FilePath $errorLog -Encoding utf8',
    '  exit 1',
    '}',
    'Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue',
    '',
  ].join('\r\n')

  await fs.writeFile(scriptPath, content, 'utf8')
  try {
    await fs.unlink(errorLog)
  } catch {
    /* missing ok */
  }

  const comspec = process.env.ComSpec || 'cmd.exe'
  // start で新しいプロセスツリーに載せ、app.quit() 後も生き残らせる
  const startCmd = [
    'start "FledgeUpdate" /MIN',
    'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden',
    `-File "${scriptPath}"`,
  ].join(' ')

  await new Promise<void>((resolve, reject) => {
    const child = spawn(comspec, ['/d', '/s', '/c', startCmd], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      cwd: dir,
    })
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })

  // start がジョブ外プロセスを立ち上げるまで少し待つ
  await new Promise((r) => setTimeout(r, 400))
}
