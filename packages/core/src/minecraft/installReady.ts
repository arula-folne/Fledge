import fs from 'node:fs/promises'
import path from 'node:path'
import type { InstanceProfile } from '@fledge/shared'

export type ReadyRecord = {
  versionId: string
  minecraftVersion: string
  loader: InstanceProfile['loader']
  loaderVersion?: string
  readyAt: string
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

function expectedVersionIds(
  profile: Pick<InstanceProfile, 'minecraftVersion' | 'loader' | 'loaderVersion'>,
): string[] {
  const mc = profile.minecraftVersion
  const lv = profile.loaderVersion
  if (profile.loader === 'vanilla') return [mc]
  if (!lv) return []
  switch (profile.loader) {
    case 'fabric':
      return [`fabric-loader-${lv}-${mc}`]
    case 'quilt':
      return [`quilt-loader-${lv}-${mc}`]
    case 'forge':
      return [`${mc}-forge-${lv}`]
    case 'neoforge':
      return [`${mc}-neoforge-${lv}`, `neoforge-${lv}`]
    default:
      return []
  }
}

export async function findReadyVersionId(
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
