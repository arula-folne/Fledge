#!/usr/bin/env node
/**
 * packages/shared/src/version.ts の APP_VERSION を正本として、
 * 各 package.json / Cargo.toml / tauri.conf / README / spec / Rust APP_VERSION を同期する。
 *
 * 表示: Ver.0.5.1
 * package.json / Cargo: 有効な semver のため 0.5.1（接尾辞があれば 0.3.0-ut など）
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const KNOWN_SUFFIXES = ['ut', 'up', 'rc', 'a', 'b', 'c', 'f']

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const versionFile = path.join(root, 'packages/shared/src/version.ts')
const src = fs.readFileSync(versionFile, 'utf8')

const versionMatch = src.match(/export const APP_VERSION = '([^']+)'/)
if (!versionMatch) {
  console.error('APP_VERSION not found in packages/shared/src/version.ts')
  process.exit(1)
}

const version = versionMatch[1]

function parseAppVersion(raw) {
  const baseMatch = raw.match(/^(\d+\.\d+\.\d+)([a-z]+)?$/)
  if (!baseMatch) return null
  const [, base, suffix = ''] = baseMatch
  if (suffix && !KNOWN_SUFFIXES.includes(suffix)) return null
  return { base, suffix }
}

const parsed = parseAppVersion(version)
if (!parsed) {
  console.error(
    `APP_VERSION '${version}' is not <major>.<minor>.<patch>[suffix]\n` +
      `  known suffixes: ${KNOWN_SUFFIXES.join(', ')}`,
  )
  process.exit(1)
}

const semver = parsed.suffix ? `${parsed.base}-${parsed.suffix}` : parsed.base
const label = `Ver.${version}`

const packageJsonPaths = [
  'package.json',
  'apps/desktop/package.json',
  'packages/core/package.json',
  'packages/i18n/package.json',
  'packages/shared/package.json',
]

for (const rel of packageJsonPaths) {
  const file = path.join(root, rel)
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (pkg.version === semver) {
    console.log(`skip ${rel} (already ${semver})`)
    continue
  }
  pkg.version = semver
  fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`)
  console.log(`updated ${rel} -> ${semver}`)
}

function replaceCargoVersion(rel) {
  const file = path.join(root, rel)
  const text = fs.readFileSync(file, 'utf8')
  const next = text.replace(/^version\s*=\s*"[^"]+"/m, `version = "${semver}"`)
  if (next === text) {
    console.log(`skip ${rel} (already ${semver} or no version key)`)
    return
  }
  fs.writeFileSync(file, next)
  console.log(`updated ${rel} -> ${semver}`)
}

replaceCargoVersion('crates/fledge-core/Cargo.toml')
replaceCargoVersion('apps/desktop/src-tauri/Cargo.toml')

const tauriConfPath = path.join(root, 'apps/desktop/src-tauri/tauri.conf.json')
const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'))
if (tauriConf.version === semver) {
  console.log(`skip apps/desktop/src-tauri/tauri.conf.json (already ${semver})`)
} else {
  tauriConf.version = semver
  fs.writeFileSync(tauriConfPath, `${JSON.stringify(tauriConf, null, 2)}\n`)
  console.log(`updated apps/desktop/src-tauri/tauri.conf.json -> ${semver}`)
}

const rustVersionPath = path.join(root, 'crates/fledge-core/src/updater/version.rs')
const rustVersionSrc = fs.readFileSync(rustVersionPath, 'utf8')
const rustNext = rustVersionSrc.replace(
  /pub const APP_VERSION: &str = "[^"]+";/,
  `pub const APP_VERSION: &str = "${version}";`,
)
if (rustNext === rustVersionSrc) {
  console.log(`skip crates/fledge-core/src/updater/version.rs (already ${version})`)
} else {
  fs.writeFileSync(rustVersionPath, rustNext)
  console.log(`updated crates/fledge-core/src/updater/version.rs -> ${version}`)
}

const readmePath = path.join(root, 'README.md')
let readme = fs.readFileSync(readmePath, 'utf8')
const readmeNext = readme.replace(/\*\*Ver\.[\d.]+(?:[a-z]+)?(?: - [^*]+)?\*\*/, `**${label}**`)
if (readmeNext !== readme) {
  fs.writeFileSync(readmePath, readmeNext)
  console.log('updated README.md')
}

const specPath = path.join(root, 'docs/spec.md')
let spec = fs.readFileSync(specPath, 'utf8')
const specNext = spec.replace(
  /バージョン \*\*(?:Ver\.)?[\d.]+(?:[a-z]+)?(?:（[^）]+）)?\*\*/,
  `バージョン **${label}**`,
)
if (specNext !== spec) {
  fs.writeFileSync(specPath, specNext)
  console.log('updated docs/spec.md')
}

console.log('')
console.log(`Synced to ${label} / package.json: ${semver}.`)
console.log('news/news.ja.json と apps/desktop/resources/news.ja.json は手動で更新してください。')
