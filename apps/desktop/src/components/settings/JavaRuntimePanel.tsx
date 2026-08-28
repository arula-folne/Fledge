import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useState, type ReactNode } from 'react'
import {
  IconDownload,
  IconFolderOpen,
  IconRefresh,
  IconShieldCheck,
  IconTrash,
} from '@tabler/icons-react'
import type { JavaManagedMajor, JavaRuntimeView } from '@fledge/shared'
import { JAVA_MANAGED_MAJORS } from '@fledge/shared'
import { fledgeApi } from '../../api/fledgeApi'
import { Button } from '../ui/Button'
import { ProgressBar } from '../ui/ProgressBar'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { useTransferStore } from '../../stores/appStores'
import { jobPercent } from '../../features/transfers/transferJobs'

const iconProps = { size: 20, stroke: 1.75 } as const

function IconAction({
  label,
  hint,
  disabled,
  variant,
  className,
  onClick,
  children,
}: {
  label: string
  hint?: string
  disabled?: boolean
  variant?: 'primary' | 'secondary' | 'danger'
  className?: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button
      variant={variant}
      disabled={disabled}
      aria-label={hint ? `${label}. ${hint}` : label}
      className={[
        '!rounded-[var(--radius-sm)] size-10 p-0',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

export function JavaRuntimePanel({ onMessage }: { onMessage: (msg: string | null) => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [verifyBusy, setVerifyBusy] = useState<Partial<Record<JavaManagedMajor, boolean>>>({})
  const [uninstallBusy, setUninstallBusy] = useState<Partial<Record<JavaManagedMajor, boolean>>>({})
  const [uninstallMajor, setUninstallMajor] = useState<JavaManagedMajor | null>(null)
  const transferJobs = useTransferStore((s) => s.jobs)

  const runtimesQuery = useQuery({
    queryKey: ['java-runtimes'],
    queryFn: () => fledgeApi.java.list(),
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['java-runtimes'] })

  const installMutation = useMutation({
    mutationFn: (major: JavaManagedMajor) => fledgeApi.java.install(major),
    onSuccess: async () => {
      onMessage(null)
      await refresh()
    },
    onError: (err) => {
      onMessage(err instanceof Error ? err.message : t('settings.java.installFailed'))
    },
  })

  const reinstallMutation = useMutation({
    mutationFn: (major: JavaManagedMajor) => fledgeApi.java.reinstall(major),
    onSuccess: async () => {
      onMessage(null)
      await refresh()
    },
    onError: (err) => {
      onMessage(err instanceof Error ? err.message : t('settings.java.installFailed'))
    },
  })

  const uninstallMutation = useMutation({
    mutationFn: (major: JavaManagedMajor) => fledgeApi.java.uninstall(major),
    onMutate: (major) => setUninstallBusy((b) => ({ ...b, [major]: true })),
    onSuccess: async (_view, major) => {
      onMessage(t('settings.java.uninstalled', { major }))
      await refresh()
    },
    onError: (err) => {
      onMessage(err instanceof Error ? err.message : t('settings.java.uninstallFailed'))
    },
    onSettled: (_d, _e, major) =>
      setUninstallBusy((b) => {
        const next = { ...b }
        delete next[major]
        return next
      }),
  })

  const verifyMutation = useMutation({
    mutationFn: (major: JavaManagedMajor) => fledgeApi.java.verify(major),
    onMutate: (major) => setVerifyBusy((b) => ({ ...b, [major]: true })),
    onSuccess: (result) => {
      if (result.ok) {
        onMessage(t('settings.java.verifyOk', { major: result.major }))
      } else {
        const detailKey = `settings.java.verify.detail.${result.detail}`
        const detail = t(detailKey)
        onMessage(
          t('settings.java.verifyFail', {
            detail: detail === detailKey ? result.detail : detail,
          }),
        )
      }
    },
    onError: (err) => {
      onMessage(err instanceof Error ? err.message : t('settings.java.verifyFail', { detail: 'error' }))
    },
    onSettled: (_d, _e, major) =>
      setVerifyBusy((b) => {
        const next = { ...b }
        delete next[major]
        return next
      }),
  })

  const byMajor = new Map<JavaManagedMajor, JavaRuntimeView>()
  for (const runtime of runtimesQuery.data ?? []) {
    byMajor.set(runtime.major, runtime)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-text-muted)]">{t('settings.javaHint')}</p>
      {runtimesQuery.isLoading ? (
        <p className="text-sm text-[var(--color-text-muted)]">{t('common.loading')}</p>
      ) : null}
      {JAVA_MANAGED_MAJORS.map((major) => {
        const runtime = byMajor.get(major)
        const installed = runtime?.installed ?? false
        const removable = installed || Boolean(runtime?.removable)
        const job = Object.values(transferJobs).find(
          (j) =>
            j.kind === 'java' &&
            Number(j.meta.major) === major &&
            (j.status === 'queued' || j.status === 'active'),
        )
        const verifying = Boolean(verifyBusy[major])
        const uninstalling = Boolean(uninstallBusy[major])
        const installing = Boolean(job)
        const busy = installing || verifying || uninstalling
        const percent = job ? jobPercent(job) : 0

        return (
          <div
            key={major}
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)]/40 p-5"
          >
            <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
              <h3 className="text-lg font-semibold text-[var(--color-text)]">
                {t(`settings.java${major}`)}
              </h3>
              <span
                className={[
                  'rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-semibold',
                  installed
                    ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                    : 'bg-[var(--color-hover)] text-[var(--color-text-muted)]',
                ].join(' ')}
              >
                {installed ? t('settings.java.installed') : t('settings.java.notInstalled')}
              </span>
              {busy ? (
                <span className="text-sm text-[var(--color-text-muted)]">{t('settings.java.busy')}</span>
              ) : null}
            </div>
            {installed ? (
              <p className="mb-4 break-all font-mono text-sm text-[var(--color-text-muted)]">
                {runtime?.displayPath}
              </p>
            ) : removable ? (
              <p className="mb-4 text-sm text-[var(--color-text-muted)]">
                {t('settings.java.leftoverHint')}
              </p>
            ) : (
              <p className="mb-4 text-sm text-[var(--color-text-muted)]">
                {t('settings.java.notInstalledHint')}
              </p>
            )}
            {job ? (
              <div className="mb-4 space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-xs text-[var(--color-text-muted)]">
                  <span>{t(job.messageKey ?? 'settings.java.busy', { major: job.meta.major })}</span>
                  <span className="tabular-nums">{Math.round(percent)}%</span>
                </div>
                <ProgressBar percent={percent} />
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <IconAction
                label={t('settings.java.install')}
                hint={
                  installed
                    ? t('settings.java.installDisabledHint')
                    : t('settings.java.installHint')
                }
                variant="primary"
                disabled={installed || installing || uninstalling}
                onClick={() => installMutation.mutate(major)}
              >
                <IconDownload {...iconProps} />
              </IconAction>
              <IconAction
                label={t('settings.java.openFolder')}
                hint={
                  installed || removable
                    ? t('settings.java.openFolderHint')
                    : t('settings.java.openFolderDisabledHint')
                }
                disabled={uninstalling || !(installed || removable)}
                onClick={() => void fledgeApi.java.openFolder(major)}
              >
                <IconFolderOpen {...iconProps} />
              </IconAction>
              <IconAction
                label={t('settings.java.verify')}
                hint={
                  installed
                    ? t('settings.java.verifyHint')
                    : t('settings.java.verifyDisabledHint')
                }
                disabled={!installed || installing || verifying || uninstalling}
                className="!border-transparent !bg-[#f08a24] !text-white hover:!brightness-105"
                onClick={() => verifyMutation.mutate(major)}
              >
                <IconShieldCheck {...iconProps} />
              </IconAction>
              <IconAction
                label={t('settings.java.reinstall')}
                hint={
                  installed
                    ? t('settings.java.reinstallHint')
                    : t('settings.java.reinstallDisabledHint')
                }
                disabled={!installed || installing || uninstalling}
                onClick={() => reinstallMutation.mutate(major)}
              >
                <IconRefresh {...iconProps} />
              </IconAction>
              <IconAction
                label={t('settings.java.uninstall')}
                hint={
                  removable
                    ? t('settings.java.uninstallHint')
                    : t('settings.java.uninstallDisabledHint')
                }
                variant="danger"
                disabled={installing || uninstalling || !removable}
                onClick={() => setUninstallMajor(major)}
              >
                <IconTrash {...iconProps} />
              </IconAction>
            </div>
          </div>
        )
      })}
      <ConfirmDialog
        open={uninstallMajor != null}
        title={t('settings.java.uninstall')}
        body={t('settings.java.uninstallConfirm', { major: uninstallMajor ?? '' })}
        confirmLabel={t('settings.java.uninstall')}
        pending={uninstallMajor != null && Boolean(uninstallBusy[uninstallMajor])}
        onCancel={() => setUninstallMajor(null)}
        onConfirm={() => {
          if (uninstallMajor == null) return
          uninstallMutation.mutate(uninstallMajor, {
            onSettled: () => setUninstallMajor(null),
          })
        }}
      />
    </div>
  )
}
