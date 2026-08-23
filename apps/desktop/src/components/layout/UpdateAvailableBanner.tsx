import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery } from '@tanstack/react-query'
import { IconDownload } from '@tabler/icons-react'
import { APP_VERSION } from '@fledge/shared'
import { fledgeApi } from '../../api/fledgeApi'
import { Dialog } from '../ui/Dialog'
import { Button } from '../ui/Button'

/**
 * ヘッダー右: GitHub Releases に新しい版があるときに案内する。
 */
export function UpdateAvailableBanner() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)

  const updateQuery = useQuery({
    queryKey: ['updater', 'check'],
    queryFn: () => fledgeApi.updater.check(),
    staleTime: 1000 * 60 * 30,
    refetchOnWindowFocus: true,
  })

  const applyMutation = useMutation({
    mutationFn: () => fledgeApi.updater.apply(),
    onMutate: () => setApplyError(null),
    onSuccess: () => setOpen(false),
    onError: (err) => {
      const key = err instanceof Error ? err.message : String(err)
      setApplyError(key.startsWith('updater.') ? t(key) : t('updater.applyFailed'))
    },
  })

  const result = updateQuery.data
  if (result?.status !== 'available' || !result.nextVersion) return null

  const currentVersion = result.currentVersion ?? APP_VERSION
  const nextVersion = result.nextVersion

  const openDialog = () => {
    setApplyError(null)
    setOpen(true)
  }
  const closeDialog = () => {
    if (applyMutation.isPending) return
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        className="flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-[var(--color-accent)]/35 bg-[var(--color-accent)]/10 px-2.5 py-1 text-xs font-medium text-[var(--color-accent)] transition hover:bg-[var(--color-accent)]/18"
        aria-label={t('header.updateAvailable')}
        title={t('header.updateAvailableHint')}
        onClick={openDialog}
      >
        <IconDownload size={14} stroke={1.75} className="shrink-0" aria-hidden />
        <span className="truncate">{t('header.updateAvailable')}</span>
      </button>

      <Dialog
        open={open}
        title={t('header.updatePromptTitle')}
        onClose={closeDialog}
        size="sm"
        dismissible={!applyMutation.isPending}
        footer={
          <>
            <Button type="button" disabled={applyMutation.isPending} onClick={closeDialog}>
              {t('header.updateNo')}
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={applyMutation.isPending}
              onClick={() => applyMutation.mutate()}
            >
              {applyMutation.isPending ? t('updater.downloading') : t('header.updateYes')}
            </Button>
          </>
        }
      >
        <div className="space-y-4 py-1 text-center">
          <p className="text-sm font-medium text-[var(--color-text)]">
            {t('header.updatePromptVersion', { from: currentVersion, to: nextVersion })}
          </p>
          <p className="text-sm text-[var(--color-text-muted)]">{t('header.updatePromptConfirm')}</p>
          {applyError ? (
            <p className="text-sm text-[var(--color-danger)]">{applyError}</p>
          ) : null}
        </div>
      </Dialog>
    </>
  )
}
