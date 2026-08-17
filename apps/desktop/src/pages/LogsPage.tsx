import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LogSource } from '@fledge/shared'
import { Button } from '../components/ui/Button'
import { useLogStore } from '../stores/appStores'

const SOURCES: Array<LogSource | 'all'> = [
  'all',
  'launcher',
  'game',
  'auth',
  'downloader',
  'java',
  'minecraft',
  'updater',
  'system',
]

export default function LogsPage() {
  const { t } = useTranslation()
  const lines = useLogStore((s) => s.lines)
  const clear = useLogStore((s) => s.clear)
  const [filter, setFilter] = useState<LogSource | 'all'>('all')
  const [autoScroll, setAutoScroll] = useState(true)
  const endRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(
    () => (filter === 'all' ? lines : lines.filter((l) => l.source === filter)),
    [lines, filter],
  )

  useEffect(() => {
    if (autoScroll) endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [filtered.length, autoScroll])

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">{t('logs.title')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-input)] px-2 py-1.5 text-sm text-[var(--color-text)]"
            value={filter}
            onChange={(e) => setFilter(e.target.value as LogSource | 'all')}
          >
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s === 'all' ? t('logs.filter.all') : t(`logs.source.${s}`)}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
            />
            {t('logs.autoScroll')}
          </label>
          <Button variant="ghost" onClick={() => clear()}>
            {t('logs.clear')}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[#1b2430] p-4 font-mono text-xs leading-relaxed text-[#e8eef5]">
        {filtered.map((line) => (
          <div key={line.id} className="whitespace-pre-wrap">
            <span className="text-[#8aa0b5]">
              {new Date(line.ts).toLocaleTimeString()} [{line.source}]
            </span>{' '}
            <span
              className={
                line.level === 'error'
                  ? 'text-[#ff8e8e]'
                  : line.level === 'warn'
                    ? 'text-[#ffd28a]'
                    : ''
              }
            >
              {line.message}
            </span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  )
}
