import fs from 'node:fs/promises'
import path from 'node:path'
import { Version } from '@xmcl/core'
import type { InstanceProfile } from '@fledge/shared'

export type ReadyRecord = {
  versionId: string
  minecraftVersion: string
  loader: InstanceProfile['loader']
  loaderVersion?: string
  readyAt: string
}

type ParsedVersion = {
  jar?: string
  minecraftVersion?: string
  libraries?: Array<{ download?: { path?: string }; path?: string }>
}

function readyDir(minecraftRoot: string): string {
  return path.join(minecraftRoot, '.fledge-ready')
}

export function readyKey(profile: Pick<InstanceProfile, 'minecraftVersion' | 'loader' | 'loaderVersion'>): string {
  const loaderVersion = profile.loader === 'vanilla' ? '' : (profile.loaderVersion ?? 'default')
  return `${profile.minecraftVersion}__${profile.loader}__${loaderVersion}`
}

function readyPath(
  minecraftRoot: string,
  profile: Pick<InstanceProfile, 'minecraftVersion' | 'loader' | 'loaderVersion'>,
): string {
  const safe = readyKey(profile).replace(/[^a-zA-Z0-9._-]+/g, '_')
  return path.join(readyDir(minecraftRoot), `${safe}.json`)
}

export function nativesRoot(minecraftRoot: string, versionId: string): string {
  const safe = versionId.replace(/[^a-zA-Z0-9._-]+/g, '_')
  return path.join(minecraftRoot, 'natives', safe)
}

export async function versionJsonExists(minecraftRoot: string, versionId: string): Promise<boolean> {
  try {
    await fs.access(path.join(minecraftRoot, 'versions', versionId, `${versionId}.json`))
    return true
  } catch {
    return false
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

/** バージョン JSON だけでなく、本体 jar・ライブラリが揃っているか */
export async function isVersionComplete(minecraftRoot: string, versionId: string): Promise<boolean> {
  if (!(await versionJsonExists(minecraftRoot, versionId))) return false
  try {
    const parsed = (await Version.parse(minecraftRoot, versionId)) as ParsedVersion
    const jarId = parsed.jar || parsed.minecraftVersion
    if (jarId) {
      const jarPath = path.join(minecraftRoot, 'versions', jarId, `${jarId}.jar`)
      if (!(await fileExists(jarPath))) return false
    }
    for (const lib of parsed.libraries ?? []) {
      const libPath = lib.download?.path || lib.path
      if (!libPath) continue
      if (!(await fileExists(path.join(minecraftRoot, 'libraries', libPath)))) return false
    }
    return true
  } catch {
    return false
  }
}

function expectedVersionIds(
  profile: Pick<InstanceProfile, 'minecraftVersion' | 'loader' | 'loaderVersion'>,
): string[] {
  const mc = profile.minecraftVersion
  const lv = profile.loaderVersion
  if (profile.loader === 'vanilla') return [mc]
  if (!lv) return []
  switch (profile.loader) {
    case 'fabric':
      return [`${mc}-fabric${lv}`, `fabric-loader-${lv}-${mc}`]
    case 'quilt':
      return [`${mc}-quilt${lv}`, `quilt-loader-${lv}-${mc}`]
    case 'forge':
      return [`${mc}-forge-${lv}`]
    case 'neoforge':
      return [`${mc}-neoforge-${lv}`, `neoforge-${lv}`]
    default:
      return []
  }
}

/** version JSON があるだけ（ライブラリ不足でも再利用・修復の起点にする） */
export async function findInstalledVersionId(
  minecraftRoot: string,
  profile: Pick<InstanceProfile, 'minecraftVersion' | 'loader' | 'loaderVersion'>,
): Promise<string | null> {
  try {
    const raw = await fs.readFile(readyPath(minecraftRoot, profile), 'utf8')
    const parsed = JSON.parse(raw) as ReadyRecord
    if (parsed?.versionId && (await versionJsonExists(minecraftRoot, parsed.versionId))) {
      return parsed.versionId
    }
  } catch {
    /* fall through */
  }

  for (const id of expectedVersionIds(profile)) {
    if (await versionJsonExists(minecraftRoot, id)) return id
  }
  return null
}

export async function findReadyVersionId(
  minecraftRoot: string,
  profile: Pick<InstanceProfile, 'minecraftVersion' | 'loader' | 'loaderVersion'>,
): Promise<string | null> {
  try {
    const raw = await fs.readFile(readyPath(minecraftRoot, profile), 'utf8')
    const parsed = JSON.parse(raw) as ReadyRecord
    if (parsed?.versionId && (await isVersionComplete(minecraftRoot, parsed.versionId))) {
      return parsed.versionId
    }
  } catch {
    /* fall through */
  }

  for (const id of expectedVersionIds(profile)) {
    if (await isVersionComplete(minecraftRoot, id)) return id
  }
  return null
}

export async function writeReadyRecord(
  minecraftRoot: string,
  profile: Pick<InstanceProfile, 'minecraftVersion' | 'loader' | 'loaderVersion'>,
  versionId: string,
): Promise<void> {
  await fs.mkdir(readyDir(minecraftRoot), { recursive: true })
  const record: ReadyRecord = {
    versionId,
    minecraftVersion: profile.minecraftVersion,
    loader: profile.loader,
    loaderVersion: profile.loaderVersion,
    readyAt: new Date().toISOString(),
  }
  await fs.writeFile(readyPath(minecraftRoot, profile), JSON.stringify(record, null, 2), 'utf8')
}
