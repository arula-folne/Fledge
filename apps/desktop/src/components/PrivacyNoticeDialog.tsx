import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { fledgeApi } from '../api/fledgeApi'
import { Button } from './ui/Button'
import { Dialog } from './ui/Dialog'

/** 初回起動時のプライバシー注意（了解するまで閉じられない） */
export function PrivacyNoticeDialog() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => fledgeApi.settings.get(),
  })

  const ackMutation = useMutation({
    mutationFn: () => fledgeApi.settings.set({ privacyNoticeAcknowledged: true }),
    onSuccess: (next) => {
      queryClient.setQueryData(['settings'], next)
    },
  })

  const acknowledged = settingsQuery.data?.privacyNoticeAcknowledged === true
  // 設定取得中もブロックして、了解前に背面 UI を使わせない
  const open = !acknowledged && (settingsQuery.isLoading || settingsQuery.isSuccess || settingsQuery.isError)

  return (
    <Dialog
      open={open}
      title={t('privacy.noticeTitle')}
      onClose={() => undefined}
      dismissible={false}
      size="lg"
      scrollable
      footer={
        <Button
          variant="primary"
          disabled={!settingsQuery.isSuccess || ackMutation.isPending}
          onClick={() => ackMutation.mutate()}
        >
          {t('privacy.noticeAcknowledge')}
        </Button>
      }
    >
      <div className="space-y-3 whitespace-pre-line text-sm leading-relaxed text-[var(--color-text)]">
        {settingsQuery.isLoading ? t('common.loading') : t('privacy.noticeBody')}
        {settingsQuery.isError ? (
          <p className="text-[var(--color-danger)]">{t('privacy.noticeLoadError')}</p>
        ) : null}
      </div>
    </Dialog>
  )
}
