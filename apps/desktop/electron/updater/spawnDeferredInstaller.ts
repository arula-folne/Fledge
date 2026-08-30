import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * 実行中プロセスが exe / data を掴んだまま NSIS が壊れないよう、
 * 指定 PID の終了後にサイレント更新インストーラーを起動する。
 *
 * 旧実装の `tasklist | find "Fledge.exe"` ループは:
 * - コンソールが前面に出て止まる
 * - Electron の子プロセスやロック残で無限待ちになり得る
 * - 待ちを殺すとインストーラーが走らず / 途中失敗で runtime 欠落
 * のため使わない。
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

  // PowerShell 単一引用符リテラル用（' → ''）
  const q = (s: string) => `'${s.replace(/'/g, "''")}'`

  const content = [
    '$ErrorActionPreference = "SilentlyContinue"',
    `$targetPid = ${Math.floor(pidToWaitFor)}`,
    `$installer = ${q(installerPath)}`,
    `$installDir = ${q(installDirArg)}`,
    '$deadline = (Get-Date).AddMinutes(2)',
    'while ((Get-Date) -lt $deadline) {',
    '  if (-not (Get-Process -Id $targetPid -ErrorAction SilentlyContinue)) { break }',
    '  Start-Sleep -Milliseconds 400',
    '}',
    // ファイルロック解除の猶予
    'Start-Sleep -Milliseconds 1000',
    'if (-not (Test-Path -LiteralPath $installer)) { exit 2 }',
    '$args = @("--updated", "/S", "--force-run", "/D=$installDir")',
    'Start-Process -FilePath $installer -ArgumentList $args -WindowStyle Hidden',
    'Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue',
    '',
  ].join('\r\n')

  await fs.writeFile(scriptPath, content, 'utf8')

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-WindowStyle',
        'Hidden',
        '-File',
        scriptPath,
      ],
      {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        cwd: dir,
      },
    )
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}
