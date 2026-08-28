import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery } from '@tanstack/react-query'
import { IconDownload } from '@tabler/icons-react'
import { APP_VERSION, type UpdateChannel, type UpdateCheckResult } from '@fledge/shared'
import { fledgeApi } from '../../api/fledgeApi'
import { Dialog } from '../ui/Dialog'
import { Button } from '../ui/Button'
import { MarkdownBody } from '../../features/content/MarkdownBody'

type PromptState = {
  channel: UpdateChannel
  result: UpdateCheckResult
}

/**
 * ヘッダー右: GitHub Releases /latest に新しい版があるときに案内する。
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

  const applyMutation = useMutation({
    mutationFn: () => fledgeApi.updater.apply('stable'),
    onMutate: () => setApplyError(null),
    onSuccess: () => setPrompt(null),
    onError: (err) => {
      const key = err instanceof Error ? err.message : String(err)
      setApplyError(key.startsWith('updater.') ? t(key) : t('updater.applyFailed'))
    },
  })

  const stable = stableQuery.data
  const showStable = stable?.status === 'available' && Boolean(stable.nextVersion)

  if (!showStable) return null

  const openDialog = (result: UpdateCheckResult) => {
    setApplyError(null)
    setPrompt({ channel: 'stable', result })
  }
  const closeDialog = () => {
    if (applyMutation.isPending) return
    setPrompt(null)
  }

  const nextVersion = prompt?.result.nextVersion ?? ''

  return (
    <>
      <div className="flex min-w-0 shrink-0 items-center gap-1">
        {stable?.nextVersion ? (
          <button
            type="button"
            className="flex min-w-0 items-center gap-1.5 rounded-full border border-[var(--color-accent)]/35 bg-[var(--color-accent)]/10 px-3 py-1 text-[11px] font-medium leading-none text-[var(--color-accent)] transition hover:bg-[var(--color-accent)]/18"
            aria-label={t('header.updateAvailable')}
            onClick={() => openDialog(stable)}
          >
            <IconDownload size={13} stroke={1.75} className="shrink-0" aria-hidden />
            <span className="truncate">{t('header.updateAvailable')}</span>
          </button>
        ) : null}
      </div>

      <Dialog
        open={Boolean(prompt)}
        title={t('header.updatePromptTitle')}
        onClose={closeDialog}
        size="md"
        compact
        backdrop="lighter"
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
              onClick={() => applyMutation.mutate()}
            >
              {applyMutation.isPending ? t('updater.downloading') : t('header.updateYes')}
            </Button>
          </>
        }
      >
        <div className="space-y-2.5 py-1 text-left">
          <p className="text-center text-xs font-medium text-[var(--color-text)]">
            {t('header.updatePromptVersion', { from: APP_VERSION, to: nextVersion })}
          </p>
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
            <p className="mb-1 text-[10px] font-semibold tracking-wide text-[var(--color-text-muted)]">
              {t('header.updateChangelog')}
            </p>
            {prompt?.result.releaseNotes?.trim() ? (
              <div className="max-h-56 overflow-auto">
                <MarkdownBody
                  text={prompt.result.releaseNotes.trim()}
                  className="news-md text-[11px] leading-relaxed"
                />
              </div>
            ) : (
              <p className="text-[11px] text-[var(--color-text-muted)]">
                {t('header.updateChangelogEmpty')}
              </p>
            )}
          </div>
          <p className="text-center text-xs text-[var(--color-text-muted)]">
            {t('header.updatePromptConfirm')}
          </p>
          {applyError ? (
            <p className="text-center text-xs text-[var(--color-danger)]">{applyError}</p>
          ) : null}
        </div>
      </Dialog>
    </>
  )
}
