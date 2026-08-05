import fs from 'node:fs/promises'
import path from 'node:path'
import { NewsItemSchema, type NewsItem } from '@fledge/shared'
import type { PathLayout } from '../app/paths.js'
import type { NewsProvider } from './NewsProvider.js'

const FALLBACK_NEWS: NewsItem[] = [
  {
    id: 'welcome',
    title: 'Fledge へようこそ',
    body: 'Ready to take flight. 広告や利用解析のない、軽量でシンプルな Minecraft ランチャーです。',
    publishedAt: new Date().toISOString(),
  },
]

export class LocalJsonNewsProvider implements NewsProvider {
  constructor(
    private readonly layout: PathLayout,
    private readonly bundledPath?: string,
  ) {}

  async list(): Promise<NewsItem[]> {
    const candidates = [
      path.join(this.layout.news, 'news.ja.json'),
      this.bundledPath,
    ].filter(Boolean) as string[]

    for (const file of candidates) {
      try {
        const raw = await fs.readFile(file, 'utf8')
        const data = JSON.parse(raw) as unknown
        if (!Array.isArray(data)) continue
        return data.map((item) => NewsItemSchema.parse(item))
      } catch {
        // 次の候補へ
      }
    }
    return FALLBACK_NEWS
  }
}
