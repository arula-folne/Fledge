import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { fledgeApi } from '../api/fledgeApi'
import { Button } from './ui/Button'
import { Dialog } from './ui/Dialog'

/** 初回起動時のプライバシー注意（了解するまで閉じられない） */
export function PrivacyNoticeDialog() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => fledgeApi.settings.get(),
  })

  const ackMutation = useMutation({
    mutationFn: () => fledgeApi.settings.set({ privacyNoticeAcknowledged: true }),
    onMutate: () => {
      setError(null)
    },
    onSuccess: (next) => {
      if (next.privacyNoticeAcknowledged !== true) {
        setError(t('privacy.noticeSaveError'))
        return
      }
      queryClient.setQueryData(['settings'], next)
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : String(err))
    },
  })

  const open =
    settingsQuery.isSuccess &&
    settingsQuery.data.installOnboardingCompleted === true &&
    settingsQuery.data.privacyNoticeAcknowledged !== true

  return (
    <Dialog
      open={open}
      title={t('privacy.noticeTitle')}
      onClose={() => undefined}
      dismissible={false}
      size="md"
      overlayClassName="z-[90]"
      footer={
        <Button
          variant="primary"
          type="button"
          disabled={ackMutation.isPending}
          onClick={() => ackMutation.mutate()}
        >
          {ackMutation.isPending ? t('common.loading') : t('privacy.noticeAcknowledge')}
        </Button>
      }
    >
      <div className="space-y-3 text-sm leading-relaxed text-[var(--color-text)]">
        {t('privacy.noticeBody')
          .split('\n\n')
          .map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        {error ? <p className="text-[var(--color-danger)]">{error}</p> : null}
      </div>
    </Dialog>
  )
}
