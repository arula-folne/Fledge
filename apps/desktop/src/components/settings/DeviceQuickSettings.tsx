import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconCpu, IconInfoCircle } from '@tabler/icons-react'
import type { Settings } from '@fledge/shared'
import { recommendSettingsForDevice, WINDOW_SIZE_PRESETS } from '@fledge/shared'
import { fledgeApi } from '../../api/fledgeApi'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'

type Props = {
  settings: Settings
  onApply: (partial: Partial<Settings>, options?: { restartRequired?: boolean }) => void
}

function formatMem(mb: number): string {
  if (mb < 1024) return `${mb} MB`
  const gb = mb / 1024
  return Number.isInteger(gb) ? `${gb} GB` : `${gb.toFixed(1)} GB`
}

function windowPresetLabel(width: number, height: number): string {
  return WINDOW_SIZE_PRESETS.find((p) => p.width === width && p.height === height)?.id ?? `${width}×${height}`
}

export function DeviceQuickSettings({ settings, onApply }: Props) {
  const { t } = useTranslation()
  const [infoOpen, setInfoOpen] = useState(false)
  const specsQuery = useQuery({
    queryKey: ['device-specs'],
    queryFn: () => fledgeApi.app.deviceSpecs(),
    staleTime: 60_000,
  })

  const recommended = specsQuery.data ? recommendSettingsForDevice(specsQuery.data) : null

  const applyMutation = useMutation({
    mutationFn: async () => {
      const specs = specsQuery.data ?? (await fledgeApi.app.deviceSpecs())
      return recommendSettingsForDevice(specs)
    },
    onSuccess: (next) => {
      const restartRequired = next.hardwareAcceleration !== settings.hardwareAcceleration
      onApply(next, { restartRequired })
    },
  })

  const specs = specsQuery.data

  return (
    <>
      <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1">
            <h2 className="text-sm font-medium text-[var(--color-text)]">{t('settings.quick.title')}</h2>
            <button
              type="button"
              className="flex size-7 shrink-0 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]"
              aria-label={t('settings.quick.infoAria')}
              onClick={() => setInfoOpen(true)}
            >
              <IconInfoCircle size={16} stroke={1.7} />
            </button>
          </div>
          <Button
            type="button"
            variant="primary"
            className="shrink-0 px-2.5 py-1 text-xs"
            disabled={!recommended || applyMutation.isPending}
            onClick={() => applyMutation.mutate()}
          >
            {applyMutation.isPending ? t('settings.quick.applying') : t('settings.quick.apply')}
          </Button>
        </div>
      </section>

      <Dialog
        open={infoOpen}
        title={t('settings.quick.title')}
        size="sm"
        onClose={() => setInfoOpen(false)}
        footer={
          <Button type="button" variant="primary" onClick={() => setInfoOpen(false)}>
            {t('common.close')}
          </Button>
        }
      >
        <div className="space-y-4 text-sm">
          <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">{t('settings.quick.hint')}</p>

          {specsQuery.isError ? (
            <p className="text-xs text-[var(--color-danger)]">{t('settings.quick.error')}</p>
          ) : null}

          {specsQuery.isPending && !specs ? (
            <p className="text-xs text-[var(--color-text-muted)]">{t('common.loading')}</p>
          ) : null}

          {specs ? (
            <div className="space-y-1.5">
              <h3 className="text-xs font-semibold text-[var(--color-text)]">{t('settings.quick.detectedTitle')}</h3>
              <p className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                <IconCpu size={14} stroke={1.7} aria-hidden />
                {t('settings.quick.detected', {
                  memory: formatMem(specs.totalMemMb),
                  cpu: specs.cpuCount,
                  width: specs.workAreaWidth,
                  height: specs.workAreaHeight,
                })}
              </p>
            </div>
          ) : null}

          {recommended ? (
            <div className="space-y-1.5">
              <h3 className="text-xs font-semibold text-[var(--color-text)]">{t('settings.quick.resultTitle')}</h3>
              <ul className="space-y-1 text-xs text-[var(--color-text)]">
                <li>{t('settings.quick.item.memory', { value: formatMem(recommended.defaultMemoryMaxMb) })}</li>
                <li>
                  {t('settings.quick.item.downloads', {
                    downloads: recommended.concurrentDownloads,
                    writes: recommended.maxWriteConcurrency,
                  })}
                </li>
                <li>
                  {t('settings.quick.item.fledgeWindow', {
                    preset: windowPresetLabel(recommended.launcherWindowWidth, recommended.launcherWindowHeight),
                    width: recommended.launcherWindowWidth,
                    height: recommended.launcherWindowHeight,
                  })}
                </li>
                <li>
                  {t('settings.quick.item.gameWindow', {
                    preset: windowPresetLabel(recommended.gameWindowWidth, recommended.gameWindowHeight),
                    width: recommended.gameWindowWidth,
                    height: recommended.gameWindowHeight,
                  })}
                </li>
                <li>{t('settings.quick.item.uiScale', { scale: t(`settings.uiScale.${recommended.uiScale}`) })}</li>
              </ul>
            </div>
          ) : null}
        </div>
      </Dialog>
    </>
  )
}
