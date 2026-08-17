import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BackupEntry, Settings } from '@fledge/shared'
import { fledgeApi } from '../../api/fledgeApi'
import { applyTheme } from '../../styles/theme'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Switch } from '../ui/Switch'

type Props = {
  settings: Settings
  onSave: (partial: Partial<Settings>) => void
  onMessage: (message: string | null) => void
}

function formatBackupTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('ja-JP')
}

export function BackupPanel({ settings, onSave, onMessage }: Props) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [restoreTarget, setRestoreTarget] = useState<BackupEntry | null>(null)
  const folderReady = Boolean(settings.backupFolder)

  const listQuery = useQuery({
    queryKey: ['backups'],
    queryFn: () => fledgeApi.backup.list(),
    enabled: restoreOpen && folderReady,
  })

  const snapshotMutation = useMutation({
    mutationFn: () => fledgeApi.backup.run(),
    onSuccess: async (dest) => {
      onMessage(`${t('settings.backupDone')}: ${dest}`)
      await queryClient.invalidateQueries({ queryKey: ['backups'] })
    },
    onError: (err) => {
      onMessage(err instanceof Error ? err.message : String(err))
    },
  })

  const restoreMutation = useMutation({
    mutationFn: (backupPath: string) => fledgeApi.backup.restore(backupPath),
    onSuccess: async () => {
      setRestoreOpen(false)
      const next = await fledgeApi.settings.get()
      queryClient.setQueryData(['settings'], next)
      applyTheme(next)
      await queryClient.invalidateQueries()
      onMessage(t('settings.backupRestored'))
    },
    onError: (err) => {
      onMessage(err instanceof Error ? err.message : String(err))
    },
  })

  const busy = snapshotMutation.isPending || restoreMutation.isPending

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium text-[var(--color-text)]">{t('settings.backupTitle')}</h3>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">{t('settings.backupHint')}</p>
      </div>
      <p className="break-all text-xs text-[var(--color-text-muted)]">
        {settings.backupFolder ?? t('settings.backupFolderUnset')}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={busy}
          onClick={async () => {
            const folder = await fledgeApi.paths.selectFolder()
            if (folder) onSave({ backupFolder: folder })
          }}
        >
          {t('settings.selectBackupFolder')}
        </Button>
        <Button
          variant="primary"
          disabled={!folderReady || busy}
          onClick={() => snapshotMutation.mutate()}
        >
          {snapshotMutation.isPending ? t('common.loading') : t('settings.runBackup')}
        </Button>
        <Button disabled={!folderReady || busy} onClick={() => setRestoreOpen(true)}>
          {t('settings.restoreBackup')}
        </Button>
      </div>
      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="min-w-0">
          <span className="font-medium text-[var(--color-text)]">{t('settings.backupSync')}</span>
          <span className="mt-1 block text-xs text-[var(--color-text-muted)]">
            {t('settings.backupSyncHint')}
          </span>
        </span>
        <Switch
          checked={settings.backupSyncEnabled}
          disabled={!folderReady}
          onChange={(backupSyncEnabled) => onSave({ backupSyncEnabled })}
          aria-label={t('settings.backupSync')}
        />
      </div>

      <Dialog
        open={restoreOpen}
        title={t('settings.restoreBackup')}
        onClose={() => {
          if (!restoreMutation.isPending) setRestoreOpen(false)
        }}
        size="md"
      >
        <p className="mb-3 text-xs text-[var(--color-text-muted)]">{t('settings.restoreHint')}</p>
        {listQuery.isLoading ? (
          <p className="text-sm text-[var(--color-text-muted)]">{t('common.loading')}</p>
        ) : (listQuery.data ?? []).length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">{t('settings.backupEmpty')}</p>
        ) : (
          <ul className="max-h-72 space-y-2 overflow-y-auto">
            {(listQuery.data ?? []).map((entry: BackupEntry) => (
              <li
                key={entry.path}
                className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--color-text)]">
                    {entry.kind === 'sync' ? t('settings.backupKindSync') : t('settings.backupKindSnapshot')}
                  </p>
                  <p className="truncate text-xs text-[var(--color-text-muted)]">
                    {formatBackupTime(entry.createdAt)}
                  </p>
                </div>
                <Button
                  variant="primary"
                  disabled={restoreMutation.isPending}
                  onClick={() => setRestoreTarget(entry)}
                >
                  {t('settings.restoreApply')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Dialog>
      <ConfirmDialog
        open={restoreTarget != null}
        title={t('settings.restoreApply')}
        body={t('settings.restoreConfirm')}
        confirmLabel={t('settings.restoreApply')}
        danger={false}
        pending={restoreMutation.isPending}
        onCancel={() => setRestoreTarget(null)}
        onConfirm={() => {
          if (!restoreTarget) return
          restoreMutation.mutate(restoreTarget.path, {
            onSettled: () => setRestoreTarget(null),
          })
        }}
      />
    </div>
  )
}
