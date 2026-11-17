import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import { CUSTOM_THEME_HISTORY_MAX, type CustomThemeHistoryEntry, type Settings } from '@fledge/shared'
import { useTranslation } from 'react-i18next'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { fledgeApi } from '../../api/fledgeApi'
import { localFileAssetUrl } from '../skin/skinUrls'
import { applyTheme } from '../../styles/theme'
import {
  ThemePreviewDialog,
  ThemePreviewZoomButton,
  type ThemePreviewContent,
} from './ThemePreview'

type Props = {
  value: string | null
  history: CustomThemeHistoryEntry[]
  onSelect: (id: string) => void
  onSettings: (next: Settings) => void
}

const SKEW = 12

function CustomThumb({
  id,
  selected,
  index,
  onSelect,
  onRemove,
  onPreview,
}: {
  id: string
  selected: boolean
  index: number
  onSelect: () => void
  onRemove: () => void
  onPreview: (preview: ThemePreviewContent) => void
}) {
  const { t } = useTranslation()
  const label = t('settings.customTheme.item', { n: index + 1 })
  const { data: src } = useQuery({
    queryKey: ['theme', 'custom-image', id],
    queryFn: async () => {
      const path = await fledgeApi.theme.resolveCustomImage(id)
      return localFileAssetUrl(path) ?? null
    },
    staleTime: 60_000,
  })

  return (
    <div
      className="relative h-[108px] min-w-0"
      style={{ flex: '1 1 0', maxWidth: 'calc((100% - 2.5rem) / 5)' }}
    >
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        aria-label={label}
        onClick={onSelect}
        className="absolute inset-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-selection)]"
      >
        <div
          className={[
            'pointer-events-none absolute inset-y-0 inset-x-[4%] flex overflow-hidden rounded-[18px]',
            'transition-[box-shadow,filter]',
            selected
              ? 'z-[1] shadow-[0_0_0_3px_var(--color-selection)]'
              : 'shadow-[inset_0_0_0_1px_rgba(0,0,0,0.2)]',
          ].join(' ')}
          style={
            {
              transform: `skewX(-${SKEW}deg)`,
              background: src ? undefined : 'var(--color-surface)',
              backfaceVisibility: 'hidden',
            } satisfies CSSProperties
          }
        >
          {src ? (
            <img
              src={src}
              alt=""
              className="absolute left-1/2 top-1/2 max-w-none"
              style={{
                height: '185%',
                width: 'auto',
                transform: `translate(-50%, -50%) skewX(${SKEW}deg)`,
              }}
              draggable={false}
            />
          ) : null}
        </div>
      </button>
      {src ? (
        <ThemePreviewZoomButton
          className="!bottom-3 !right-5"
          onOpen={() => onPreview({ kind: 'image', label, src })}
        />
      ) : null}
      <button
        type="button"
        className="absolute right-1 top-1 z-[2] grid size-7 place-items-center rounded-full bg-black/55 text-white opacity-80 transition-opacity hover:opacity-100"
        aria-label={t('settings.customTheme.remove')}
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
      >
        <IconTrash size={14} stroke={1.75} />
      </button>
    </div>
  )
}

export function ThemeCustomPicker({ value, history, onSelect, onSettings }: Props) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [pending, setPending] = useState<string | null>(null)
  const [preview, setPreview] = useState<ThemePreviewContent | null>(null)
  const current = pending ?? value
  const canAdd = history.length < CUSTOM_THEME_HISTORY_MAX

  useEffect(() => {
    if (value === null || (pending !== null && value === pending)) {
      setPending(null)
    }
  }, [value, pending])

  const [error, setError] = useState<string | null>(null)

  const importMutation = useMutation({
    mutationFn: () => fledgeApi.theme.importCustomImage(),
    onMutate: () => setError(null),
    onSuccess: (next) => {
      if (!next) return
      applyTheme(next)
      queryClient.setQueryData(['settings'], next)
      onSettings(next)
      setPending(next.customThemeImageId)
      void queryClient.invalidateQueries({ queryKey: ['theme', 'custom-image'] })
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : String(err))
    },
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => fledgeApi.theme.removeCustomImage(id),
    onMutate: () => setError(null),
    onSuccess: (next) => {
      applyTheme(next)
      queryClient.setQueryData(['settings'], next)
      onSettings(next)
      setPending(next.customThemeImageId)
      void queryClient.invalidateQueries({ queryKey: ['theme', 'custom-image'] })
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : String(err))
    },
  })

  const slots = useMemo(() => history.slice(0, CUSTOM_THEME_HISTORY_MAX), [history])

  return (
    <>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-[var(--color-text-muted)]">{t('settings.customThemeHint')}</p>
        <div
          className="w-full overflow-x-clip px-2"
          role="radiogroup"
          aria-label={t('settings.block.customTheme')}
        >
          <div className="flex w-full gap-2.5">
            {slots.map((entry, index) => (
              <CustomThumb
                key={entry.id}
                id={entry.id}
                index={index}
                selected={current === entry.id}
                onSelect={() => {
                  setPending(entry.id)
                  onSelect(entry.id)
                }}
                onRemove={() => removeMutation.mutate(entry.id)}
                onPreview={setPreview}
              />
            ))}
            {canAdd ? (
              <div
                className="relative h-[108px] min-w-0"
                style={{ flex: '1 1 0', maxWidth: 'calc((100% - 2.5rem) / 5)' }}
              >
                <button
                  type="button"
                  aria-label={t('settings.customTheme.add')}
                  disabled={importMutation.isPending}
                  onClick={() => importMutation.mutate()}
                  className="absolute inset-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-selection)]"
                >
                  <div
                    className="pointer-events-none absolute inset-y-0 inset-x-[4%] flex items-center justify-center overflow-hidden rounded-[18px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/60 text-[var(--color-text-muted)]"
                    style={{ transform: `skewX(-${SKEW}deg)` }}
                  >
                    <span
                      className="flex flex-col items-center gap-1"
                      style={{ transform: `skewX(${SKEW}deg)` }}
                    >
                      <IconPlus size={22} stroke={1.75} />
                      <span className="text-[11px] font-semibold">{t('settings.customTheme.add')}</span>
                    </span>
                  </div>
                </button>
              </div>
            ) : null}
          </div>
        </div>
        {slots.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">{t('settings.customThemeEmpty')}</p>
        ) : null}
        {!canAdd ? (
          <p className="text-sm text-[var(--color-text-muted)]">{t('settings.customTheme.full')}</p>
        ) : null}
        {error ? <p className="text-sm text-[var(--color-danger)]">{error}</p> : null}
      </div>
      <ThemePreviewDialog open={preview !== null} preview={preview} onClose={() => setPreview(null)} />
    </>
  )
}
