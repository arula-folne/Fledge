import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { MAX_UPLOADED_SKINS, type SkinEntry, type SkinModel } from '@fledge/shared'
import type { PathLayout } from '../app/paths.js'

/** Minecraft デフォルトスキン（テクスチャはアプリ同梱） */
export const DEFAULT_SKINS: SkinEntry[] = [
  { id: 'steve', name: 'Steve', source: 'default', model: 'wide', previewColor: '#8B6B4A' },
  { id: 'alex', name: 'Alex', source: 'default', model: 'slim', previewColor: '#C48A5A' },
  { id: 'ari', name: 'Ari', source: 'default', model: 'wide', previewColor: '#6B8E6B' },
  { id: 'efe', name: 'Efe', source: 'default', model: 'wide', previewColor: '#4A4A4A' },
  { id: 'kai', name: 'Kai', source: 'default', model: 'wide', previewColor: '#5A7A9A' },
  { id: 'makena', name: 'Makena', source: 'default', model: 'slim', previewColor: '#9A6B5A' },
  { id: 'noor', name: 'Noor', source: 'default', model: 'slim', previewColor: '#7A5A8A' },
  { id: 'sunny', name: 'Sunny', source: 'default', model: 'wide', previewColor: '#D4A84A' },
  { id: 'zuri', name: 'Zuri', source: 'default', model: 'wide', previewColor: '#5A8A7A' },
]

type UploadedMeta = {
  id: string
  name: string
  model: SkinModel
  fileName: string
}

export class SkinStore {
  constructor(
    private readonly layout: PathLayout,
    private readonly defaultSkinsDir?: string,
  ) {}

  private metaPath(): string {
    return path.join(this.layout.skins, 'uploaded.json')
  }

  async list(): Promise<SkinEntry[]> {
    const uploaded = await this.readUploaded()
    const uploads: SkinEntry[] = uploaded.map((u) => ({
      id: u.id,
      name: u.name,
      source: 'upload',
      model: u.model,
      fileName: u.fileName,
    }))
    return [...DEFAULT_SKINS, ...uploads]
  }

  async upload(input: {
    name: string
    model: SkinModel
    bytes: Uint8Array
    originalName: string
    thumb?: { bytes: Uint8Array; ext: 'webp' | 'png' }
  }): Promise<SkinEntry> {
    await fs.mkdir(this.layout.skins, { recursive: true })
    const list = await this.readUploaded()
    if (list.length >= MAX_UPLOADED_SKINS) {
      throw new Error(`Maximum of ${MAX_UPLOADED_SKINS} uploaded skins`)
    }
    const id = randomUUID()
    const ext = path.extname(input.originalName).toLowerCase() || '.png'
    const fileName = `${id}${ext}`
    await fs.writeFile(path.join(this.layout.skins, fileName), Buffer.from(input.bytes))
    const entry: UploadedMeta = {
      id,
      name: sanitizeSkinName(input.name, path.basename(input.originalName, ext)),
      model: input.model,
      fileName,
    }
    list.push(entry)
    await fs.writeFile(this.metaPath(), JSON.stringify(list, null, 2), 'utf8')
    if (input.thumb) {
      await this.writeThumb(id, input.model, input.thumb.bytes, input.thumb.ext)
    }
    return toUploadEntry(entry)
  }

  private thumbsDir(): string {
    return path.join(this.layout.skins, 'thumbs')
  }

  private thumbFile(id: string, model: SkinModel, ext: 'webp' | 'png'): string {
    if (!/^[\w-]+$/.test(id)) {
      throw new Error(`Invalid skin id: ${id}`)
    }
    return path.join(this.thumbsDir(), `${id}.${model}.${ext}`)
  }

  async readThumbDataUrl(id: string, model: SkinModel): Promise<string | null> {
    for (const [ext, mime] of [
      ['webp', 'image/webp'],
      ['png', 'image/png'],
    ] as const) {
      try {
        const buf = await fs.readFile(this.thumbFile(id, model, ext))
        return `data:${mime};base64,${buf.toString('base64')}`
      } catch {
        /* try next */
      }
    }
    return null
  }

  async writeThumb(
    id: string,
    model: SkinModel,
    bytes: Uint8Array,
    ext: 'webp' | 'png',
  ): Promise<void> {
    await fs.mkdir(this.thumbsDir(), { recursive: true })
    await fs.writeFile(this.thumbFile(id, model, ext), Buffer.from(bytes))
  }

  async removeThumbs(id: string): Promise<void> {
    const files = ['wide', 'slim'].flatMap((model) =>
      (['webp', 'png'] as const).map((ext) => this.thumbFile(id, model as SkinModel, ext)),
    )
    await Promise.all(files.map((file) => fs.rm(file, { force: true })))
  }

  async update(
    id: string,
    patch: { name?: string; model?: SkinModel },
  ): Promise<SkinEntry> {
    const list = await this.readUploaded()
    const target = list.find((s) => s.id === id)
    if (!target) throw new Error(`Skin not found: ${id}`)
    if (patch.name !== undefined) {
      target.name = sanitizeSkinName(patch.name, target.name)
    }
    if (patch.model !== undefined) {
      target.model = patch.model
      await this.removeThumbs(id)
    }
    await fs.writeFile(this.metaPath(), JSON.stringify(list, null, 2), 'utf8')
    return toUploadEntry(target)
  }

  async remove(id: string): Promise<void> {
    const list = await this.readUploaded()
    const target = list.find((s) => s.id === id)
    if (!target) return
    const next = list.filter((s) => s.id !== id)
    await fs.writeFile(this.metaPath(), JSON.stringify(next, null, 2), 'utf8')
    await fs.rm(path.join(this.layout.skins, target.fileName), { force: true })
    await this.removeThumbs(id)
  }

  resolveFilePath(fileName: string): string {
    return path.join(this.layout.skins, fileName)
  }

  async readPngBytes(id: string): Promise<Uint8Array | null> {
    const skins = await this.list()
    const skin = skins.find((s) => s.id === id)
    if (!skin) return null
    if (skin.source === 'upload' && skin.fileName) {
      return fs.readFile(this.resolveFilePath(skin.fileName))
    }
    if (skin.source === 'default' && this.defaultSkinsDir) {
      try {
        return await fs.readFile(path.join(this.defaultSkinsDir, `${skin.id}.png`))
      } catch {
        return null
      }
    }
    return null
  }

  private async readUploaded(): Promise<UploadedMeta[]> {
    try {
      const raw = await fs.readFile(this.metaPath(), 'utf8')
      return JSON.parse(raw) as UploadedMeta[]
    } catch {
      return []
    }
  }
}

function toUploadEntry(entry: UploadedMeta): SkinEntry {
  return {
    id: entry.id,
    name: entry.name,
    source: 'upload',
    model: entry.model,
    fileName: entry.fileName,
  }
}

function sanitizeSkinName(name: string, fallback: string): string {
  const trimmed = name.trim().slice(0, 32)
  if (trimmed) return trimmed
  const fallbackTrimmed = fallback.trim().slice(0, 32)
  return fallbackTrimmed || 'Skin'
}
