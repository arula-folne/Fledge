import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery } from '@tanstack/react-query'
import { IconDownload, IconFlask } from '@tabler/icons-react'
import { APP_VERSION, type UpdateChannel, type UpdateCheckResult } from '@fledge/shared'
import { fledgeApi } from '../../api/fledgeApi'
import { Dialog } from '../ui/Dialog'
import { Button } from '../ui/Button'

type PromptState = {
  channel: UpdateChannel
  result: UpdateCheckResult
}

/**
 * ヘッダー右: GitHub Releases に新しい版があるときに案内する。
 * - 右: /releases/latest（安定版）
 * - 左: プレリリース含む最新
 */
export function UpdateAvailableBanner() {
  const { t } = useTranslation()
  const [prompt, setPrompt] = useState<PromptState | null>(null)
  const [applyError, setApplyError] = useState<string | null>(null)

  const stableQuery = useQuery({
    queryKey: ['updater', 'check', 'stable'],
    queryFn: () => fledgeApi.updater.check('stable'),
    staleTime: 1000 * 60 * 30,
    refetchOnWindowFocus: true,
  })

  const prereleaseQuery = useQuery({
    queryKey: ['updater', 'check', 'prerelease'],
    queryFn: () => fledgeApi.updater.check('prerelease'),
    staleTime: 1000 * 60 * 30,
    refetchOnWindowFocus: true,
  })

  const applyMutation = useMutation({
    mutationFn: (channel: UpdateChannel) => fledgeApi.updater.apply(channel),
    onMutate: () => setApplyError(null),
    onSuccess: () => setPrompt(null),
    onError: (err) => {
      const key = err instanceof Error ? err.message : String(err)
      setApplyError(key.startsWith('updater.') ? t(key) : t('updater.applyFailed'))
    },
  })

  const stable = stableQuery.data
  const prerelease = prereleaseQuery.data

  const showStable = stable?.status === 'available' && Boolean(stable.nextVersion)
  const showPrerelease =
    prerelease?.status === 'available' &&
    Boolean(prerelease.nextVersion) &&
    // 安定版と同じ対象ならプレリリース枠は出さない
    !(showStable && prerelease.nextVersion === stable?.nextVersion && !prerelease.prerelease)

  if (!showStable && !showPrerelease) return null

  const openDialog = (channel: UpdateChannel, result: UpdateCheckResult) => {
    setApplyError(null)
    setPrompt({ channel, result })
  }
  const closeDialog = () => {
    if (applyMutation.isPending) return
    setPrompt(null)
  }

  const currentVersion = APP_VERSION
  const nextVersion = prompt?.result.nextVersion ?? ''
  const notes = prompt?.result.releaseNotes?.trim() || null
  const isPreChannel = prompt?.channel === 'prerelease'

  return (
    <>
      <div className="flex min-w-0 shrink-0 items-center gap-1">
        {showPrerelease && prerelease?.nextVersion ? (
          <button
            type="button"
            className="flex min-w-0 items-center gap-1 rounded-full border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/8 px-1.5 py-0.5 text-[10px] font-medium leading-none text-[var(--color-accent)] transition hover:bg-[var(--color-accent)]/16"
            aria-label={t('header.updatePrereleaseAvailable')}
            title={t('header.updatePrereleaseAvailableHint', { version: prerelease.nextVersion })}
            onClick={() => openDialog('prerelease', prerelease)}
          >
            <IconFlask size={12} stroke={1.75} className="shrink-0" aria-hidden />
            <span className="truncate">{t('header.updatePrereleaseShort')}</span>
          </button>
        ) : null}

        {showStable && stable?.nextVersion ? (
          <button
            type="button"
            className="flex min-w-0 items-center gap-1 rounded-full border border-[var(--color-accent)]/35 bg-[var(--color-accent)]/10 px-1.5 py-0.5 text-[10px] font-medium leading-none text-[var(--color-accent)] transition hover:bg-[var(--color-accent)]/18"
            aria-label={t('header.updateAvailable')}
            title={t('header.updateAvailableHint', { version: stable.nextVersion })}
            onClick={() => openDialog('stable', stable)}
          >
            <IconDownload size={12} stroke={1.75} className="shrink-0" aria-hidden />
            <span className="truncate">{t('header.updateAvailableShort')}</span>
          </button>
        ) : null}
      </div>

      <Dialog
        open={Boolean(prompt)}
        title={
          isPreChannel ? t('header.updatePrereleasePromptTitle') : t('header.updatePromptTitle')
        }
        onClose={closeDialog}
        size="md"
        dismissible={!applyMutation.isPending}
        footer={
          <>
            <Button type="button" disabled={applyMutation.isPending} onClick={closeDialog}>
              {t('header.updateNo')}
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={applyMutation.isPending || !prompt}
              onClick={() => prompt && applyMutation.mutate(prompt.channel)}
            >
              {applyMutation.isPending ? t('updater.downloading') : t('header.updateYes')}
            </Button>
          </>
        }
      >
        <div className="space-y-3 py-1 text-left">
          <p className="text-center text-sm font-medium text-[var(--color-text)]">
            {t('header.updatePromptVersion', { from: currentVersion, to: nextVersion })}
          </p>
          {isPreChannel ? (
            <p className="text-center text-xs text-[var(--color-text-muted)]">
              {t('header.updatePrereleasePromptHint')}
            </p>
          ) : null}
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5">
            <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-[var(--color-text-muted)]">
              {t('header.updateChangelog')}
            </p>
            {notes ? (
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-[var(--color-text)]">
                {notes}
              </pre>
            ) : (
              <p className="text-xs text-[var(--color-text-muted)]">
                {t('header.updateChangelogEmpty')}
              </p>
            )}
          </div>
          <p className="text-center text-sm text-[var(--color-text-muted)]">
            {t('header.updatePromptConfirm')}
          </p>
          {applyError ? (
            <p className="text-center text-sm text-[var(--color-danger)]">{applyError}</p>
          ) : null}
        </div>
      </Dialog>
    </>
  )
}
