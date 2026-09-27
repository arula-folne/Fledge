import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconCheck, IconCopy } from '@tabler/icons-react'
import type { InstalledContent } from '@fledge/shared'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { buildContentShareText, type ContentShareFormat } from './contentShare'

type Props = {
  open: boolean
  items: InstalledContent[]
  onClose: () => void
}

const FORMATS: ContentShareFormat[] = ['names', 'links', 'fileNames']

export function ContentShareDialog({ open, items, onClose }: Props) {
  const { t } = useTranslation()
  const [format, setFormat] = useState<ContentShareFormat>('names')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) {
      setFormat('names')
      setCopied(false)
    }
  }, [open])

  const text = useMemo(() => buildContentShareText(items, format), [items, format])

  const copy = async () => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      window.alert(t('content.shareCopyFailed'))
    }
  }

  const formatLabel = (id: ContentShareFormat) => {
    if (id === 'names') return t('content.shareFormatNames')
    if (id === 'links') return t('content.shareFormatLinks')
    return t('content.shareFormatFileNames')
  }

  return (
    <Dialog
      open={open}
      title={t('content.shareTitle')}
      subtitle={t('content.shareSubtitle', { count: items.length })}
      size="sm"
      overlayClassName="z-[90]"
      onClose={onClose}
      footer={
        <>
          <Button type="button" onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button type="button" variant="primary" disabled={!text} onClick={() => void copy()}>
            {copied ? (
              <>
                <IconCheck size={14} stroke={1.75} aria-hidden />
                {t('content.shareCopied')}
              </>
            ) : (
              <>
                <IconCopy size={14} stroke={1.75} aria-hidden />
                {t('content.shareCopy')}
              </>
            )}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('content.shareFormatLabel')}>
          {FORMATS.map((id) => {
            const on = format === id
            return (
              <button
                key={id}
                type="button"
                aria-pressed={on}
                className={[
                  'rounded-[var(--radius-sm)] px-2.5 py-1.5 text-xs font-medium transition-colors',
                  on
                    ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/35'
                    : 'bg-[var(--color-hover)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
                ].join(' ')}
                onClick={() => {
                  setFormat(id)
                  setCopied(false)
                }}
              >
                {formatLabel(id)}
              </button>
            )
          })}
        </div>
        {text ? (
          <textarea
            readOnly
            value={text}
            rows={Math.min(12, Math.max(4, text.split('\n').length + 1))}
            className="w-full resize-y rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)]/50 px-2.5 py-2 font-mono text-xs leading-relaxed text-[var(--color-text)] outline-none focus:ring-1 focus:ring-[var(--color-accent)]/40"
            onFocus={(e) => e.currentTarget.select()}
          />
        ) : (
          <p className="rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border)] px-3 py-6 text-center text-xs text-[var(--color-text-muted)]">
            {t('content.shareEmpty')}
          </p>
        )}
      </div>
    </Dialog>
  )
}
