/**
 * 署名前: ルート用の薄い起動 exe を生成する。
 * Electron 本体はインストーラ側で data/meta/runtime へ移す。
 */
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

function findCsc() {
  const candidates = [
    path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
  ]
  return candidates.find((p) => fs.existsSync(p))
}

/** @param {import('electron-builder').AfterPackContext} context */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return

  const csc = findCsc()
  if (!csc) {
    throw new Error('csc.exe が見つかりません。Fledge ルート起動 exe をビルドできません。')
  }

  const src = path.join(__dirname, 'launcher', 'FledgeLauncher.cs')
  const out = path.join(context.appOutDir, '_fledge-launch.exe')
  const icon = path.join(__dirname, 'icon.ico')
  if (!fs.existsSync(icon)) {
    throw new Error(`起動 exe 用アイコンが見つかりません: ${icon}`)
  }
  execFileSync(
    csc,
    ['/nologo', '/target:winexe', '/optimize+', `/win32icon:${icon}`, `/out:${out}`, src],
    { stdio: 'inherit' },
  )
}
