#!/usr/bin/env node
/**
 * packages/shared/src/version.ts の APP_VERSION / APP_CHANNEL を正本として、
 * 各 package.json と README / spec を同期する。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const versionFile = path.join(root, 'packages/shared/src/version.ts')
const src = fs.readFileSync(versionFile, 'utf8')

const versionMatch = src.match(/export const APP_VERSION = '([^']+)'/)
const channelMatch = src.match(/export const APP_CHANNEL = '([^']+)'/)
if (!versionMatch) {
  console.error('APP_VERSION not found in packages/shared/src/version.ts')
  process.exit(1)
}

const version = versionMatch[1]
const channel = channelMatch?.[1] ?? 'Beta'

// package.json は有効な semver が必須。表示用の英字サフィックス（0.1.4a）は
// プレリリース表記（0.1.4-a）へ変換する
const semverMatch = version.match(/^(\d+\.\d+\.\d+)([a-z]+)?$/)
if (!semverMatch) {
  console.error(`APP_VERSION '${version}' is not <major>.<minor>.<patch>[letters]`)
  process.exit(1)
}
const semver = semverMatch[2] ? `${semverMatch[1]}-${semverMatch[2]}` : semverMatch[1]

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
const readmeNext = readme.replace(
  /\*\*Ver\.[\d.]+[a-z]* - [^*]+\*\*/,
  `**Ver.${version} - ${channel}**`,
)
if (readmeNext !== readme) {
  fs.writeFileSync(readmePath, readmeNext)
  console.log('updated README.md')
}

const specPath = path.join(root, 'docs/spec.md')
let spec = fs.readFileSync(specPath, 'utf8')
const specNext = spec.replace(
  /バージョン \*\*[\d.]+[a-z]*（[^）]+）\*\*/,
  `バージョン **${version}（${channel}）**`,
)
if (specNext !== spec) {
  fs.writeFileSync(specPath, specNext)
  console.log('updated docs/spec.md')
}

console.log('')
console.log(`Synced to ${version} (${channel}) / package.json: ${semver}.`)
console.log('news/news.ja.json と apps/desktop/resources/news.ja.json は手動で更新してください。')
