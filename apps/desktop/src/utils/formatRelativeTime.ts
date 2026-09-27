import type { TFunction } from 'i18next'

/**
 * 相対時刻（例: 6日前）。ISO 文字列や Date を受け取り、i18n の content.time.* で整形する。
 */
export function formatRelativeTime(
  input: string | Date | null | undefined,
  t: TFunction,
  nowMs: number = Date.now(),
): string | null {
  if (input == null || input === '') return null
  const ms = typeof input === 'string' ? Date.parse(input) : input.getTime()
  if (!Number.isFinite(ms)) return null

  const diffSec = Math.max(0, Math.floor((nowMs - ms) / 1000))
  if (diffSec < 60) return t('content.time.justNow')

  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return t('content.time.minutes', { n: diffMin })

  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return t('content.time.hours', { n: diffHour })

  const diffDay = Math.floor(diffHour / 24)
  if (diffDay < 7) return t('content.time.days', { n: diffDay })

  const diffWeek = Math.floor(diffDay / 7)
  if (diffWeek < 5) return t('content.time.weeks', { n: diffWeek })

  const diffMonth = Math.floor(diffDay / 30)
  if (diffMonth < 12) return t('content.time.months', { n: Math.max(1, diffMonth) })

  const diffYear = Math.floor(diffDay / 365)
  return t('content.time.years', { n: Math.max(1, diffYear) })
}
