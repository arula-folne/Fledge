import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fledgeApi } from '../../api/fledgeApi'
import i18n from '../../i18n'
import { applyTheme } from '../../styles/theme'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'

type Props = {
  onMessage: (message: string | null) => void
}

/** アプリ設定の option.flg インポート／エクスポート */
export function OptionsPanel({ onMessage }: Props) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [importConfirmOpen, setImportConfirmOpen] = useState(false)

  const exportOptionsMutation = useMutation({
    mutationFn: () => fledgeApi.settings.exportOptions(),
    onSuccess: (path) => {
      if (!path) return
      onMessage(`${t('settings.optionsExportDone')}: ${path}`)
    },
    onError: (err) => {
      onMessage(err instanceof Error ? err.message : String(err))
    },
  })

  const importOptionsMutation = useMutation({
    mutationFn: () => fledgeApi.settings.importOptions(),
    onSuccess: async (next) => {
      if (!next) return
      queryClient.setQueryData(['settings'], next)
      applyTheme(next)
      if (next.locale && i18n.language !== next.locale) {
        await i18n.changeLanguage(next.locale)
      }
      await queryClient.invalidateQueries()
      onMessage(t('settings.optionsImportDone'))
    },
    onError: (err) => {
      onMessage(err instanceof Error ? err.message : String(err))
    },
  })

  const busy = exportOptionsMutation.isPending || importOptionsMutation.isPending

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium text-[var(--color-text)]">{t('settings.optionsTitle')}</h3>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">{t('settings.optionsHint')}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          disabled={busy}
          onClick={() => exportOptionsMutation.mutate()}
        >
          {exportOptionsMutation.isPending ? t('common.loading') : t('settings.optionsExport')}
        </Button>
        <Button disabled={busy} onClick={() => setImportConfirmOpen(true)}>
          {t('settings.optionsImport')}
        </Button>
      </div>
      <ConfirmDialog
        open={importConfirmOpen}
        title={t('settings.optionsImport')}
        body={t('settings.optionsImportConfirm')}
        confirmLabel={t('settings.optionsImport')}
        danger={false}
        pending={importOptionsMutation.isPending}
        onCancel={() => setImportConfirmOpen(false)}
        onConfirm={() => {
          setImportConfirmOpen(false)
          importOptionsMutation.mutate()
        }}
      />
    </div>
  )
}
