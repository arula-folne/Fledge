import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

const PROCESS_NAME = 'Fledge.exe'

/**
 * 実行中プロセスが exe / Data を掴んだまま NSIS が INSTDIR を消さないよう、
 * 自プロセス終了後にサイレント更新インストーラーを起動する。
 */
export async function spawnInstallerAfterAppExit(
  installerPath: string,
  installDir: string,
): Promise<void> {
  const scriptPath = path.join(path.dirname(installerPath), 'run-installer.cmd')
  const quotedInstaller = `"${installerPath.replace(/"/g, '""')}"`
  // /D= は末尾バックスラッシュがあると NSIS が壊れることがある
  const installDirArg = installDir.replace(/[\\/]+$/, '')
  const content = [
    '@echo off',
    'setlocal EnableExtensions',
    ':wait',
    `tasklist /FI "IMAGENAME eq ${PROCESS_NAME}" 2>NUL | find /I "${PROCESS_NAME}" >NUL`,
    'if %ERRORLEVEL%==0 (',
    '  timeout /t 1 /nobreak >nul',
    '  goto wait',
    ')',
    `${quotedInstaller} --updated /S --force-run /D=${installDirArg}`,
    '(del "%~f0") >nul 2>&1',
    '',
  ].join('\r\n')

  await fs.writeFile(scriptPath, content, 'utf8')

  await new Promise<void>((resolve, reject) => {
    const child = spawn('cmd.exe', ['/c', scriptPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      cwd: path.dirname(installerPath),
    })
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}
