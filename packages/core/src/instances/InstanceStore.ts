import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  CreateInstanceInputSchema,
  DEFAULT_INSTANCE_ICON_PRESET,
  INSTANCE_ICON_EXTS,
  MAX_INSTANCE_ICON_BYTES,
  InstanceProfileSchema,
  type CreateInstanceIcon,
  type CreateInstanceInput,
  type InstanceProfile,
  type UpdateInstanceInput,
} from '@fledge/shared'
import type { PathLayout } from '../app/paths.js'
import { rmRetry } from '../fs/rmRetry.js'
import type { Logger } from '../logging/Logger.js'
import { parseInstanceProfile } from './instanceProfileMigration.js'

function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return base || 'instance'
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

function iconExt(originalName: string): string | null {
  const ext = path.extname(originalName).toLowerCase()
  return (INSTANCE_ICON_EXTS as readonly string[]).includes(ext) ? ext : null
}

function mimeForExt(ext: string): string {
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    case '.bmp':
      return 'image/bmp'
    default:
      return 'image/png'
  }
}

export class InstanceStore {
  constructor(
    private readonly layout: PathLayout,
    private readonly logger?: Logger,
  ) {}

  instanceDir(id: string): string {
    return path.join(this.layout.instances, id)
  }

  private profilePath(id: string): string {
    return path.join(this.instanceDir(id), 'profile.json')
  }

