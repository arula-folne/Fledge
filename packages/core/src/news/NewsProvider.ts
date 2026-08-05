import type { NewsItem } from '@fledge/shared'

export interface NewsProvider {
  list(): Promise<NewsItem[]>
}
