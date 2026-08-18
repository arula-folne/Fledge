import type { ProgressEvent } from '@fledge/shared'

type Translate = (key: string, opts?: Record<string, unknown>) => string

/** 起動・導入中の進捗テキスト。処理名と、あればファイル名を出す */
export function formatProgressMessage(
  t: Translate,
  key: string | null | undefined,
  meta?: ProgressEvent['meta'] | null,
  fallbackKey = 'common.loading',
): string {
  const text = t(key || fallbackKey, meta ?? undefined)
  const file = meta?.file
  if (typeof file === 'string' && file.length > 0 && !text.includes(file)) {
    return `${text}（${file}）`
  }
  return text
}