  async list(): Promise<InstanceProfile[]> {
    await fs.mkdir(this.layout.instances, { recursive: true })
    const entries = await fs.readdir(this.layout.instances, { withFileTypes: true })
    const profiles: InstanceProfile[] = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const profile = await this.readProfile(entry.name)
      if (profile) profiles.push(profile)
    }
    return profiles.sort((a, b) => a.name.localeCompare(b.name, 'ja'))
  }

  async get(id: string): Promise<InstanceProfile | null> {
    return this.readProfile(id)
  }

  private async readProfile(id: string): Promise<InstanceProfile | null> {
    const file = this.profilePath(id)
    try {
      const raw = await fs.readFile(file, 'utf8')
      const parsed = JSON.parse(raw) as unknown
      const { profile, migrated } = parseInstanceProfile(parsed)
      if (migrated) {
        await fs.writeFile(file, JSON.stringify(profile, null, 2), 'utf8')
        this.logger?.info('launcher', `Migrated profile.json for instance ${id}`)
      }
      return profile
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      this.logger?.warn('launcher', `Skipped invalid profile.json for ${id}: ${reason}`)
      return null
    }
  }

  async create(
    input: CreateInstanceInput,
    defaults?: {
      memoryMaxMb?: number
      jvmArgs?: string[]
      pendingMinecraftOptions?: Record<string, string>
      pendingMinecraftDebugOverlay?: Record<string, string>
      seedMinecraftInitialSettings?: boolean
    },
  ): Promise<InstanceProfile> {
    const parsed = CreateInstanceInputSchema.parse(input)
    const { icon, ...fields } = parsed
    const id = await this.allocateId(slugify(fields.name))
    const now = new Date().toISOString()
    const seed = defaults?.seedMinecraftInitialSettings === true
    const profile: InstanceProfile = {
      id,
      name: fields.name,
      createdAt: now,
      updatedAt: now,
      minecraftVersion: fields.minecraftVersion,
      loader: fields.loader,
      loaderVersion: fields.loaderVersion,
      java: { strategy: 'auto' },
      memory: {
        maxMb: fields.memoryMaxMb || defaults?.memoryMaxMb || 2048,
      },
      jvmArgs: fields.jvmArgs.length ? fields.jvmArgs : (defaults?.jvmArgs ?? []),
      iconPreset: icon ? undefined : (fields.iconPreset ?? DEFAULT_INSTANCE_ICON_PRESET),
      ...(seed
        ? {
            minecraftInitialSettingsSeeded: true,
            minecraftInitialSettingsApplied: false,
            pendingMinecraftOptions: defaults?.pendingMinecraftOptions ?? {},
            pendingMinecraftDebugOverlay: defaults?.pendingMinecraftDebugOverlay ?? {},
          }
        : {}),
    }
    await this.writeInstance(profile)
    if (icon) {
      const iconFile = await this.writeIconFile(id, icon)
      profile.iconFile = iconFile
      await fs.writeFile(this.profilePath(id), JSON.stringify(profile, null, 2), 'utf8')
    }
    return profile
  }

  async update(id: string, partial: UpdateInstanceInput): Promise<InstanceProfile> {
    const current = await this.get(id)
    if (!current) throw new Error(`Instance not found: ${id}`)
    const { icon, ...rest } = partial

    let iconFile = current.iconFile
    if (icon === null) {
      await this.removeIconFiles(id, current.iconFile)
      iconFile = undefined
    } else if (icon) {
      await this.removeIconFiles(id, current.iconFile)
      iconFile = await this.writeIconFile(id, icon)
    }

    const merged: Record<string, unknown> = {
      ...current,
      ...rest,
      id: current.id,
      updatedAt: new Date().toISOString(),
    }
    if (icon === null) {
      delete merged.iconFile
    } else if (icon) {
      merged.iconFile = iconFile
    }

    const next = InstanceProfileSchema.parse(merged)
    await fs.writeFile(this.profilePath(id), JSON.stringify(next, null, 2), 'utf8')
    return next
  }

  async duplicate(id: string): Promise<InstanceProfile> {
    const source = await this.get(id)
    if (!source) throw new Error(`Instance not found: ${id}`)
    const copyName = `${source.name} のコピー`
    const newId = await this.allocateId(slugify(copyName))
    const now = new Date().toISOString()
    const profile: InstanceProfile = {
      ...source,
      id: newId,
      name: copyName,
      createdAt: now,
      updatedAt: now,
      lastPlayedAt: undefined,
      // コピー先は初回適用し直す（コピー元が applied だと設定がスキップされるのを防ぐ）
      minecraftInitialSettingsApplied: false,
      minecraftInitialSettingsApplyGeneration: 0,
      ...(source.minecraftInitialSettingsSeeded
        ? { minecraftInitialSettingsSeeded: true }
        : {}),
    }
    await this.writeInstance(profile)
    // mods 等はコピー（profile 以外）
    await this.copyInstanceContents(this.instanceDir(id), this.instanceDir(newId))
    await fs.writeFile(this.profilePath(newId), JSON.stringify(profile, null, 2), 'utf8')
    return profile
  }

  async remove(id: string): Promise<void> {
    const dir = this.instanceDir(id)
    await rmRetry(dir)
  }

  async getIconDataUrl(id: string): Promise<string | null> {
    const profile = await this.get(id)
    if (!profile?.iconFile) return null
    const file = path.basename(profile.iconFile)
    if (file !== profile.iconFile) return null
    const ext = path.extname(file).toLowerCase()
    if (!(INSTANCE_ICON_EXTS as readonly string[]).includes(ext)) return null
    const full = path.join(this.instanceDir(id), file)
    try {
      const buf = await fs.readFile(full)
      return `data:${mimeForExt(ext)};base64,${buf.toString('base64')}`
    } catch {
      return null
    }
  }

  private async writeIconFile(id: string, icon: CreateInstanceIcon): Promise<string> {
    if (icon.bytes.length > MAX_INSTANCE_ICON_BYTES) {
      throw new Error('Instance icon is too large')
    }
    const ext = iconExt(icon.originalName)
    if (!ext) throw new Error('Unsupported instance icon format')
    const fileName = `icon${ext}`
    await fs.writeFile(path.join(this.instanceDir(id), fileName), Buffer.from(icon.bytes))
    return fileName
  }

  private async removeIconFiles(id: string, knownFile?: string): Promise<void> {
    const dir = this.instanceDir(id)
    const names = new Set<string>()
    if (knownFile) names.add(path.basename(knownFile))
    for (const ext of INSTANCE_ICON_EXTS) names.add(`icon${ext}`)
    await Promise.all(
      [...names].map((name) => fs.rm(path.join(dir, name), { force: true }).catch(() => undefined)),
    )
  }

  private async allocateId(base: string): Promise<string> {
    // 削除後に同名で作り直しても ID / フォルダが再利用されないよう常に一意サフィックスを付ける
    for (let i = 0; i < 32; i++) {
      const suffix = randomUUID().replace(/-/g, '').slice(0, 8)
      const candidate = `${base}-${suffix}`
      if (!(await pathExists(this.instanceDir(candidate)))) return candidate
    }
    throw new Error('Failed to allocate instance id')
  }

  private async writeInstance(profile: InstanceProfile): Promise<void> {
    const dir = this.instanceDir(profile.id)
    const subdirs = [
      'mods',
      'resourcepacks',
      'shaderpacks',
      'saves',
      'config',
      'screenshots',
      'logs',
      'plugins',
      path.join('world', 'datapacks'),
    ]
    await fs.mkdir(dir, { recursive: true })
    await Promise.all(subdirs.map((s) => fs.mkdir(path.join(dir, s), { recursive: true })))
    await fs.writeFile(this.profilePath(profile.id), JSON.stringify(profile, null, 2), 'utf8')
  }

  private async copyInstanceContents(from: string, to: string): Promise<void> {
    const excludedUserData = new Set([
      'saves',
      'logs',
      'screenshots',
      'crash-reports',
      'backups',
    ])
    const entries = await fs.readdir(from, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name === 'profile.json' || excludedUserData.has(entry.name.toLowerCase())) continue
      const src = path.join(from, entry.name)
      const dest = path.join(to, entry.name)
      await fs.cp(src, dest, { recursive: true })
    }
  }
}
