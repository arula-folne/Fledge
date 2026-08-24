#!/usr/bin/env node
/**
 * packages/shared/src/version.ts の APP_VERSION を正本として、
 * 各 package.json と README / spec を同期する。
 *
 * 表示: Ver.0.1.4a / Ver.0.1.4b / Ver.0.1.4rc / Ver.0.1.4
 * package.json: 有効な semver のため 0.1.4-a / 0.1.4-b / 0.1.4-rc / 0.1.4
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const versionFile = path.join(root, 'packages/shared/src/version.ts')
const src = fs.readFileSync(versionFile, 'utf8')

const versionMatch = src.match(/export const APP_VERSION = '([^']+)'/)
if (!versionMatch) {
  console.error('APP_VERSION not found in packages/shared/src/version.ts')
  process.exit(1)
}

const version = versionMatch[1]

const semverMatch = version.match(/^(\d+\.\d+\.\d+)(a|b|rc)?$/)
if (!semverMatch) {
  console.error(
    `APP_VERSION '${version}' is not <major>.<minor>.<patch>[a|b|rc]\n` +
      '  alpha: 0.0.0a / beta: 0.0.0b / rc: 0.0.0rc / release: 0.0.0',
  )
  process.exit(1)
}
const semver = semverMatch[2] ? `${semverMatch[1]}-${semverMatch[2]}` : semverMatch[1]
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
const readmeNext = readme.replace(/\*\*Ver\.[\d.]+(?:a|b|rc)?(?: - [^*]+)?\*\*/, `**${label}**`)
if (readmeNext !== readme) {
  fs.writeFileSync(readmePath, readmeNext)
  console.log('updated README.md')
}

const specPath = path.join(root, 'docs/spec.md')
let spec = fs.readFileSync(specPath, 'utf8')
const specNext = spec.replace(
  /バージョン \*\*(?:Ver\.)?[\d.]+(?:a|b|rc)?(?:（[^）]+）)?\*\*/,
  `バージョン **${label}**`,
)
if (specNext !== spec) {
  fs.writeFileSync(specPath, specNext)
  console.log('updated docs/spec.md')
}

console.log('')
console.log(`Synced to ${label} / package.json: ${semver}.`)
console.log('news/news.ja.json と apps/desktop/resources/news.ja.json は手動で更新してください。')
