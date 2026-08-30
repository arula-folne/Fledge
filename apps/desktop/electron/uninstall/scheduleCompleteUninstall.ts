import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { app } from 'electron'

/**
 * プロセス終了後にインストールフォルダごと削除する。
 * NSIS アンインストーラーがあれば先に実行し、残った Data/Instances も含めて消す。
 */
export async function scheduleCompleteUninstall(installRoot: string): Promise<void> {
  const pid = process.pid
  const uninstaller = path.join(installRoot, 'Uninstall Fledge.exe')
  const scriptPath = path.join(os.tmpdir(), `fledge-uninstall-${pid}.cmd`)

  // cmd 向けに % をエスケープし、引用符で囲む
  const esc = (p: string) => p.replace(/%/g, '%%')
  const root = esc(installRoot)
  const uninst = esc(uninstaller)

  const script = [
    '@echo off',
    'setlocal',
    ':wait',
    `tasklist /FI "PID eq ${pid}" 2>NUL | find "${pid}" >NUL`,
    'if not errorlevel 1 (',
    '  timeout /t 1 /nobreak >NUL',
    '  goto wait',
    ')',
    'timeout /t 2 /nobreak >NUL',
    `if exist "${uninst}" (`,
    `  start /wait "" "${uninst}" /S`,
    '  timeout /t 2 /nobreak >NUL',
    ')',
    `if exist "${root}" (`,
    `  rmdir /s /q "${root}"`,
    ')',
    'del "%~f0"',
    '',
  ].join('\r\n')

  await fs.writeFile(scriptPath, script, 'utf8')

  await new Promise<void>((resolve, reject) => {
    const child = spawn('cmd.exe', ['/c', scriptPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}

export function resolvePackagedInstallRoot(): string {
  const exeDir = path.dirname(app.getPath('exe'))
  if (path.basename(exeDir).toLowerCase() === 'app') {
    return path.dirname(exeDir)
  }
  return exeDir
}
