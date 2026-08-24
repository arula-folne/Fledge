import { useTranslation } from 'react-i18next'
import { useUiStore } from '../../stores/appStores'
import { Dialog } from '../../components/ui/Dialog'
import { Button } from '../../components/ui/Button'

/** ログイン失敗の原因をユーザーに伝えるダイアログ（AppShell 直下に常駐） */
export function LoginErrorDialog() {
  const { t } = useTranslation()
  const authErrorKey = useUiStore((s) => s.authErrorKey)
  const setAuthErrorKey = useUiStore((s) => s.setAuthErrorKey)

  const close = () => setAuthErrorKey(null)

  return (
    <Dialog
      open={authErrorKey !== null}
      title={t('auth.error.dialogTitle')}
      onClose={close}
      size="sm"
      footer={
        <Button type="button" variant="primary" onClick={close}>
          {t('common.close')}
        </Button>
      }
    >
      <p className="py-1 text-sm text-[var(--color-text)]">
        {t(authErrorKey ?? 'auth.error.failed')}
      </p>
    </Dialog>
  )
}
