import fs from 'node:fs/promises'
import path from 'node:path'
import {
  CreateInstanceInputSchema,
  InstanceProfileSchema,
  type CreateInstanceInput,
  type InstanceProfile,
} from '@fledge/shared'
import type { PathLayout } from '../app/paths.js'

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

export class InstanceStore {
  constructor(private readonly layout: PathLayout) {}

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
      try {
        const raw = await fs.readFile(this.profilePath(entry.name), 'utf8')
        profiles.push(InstanceProfileSchema.parse(JSON.parse(raw)))
      } catch {
        // 壊れたインスタンスは一覧からスキップ
      }
    }
    return profiles.sort((a, b) => a.name.localeCompare(b.name, 'ja'))
  }

  async get(id: string): Promise<InstanceProfile | null> {
    try {
      const raw = await fs.readFile(this.profilePath(id), 'utf8')
      return InstanceProfileSchema.parse(JSON.parse(raw))
    } catch {
      return null
    }
  }

  async create(input: CreateInstanceInput, defaults?: { memoryMaxMb?: number; jvmArgs?: string[] }): Promise<InstanceProfile> {
    const parsed = CreateInstanceInputSchema.parse(input)
    const id = await this.allocateId(slugify(parsed.name))
    const now = new Date().toISOString()
    const profile: InstanceProfile = {
      id,
      name: parsed.name,
      createdAt: now,
      updatedAt: now,
      minecraftVersion: parsed.minecraftVersion,
      loader: parsed.loader,
      loaderVersion: parsed.loaderVersion,
      java: { strategy: 'auto' },
      memory: {
        maxMb: parsed.memoryMaxMb || defaults?.memoryMaxMb || 4096,
      },
      jvmArgs: parsed.jvmArgs.length ? parsed.jvmArgs : (defaults?.jvmArgs ?? []),
    }
    await this.writeInstance(profile)
    return profile
  }

  async update(id: string, partial: Partial<InstanceProfile>): Promise<InstanceProfile> {
    const current = await this.get(id)
    if (!current) throw new Error(`Instance not found: ${id}`)
    const next = InstanceProfileSchema.parse({
      ...current,
      ...partial,
      id: current.id,
      updatedAt: new Date().toISOString(),
    })
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
    }
    await this.writeInstance(profile)
    // mods 等はコピー（profile 以外）
    await this.copyInstanceContents(this.instanceDir(id), this.instanceDir(newId))
    await fs.writeFile(this.profilePath(newId), JSON.stringify(profile, null, 2), 'utf8')
    return profile
  }

  async remove(id: string): Promise<void> {
    const dir = this.instanceDir(id)
    await fs.rm(dir, { recursive: true, force: true })
  }

  private async allocateId(base: string): Promise<string> {
    let candidate = base
    let i = 2
    while (await pathExists(this.instanceDir(candidate))) {
      candidate = `${base}-${i}`
      i += 1
    }
    return candidate
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
    const entries = await fs.readdir(from, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name === 'profile.json') continue
      const src = path.join(from, entry.name)
      const dest = path.join(to, entry.name)
      await fs.cp(src, dest, { recursive: true })
    }
  }
}
