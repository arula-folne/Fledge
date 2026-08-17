import type { ContentProject, ContentProjectPage, ContentSearchResult } from '@fledge/shared'

const JP_RE = /[\u3040-\u30ff\u3400-\u9fff\uff66-\uff9f]/
const SEP = '\n\u241e\n'
const MAX_CACHE = 400
const MAX_QUERY_CHARS = 1400
const TRANSLATE_MS = 8_000

const cache = new Map<string, string>()

export function looksJapanese(text: string): boolean {
  return JP_RE.test(text)
}

function cacheGet(text: string): string | undefined {
  return cache.get(text)
}

function cacheSet(text: string, translated: string): void {
  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(text, translated)
}

function parseGtxJson(data: unknown): string {
  if (data && typeof data === 'object' && 'sentences' in data) {
    const sentences = (data as { sentences?: Array<{ trans?: string }> }).sentences
    return (sentences ?? []).map((s) => s.trans ?? '').join('')
  }
  if (!Array.isArray(data) || !Array.isArray(data[0])) return ''
  return (data[0] as unknown[])
    .map((row) => (Array.isArray(row) ? String(row[0] ?? '') : ''))
    .join('')
}

async function translateChunk(text: string, signal: AbortSignal): Promise<string> {
  const url = new URL('https://translate.googleapis.com/translate_a/single')
  url.searchParams.set('client', 'gtx')
  url.searchParams.set('sl', 'auto')
  url.searchParams.set('tl', 'ja')
  url.searchParams.set('dt', 't')
  url.searchParams.set('dj', '1')
  url.searchParams.set('q', text)

  const res = await fetch(url, {
    signal,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Fledge/0.1.0 (https://github.com/arula-folne/Fledge; content-i18n)',
    },
  })
  if (!res.ok) throw new Error(`translate ${res.status}`)
  const translated = parseGtxJson(await res.json())
  if (!translated.trim()) throw new Error('empty translation')
  return translated
}

function chunkPending(items: string[]): string[][] {
  const chunks: string[][] = []
  let current: string[] = []
  let size = 0
  for (const item of items) {
    const extra = item.length + (current.length ? SEP.length : 0)
    if (current.length > 0 && size + extra > MAX_QUERY_CHARS) {
      chunks.push(current)
      current = []
      size = 0
    }
    current.push(item)
    size += extra
  }
  if (current.length) chunks.push(current)
  return chunks
}

async function translateMany(texts: string[]): Promise<string[]> {
  const out = texts.map((text) => {
    if (!text || !text.trim() || looksJapanese(text)) return text
    return cacheGet(text) ?? null
  })

  const pending: { index: number; text: string }[] = []
  for (let i = 0; i < texts.length; i++) {
    if (out[i] === null) pending.push({ index: i, text: texts[i]! })
  }
  if (pending.length === 0) return texts.map((t, i) => out[i] ?? t)

  let cursor = 0
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), TRANSLATE_MS)
  try {
    for (const group of chunkPending(pending.map((p) => p.text))) {
      const slice = pending.slice(cursor, cursor + group.length)
      cursor += group.length
      try {
        if (slice.length === 1) {
          const translated = await translateChunk(slice[0]!.text, ac.signal)
          cacheSet(slice[0]!.text, translated)
          out[slice[0]!.index] = translated
          continue
        }
        const joined = slice.map((s) => s.text).join(SEP)
        const translated = await translateChunk(joined, ac.signal)
        const parts = translated.split(/\n?\u241e\n?/)
        if (parts.length === slice.length) {
          slice.forEach((s, j) => {
            const part = parts[j]!.trim()
            cacheSet(s.text, part)
            out[s.index] = part
          })
        } else {
          for (const s of slice) {
            try {
              const one = await translateChunk(s.text, ac.signal)
              cacheSet(s.text, one)
              out[s.index] = one
            } catch {
              out[s.index] = s.text
            }
          }
        }
      } catch {
        for (const s of slice) out[s.index] = s.text
      }
    }
  } finally {
    clearTimeout(timer)
  }

  return texts.map((t, i) => out[i] ?? t)
}

export async function localizeSearchResult(result: ContentSearchResult): Promise<ContentSearchResult> {
  const originals = result.hits.map((h) => h.description ?? '')
  const translated = await translateMany(originals)
  const hits: ContentProject[] = result.hits.map((hit, i) => {
    const next = translated[i] ?? hit.description
    if (next === hit.description) return hit
    return { ...hit, description: next, descriptionTranslated: true }
  })
  return { ...result, hits }
}

export async function localizeProjectPage(page: ContentProjectPage): Promise<ContentProjectPage> {
  const desc = page.project.description ?? ''
  const body = page.project.body ?? ''
  const bodyHead = body.length > 4000 ? body.slice(0, 4000) : body
  const [nextDesc, nextBody] = await translateMany([desc, bodyHead])
  let project = page.project
  if (nextDesc && nextDesc !== desc) {
    project = { ...project, description: nextDesc, descriptionTranslated: true }
  }
  if (nextBody && nextBody !== bodyHead) {
    const rest = body.length > 4000 ? body.slice(4000) : ''
    project = { ...project, body: `${nextBody}${rest}`, bodyTranslated: true }
  }
  return { ...page, project }
}
