#!/usr/bin/env node
/**
 * packages/shared/src/version.ts の APP_VERSION を正本として、
 * 各 package.json と README / spec を同期する。
 *
 * 表示: Ver.0.3.0ut / Ver.0.1.4b / Ver.0.1.4
 * package.json: 有効な semver のため 0.3.0-ut / 0.1.4-b / 0.1.4
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const KNOWN_SUFFIXES = ['ut', 'up', 'rc', 'a', 'b', 'f']

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
