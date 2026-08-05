import fs from 'node:fs/promises'
import path from 'node:path'

export type CacheEnvelope<T> = {
  fetchedAt: string
  data: T
}

export type CacheRead<T> = {
  data: T
  fetchedAt: string
  /** TTL 超過 */
  stale: boolean
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000

/**
 * Data/Cache 配下の JSON キャッシュ。
 * キー例: minecraft_versions / fabric / forge / neoforge
 */
export class VersionCache {
  constructor(
    private readonly cacheDir: string,
    private readonly ttlMs = DEFAULT_TTL_MS,
  ) {}

  private filePath(key: string): string {
    const safe = key.replace(/[^a-zA-Z0-9._-]/g, '_')
    return path.join(this.cacheDir, `${safe}.json`)
  }

  async ensureDir(): Promise<void> {
    await fs.mkdir(this.cacheDir, { recursive: true })
  }

  async get<T>(key: string): Promise<CacheRead<T> | null> {
    try {
      const raw = await fs.readFile(this.filePath(key), 'utf8')
      const parsed = JSON.parse(raw) as CacheEnvelope<T>
      if (!parsed?.fetchedAt || parsed.data === undefined) return null
      const age = Date.now() - Date.parse(parsed.fetchedAt)
      return {
        data: parsed.data,
        fetchedAt: parsed.fetchedAt,
        stale: !Number.isFinite(age) || age > this.ttlMs,
      }
    } catch {
      return null
    }
  }

  async set<T>(key: string, data: T): Promise<string> {
    await this.ensureDir()
    const fetchedAt = new Date().toISOString()
    const envelope: CacheEnvelope<T> = { fetchedAt, data }
    await fs.writeFile(this.filePath(key), JSON.stringify(envelope, null, 2), 'utf8')
    return fetchedAt
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.filePath(key))
    } catch {
      // ignore
    }
  }

  async clear(): Promise<void> {
    try {
      const entries = await fs.readdir(this.cacheDir)
      await Promise.all(
        entries
          .filter((n) => n.endsWith('.json'))
          .map((n) => fs.unlink(path.join(this.cacheDir, n)).catch(() => undefined)),
      )
    } catch {
      // ignore
    }
  }
}
