import fs from 'node:fs/promises'
import path from 'node:path'
import { NEWS, NewsItemSchema, fledgeUserAgent, type NewsItem } from '@fledge/shared'
import type { PathLayout } from '../app/paths.js'
import type { NewsProvider } from './NewsProvider.js'

const FALLBACK_NEWS: NewsItem[] = [
  {
    id: 'welcome',
    title: 'Fledge へようこそ',
    body: '広告や利用解析のない、軽快で使いやすい Minecraft ランチャーです。初回起動のゲーム設定や Mod 導入も、モダンな UI から整えられます。',
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

function fingerprint(items: NewsItem[]): string {
  return items.map((item) => `${item.id}:${item.publishedAt}:${item.title}`).join('|')
}

export class LocalJsonNewsProvider implements NewsProvider {
  private refreshTail: Promise<NewsItem[] | null> | null = null
  private lastFingerprint = ''

  constructor(
    private readonly layout: PathLayout,
    private readonly bundledPath?: string,
    private readonly remoteUrl: string = NEWS.remoteUrl,
    private readonly onUpdated?: (items: NewsItem[]) => void,
  ) {}

  async list(): Promise<NewsItem[]> {
    const local = await this.readLocal()
    this.lastFingerprint ||= fingerprint(local)
    const remote = this.refreshRemote()
    // 可能なら今回の呼び出しでリモートを待ち、古いキャッシュだけを返さない
    const raced = await Promise.race([
      remote,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 4_000)),
    ])
    if (raced?.length) return raced
    return local
  }

  private async readLocal(): Promise<NewsItem[]> {
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

  private refreshRemote(): Promise<NewsItem[] | null> {
    if (this.refreshTail) return this.refreshTail

    this.refreshTail = (async () => {
      const meta = await this.readMeta()
      if (this.isCacheFresh(meta)) {
        return readNewsFile(this.cachePath())
      }
      try {
        const items = await this.fetchRemoteAndCache()
        const next = fingerprint(items)
        if (next !== this.lastFingerprint) {
          this.lastFingerprint = next
          this.onUpdated?.(items)
        }
        return items
      } catch {
        return null
      }
    })().finally(() => {
      this.refreshTail = null
    })

    return this.refreshTail
  }

  private async fetchRemoteAndCache(): Promise<NewsItem[]> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), NEWS.fetchTimeoutMs)
    const url = `${this.remoteUrl}${this.remoteUrl.includes('?') ? '&' : '?'}t=${Date.now()}`

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
          'User-Agent': fledgeUserAgent('news-fetcher'),
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
      return items
    } finally {
      clearTimeout(timer)
    }
  }
}
