import type { NewsItem } from '@fledge/shared'

export interface NewsProvider {
  list(opts?: { force?: boolean }): Promise<NewsItem[]>
}
