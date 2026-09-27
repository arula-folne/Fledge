import { useTranslation } from 'react-i18next'
import { Button } from './Button'
import { Dialog } from './Dialog'

type Props = {
  open: boolean
  title: string
  body: string
  confirmLabel: string
  cancelLabel?: string
  /** @deprecated confirmVariant を優先 */
  danger?: boolean
  confirmVariant?: 'primary' | 'danger' | 'warning'
  pending?: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  danger = true,
  confirmVariant,
  pending = false,
  onCancel,
  onConfirm,
}: Props) {
  const { t } = useTranslation()
  const variant = confirmVariant ?? (danger ? 'danger' : 'primary')
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onCancel}
      overlayClassName="z-[90]"
      footer={
        <>
          <Button type="button" disabled={pending} onClick={onCancel}>
            {cancelLabel ?? t('common.cancel')}
          </Button>
          <Button type="button" variant={variant} disabled={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--color-text)]">{body}</p>
    </Dialog>
  )
}
