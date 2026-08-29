import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { APP_VERSION } from '@fledge/shared'
import { fledgeApi } from '../api/fledgeApi'
import { Button } from './ui/Button'
import { Dialog } from './ui/Dialog'
import { MarkdownBody } from '../features/content/MarkdownBody'

/** 更新適用後の初回起動で、バージョンと変更点を案内する */
export function UpdateCompleteDialog() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  const startupQuery = useQuery({
    queryKey: ['app-startup-info'],
    queryFn: () => fledgeApi.app.getStartupInfo(),
    staleTime: Infinity,
  })

  const notice = startupQuery.data?.updateNotice
  const open = startupQuery.isSuccess && !dismissed && notice != null

  const ackMutation = useMutation({
    mutationFn: () =>
      fledgeApi.settings.set({
        updateAckPending: null,
        lastAppVersion: APP_VERSION,
      }),
    onMutate: () => setError(null),
    onSuccess: (next) => {
      queryClient.setQueryData(['settings'], next)
      setDismissed(true)
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : String(err))
    },
  })

  if (!open || !notice) return null

  const notes = notice.releaseNotes?.trim()

  return (
    <Dialog
      open
      title={t('update.completeTitle')}
      onClose={() => undefined}
      dismissible={false}
      size="md"
      scrollable
      overlayClassName="z-[96]"
      footer={
        <Button
          variant="primary"
          type="button"
          disabled={ackMutation.isPending}
          onClick={() => ackMutation.mutate()}
        >
          {ackMutation.isPending ? t('common.loading') : t('update.completeAcknowledge')}
        </Button>
      }
    >
      <div className="space-y-3 text-sm leading-relaxed text-[var(--color-text)]">
        <p className="text-center text-sm font-medium">
          {t('update.completeVersion', { from: notice.fromVersion, to: notice.toVersion })}
        </p>
        <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
          <p className="mb-1.5 text-xs font-semibold tracking-wide text-[var(--color-text-muted)]">
            {t('update.completeChanges')}
          </p>
          {notes ? (
            <div className="max-h-56 overflow-auto">
              <MarkdownBody text={notes} className="changelog-plain leading-relaxed" />
            </div>
          ) : (
            <p className="text-[12px] text-[var(--color-text-muted)]">{t('update.completeChangesEmpty')}</p>
          )}
        </div>
        {error ? <p className="text-sm text-[var(--color-danger)]">{error}</p> : null}
      </div>
    </Dialog>
  )
}
