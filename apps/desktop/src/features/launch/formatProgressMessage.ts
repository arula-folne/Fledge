import type { ProgressEvent } from '@fledge/shared'

type Translate = (key: string, opts?: Record<string, unknown>) => string

/** SHA など内部識別子は出さず、人が読む値だけ渡す */
function interpolationOf(meta?: ProgressEvent['meta'] | null): Record<string, unknown> | undefined {
  if (!meta) return undefined
  const out: Record<string, unknown> = {}
  if (typeof meta.major === 'number' || typeof meta.major === 'string') out.major = meta.major
  if (typeof meta.name === 'string' && meta.name.trim()) out.name = meta.name
  if (typeof meta.version === 'string' && isHumanVersion(meta.version)) out.version = meta.version
  return Object.keys(out).length > 0 ? out : undefined
}

function isHumanVersion(value: string): boolean {
  if (/^[a-f0-9]{16,}$/i.test(value)) return false
  if (value.length > 24 && !value.includes('.')) return false
  return true
}

/** 起動・導入中の進捗テキスト。ファイル名・ハッシュは出さない */
export function formatProgressMessage(
  t: Translate,
  key: string | null | undefined,
  meta?: ProgressEvent['meta'] | null,
  fallbackKey = 'common.loading',
): string {
  return t(key || fallbackKey, interpolationOf(meta))
}
