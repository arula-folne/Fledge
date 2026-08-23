import fs from 'node:fs/promises'
import path from 'node:path'
import { NEWS, NewsItemSchema, type NewsItem } from '@fledge/shared'
import type { PathLayout } from '../app/paths.js'
import type { NewsProvider } from './NewsProvider.js'

const FALLBACK_NEWS: NewsItem[] = [
  {
    id: 'welcome',
    title: 'Fledge へようこそ',
    body: '広告や利用解析のない、軽量でシンプルな Minecraft ランチャーです。',
    publishedAt: new Date().toISOString(),
  },
]

type NewsMeta = {
  fetchedAt: string
}

function parseNewsItems(data: unknown): NewsItem[] {
  if (!Array.isArray(data)) throw new Error('News JSON must be an array')
  return data
    .map((item) => NewsItemSchema.parse(item))
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
}

async function readNewsFile(file: string): Promise<NewsItem[] | null> {
  try {
    const raw = await fs.readFile(file, 'utf8')
    return parseNewsItems(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

export class LocalJsonNewsProvider implements NewsProvider {
  private refreshTail: Promise<void> | null = null

  constructor(
    private readonly layout: PathLayout,
    private readonly bundledPath?: string,
    private readonly remoteUrl: string = NEWS.remoteUrl,
  ) {}

  async list(): Promise<NewsItem[]> {
    await this.refreshIfNeeded()
    const cached = await readNewsFile(this.cachePath())
    if (cached?.length) return cached

    if (this.bundledPath) {
      const bundled = await readNewsFile(this.bundledPath)
      if (bundled?.length) return bundled
    }

    return FALLBACK_NEWS
  }

  private cachePath(): string {
    return path.join(this.layout.news, NEWS.localeFileName)
  }

  private metaPath(): string {
    return path.join(this.layout.news, NEWS.metaFileName)
  }

  private async readMeta(): Promise<NewsMeta | null> {
    try {
      const raw = await fs.readFile(this.metaPath(), 'utf8')
      const parsed = JSON.parse(raw) as NewsMeta
      if (!parsed?.fetchedAt) return null
      return parsed
    } catch {
      return null
    }
  }

  private isCacheFresh(meta: NewsMeta | null): boolean {
    if (!meta) return false
    const age = Date.now() - Date.parse(meta.fetchedAt)
    return Number.isFinite(age) && age >= 0 && age < NEWS.cacheTtlMs
  }

  private async refreshIfNeeded(): Promise<void> {
    const meta = await this.readMeta()
    if (this.isCacheFresh(meta)) return

    if (this.refreshTail) {
      await this.refreshTail
      return
    }

    this.refreshTail = this.fetchRemoteAndCache()
      .catch(() => undefined)
      .finally(() => {
        this.refreshTail = null
      })

    await this.refreshTail
  }

  private async fetchRemoteAndCache(): Promise<void> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), NEWS.fetchTimeoutMs)

    try {
      const res = await fetch(this.remoteUrl, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Fledge/0.1.1 (news-fetcher)',
        },
      })
      if (!res.ok) throw new Error(`News fetch failed: HTTP ${res.status}`)

      const items = parseNewsItems((await res.json()) as unknown)
      await fs.mkdir(this.layout.news, { recursive: true })
      await fs.writeFile(this.cachePath(), `${JSON.stringify(items, null, 2)}\n`, 'utf8')
      await fs.writeFile(
        this.metaPath(),
        `${JSON.stringify({ fetchedAt: new Date().toISOString() } satisfies NewsMeta, null, 2)}\n`,
        'utf8',
      )
    } finally {
      clearTimeout(timer)
    }
  }
}
