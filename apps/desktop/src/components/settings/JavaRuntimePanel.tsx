import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useState, type ReactNode } from 'react'
import {
  IconDownload,
  IconFolderOpen,
  IconRefresh,
  IconShieldCheck,
} from '@tabler/icons-react'
import type { JavaManagedMajor, JavaRuntimeView } from '@fledge/shared'
import { JAVA_MANAGED_MAJORS } from '@fledge/shared'
import { fledgeApi } from '../../api/fledgeApi'
import { Button } from '../ui/Button'

const iconProps = { size: 18, stroke: 1.75 } as const

type BusyMap = Partial<Record<JavaManagedMajor, 'install' | 'reinstall' | 'verify'>>

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
  hint: string
  disabled?: boolean
  variant?: 'primary' | 'secondary'
  className?: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <div className="group relative">
      <Button
        variant={variant}
        disabled={disabled}
        aria-label={`${label}. ${hint}`}
        className={['px-2.5 py-2', className].filter(Boolean).join(' ')}
        onClick={onClick}
      >
        {children}
      </Button>
      <div
        role="tooltip"
        className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-20 w-max max-w-[14rem] -translate-x-1/2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        <div className="text-xs font-semibold text-[var(--color-text)]">{label}</div>
        <div className="mt-0.5 text-[11px] leading-snug text-[var(--color-text-muted)]">{hint}</div>
      </div>
    </div>
  )
}

export function JavaRuntimePanel({ onMessage }: { onMessage: (msg: string | null) => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState<BusyMap>({})

  const runtimesQuery = useQuery({
    queryKey: ['java-runtimes'],
    queryFn: () => fledgeApi.java.list(),
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['java-runtimes'] })

  const installMutation = useMutation({
    mutationFn: (major: JavaManagedMajor) => fledgeApi.java.install(major),
    onMutate: (major) => setBusy((b) => ({ ...b, [major]: 'install' })),
    onSuccess: async () => {
      onMessage(null)
      await refresh()
    },
    onError: (err) => {
      onMessage(err instanceof Error ? err.message : t('settings.java.installFailed'))
    },
    onSettled: (_d, _e, major) =>
      setBusy((b) => {
        const next = { ...b }
        delete next[major]
        return next
      }),
  })

  const reinstallMutation = useMutation({
    mutationFn: (major: JavaManagedMajor) => fledgeApi.java.reinstall(major),
    onMutate: (major) => setBusy((b) => ({ ...b, [major]: 'reinstall' })),
    onSuccess: async () => {
      onMessage(null)
      await refresh()
    },
    onError: (err) => {
      onMessage(err instanceof Error ? err.message : t('settings.java.installFailed'))
    },
    onSettled: (_d, _e, major) =>
      setBusy((b) => {
        const next = { ...b }
        delete next[major]
        return next
      }),
  })

  const verifyMutation = useMutation({
    mutationFn: (major: JavaManagedMajor) => fledgeApi.java.verify(major),
    onMutate: (major) => setBusy((b) => ({ ...b, [major]: 'verify' })),
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
      setBusy((b) => {
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
        const action = busy[major]
        const disabled = Boolean(action) || installMutation.isPending || reinstallMutation.isPending

        return (
          <div
            key={major}
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)]/40 p-4"
          >
            <div className="mb-2 flex flex-wrap items-baseline gap-2">
              <h3 className="text-base font-semibold text-[var(--color-text)]">
                {t(`settings.java${major}`)}
              </h3>
              <span
                className={[
                  'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                  installed
                    ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                    : 'bg-[var(--color-hover)] text-[var(--color-text-muted)]',
                ].join(' ')}
              >
                {installed ? t('settings.java.installed') : t('settings.java.notInstalled')}
              </span>
              {action ? (
                <span className="text-xs text-[var(--color-text-muted)]">{t('settings.java.busy')}</span>
              ) : null}
            </div>
            <p className="mb-3 break-all font-mono text-xs text-[var(--color-text-muted)]">
              {runtime?.displayPath ?? `…/java-version/java${major}/bin`}
            </p>
            <div className="flex flex-wrap gap-2">
              <IconAction
                label={t('settings.java.install')}
                hint={t('settings.java.installHint')}
                variant="primary"
                disabled={disabled || installed}
                onClick={() => installMutation.mutate(major)}
              >
                <IconDownload {...iconProps} />
              </IconAction>
              <IconAction
                label={t('settings.java.openFolder')}
                hint={t('settings.java.openFolderHint')}
                disabled={disabled}
                onClick={() => void fledgeApi.java.openFolder(major)}
              >
                <IconFolderOpen {...iconProps} />
              </IconAction>
              <IconAction
                label={t('settings.java.verify')}
                hint={t('settings.java.verifyHint')}
                disabled={disabled || !installed}
                className="!border-transparent !bg-[#f08a24] !text-white hover:!brightness-105"
                onClick={() => verifyMutation.mutate(major)}
              >
                <IconShieldCheck {...iconProps} />
              </IconAction>
              <IconAction
                label={t('settings.java.reinstall')}
                hint={t('settings.java.reinstallHint')}
                disabled={disabled}
                onClick={() => reinstallMutation.mutate(major)}
              >
                <IconRefresh {...iconProps} />
              </IconAction>
            </div>
          </div>
        )
      })}
    </div>
  )
}
