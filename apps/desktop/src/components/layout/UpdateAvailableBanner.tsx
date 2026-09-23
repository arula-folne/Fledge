import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { IconDownload, IconRefresh } from '@tabler/icons-react'
import {
  APP_VERSION,
  type ProgressEvent,
  type UpdateChannel,
  type UpdateCheckResult,
} from '@fledge/shared'
import { fledgeApi } from '../../api/fledgeApi'
import { Dialog } from '../ui/Dialog'
import { Button } from '../ui/Button'
import { ProgressBar } from '../ui/ProgressBar'
import { MarkdownBody } from '../../features/content/MarkdownBody'

type PromptState = {
  channel: UpdateChannel
  result: UpdateCheckResult
}

type ApplyPhase = 'idle' | 'downloading' | 'preparing' | 'restarting'
type CheckFeedback = 'up-to-date' | 'failed' | null

/**
 * a / b / c / ut / up は GitHub プレリリースのため /releases/latest では見えない。
 * これらのビルドでは prerelease チャネルを見る。
 */
function updateChannelForBuild(): UpdateChannel {
  return /(?:a|b|c|ut|up)$/i.test(APP_VERSION) ? 'prerelease' : 'stable'
}

/**
 * ヘッダー右: 更新確認ボタンと、新しい版があるときの案内。
 */
export function UpdateAvailableBanner() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const channel = updateChannelForBuild()
  const [prompt, setPrompt] = useState<PromptState | null>(null)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [phase, setPhase] = useState<ApplyPhase>('idle')
  const [percent, setPercent] = useState(0)
  const [checkFeedback, setCheckFeedback] = useState<CheckFeedback>(null)
  const [checking, setChecking] = useState(false)

  const updateQuery = useQuery({
    queryKey: ['updater', 'check', channel],
    queryFn: () => fledgeApi.updater.check(channel),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
  })

  useEffect(() => {
    return fledgeApi.on.progress((e: ProgressEvent) => {
      if (e.scope !== 'updater' || e.jobId !== 'app-updater') return
      if (e.messageKey === 'updater.downloading') {
        setPhase('downloading')
        setPercent(
          typeof e.percent === 'number'
            ? e.percent
            : e.total > 0
              ? (e.current / e.total) * 100
              : 0,
        )
      } else if (e.messageKey === 'updater.preparing') {
        setPhase('preparing')
        setPercent(100)
      } else if (e.messageKey === 'updater.restarting') {
        setPhase('restarting')
        setPercent(100)
      }
    })
  }, [])

  useEffect(() => {
    if (!checkFeedback) return
    const timer = window.setTimeout(() => setCheckFeedback(null), 3200)
    return () => window.clearTimeout(timer)
  }, [checkFeedback])

  const applyMutation = useMutation({
    mutationFn: () => fledgeApi.updater.apply(channel),
    onMutate: () => {
      setApplyError(null)
      setPhase('downloading')
      setPercent(0)
    },
    onSuccess: () => {
      // ダウンロード完了後に本体が終了する。ダイアログは再起動案内のまま残す
      setPhase('restarting')
      setPercent(100)
    },
    onError: (err) => {
      const key = err instanceof Error ? err.message : String(err)
      setApplyError(key.startsWith('updater.') ? t(key) : t('updater.applyFailed'))
      setPhase('idle')
      setPercent(0)
    },
  })

  const update = updateQuery.data
  const showUpdate = update?.status === 'available' && Boolean(update.nextVersion)
  const applying = applyMutation.isPending || phase === 'restarting'

  const openDialog = (result: UpdateCheckResult) => {
    if (applying) return
    setApplyError(null)
    setPhase('idle')
    setPercent(0)
    setPrompt({ channel, result })
  }
  const closeDialog = () => {
    if (applying) return
    setPrompt(null)
  }

  const handleManualCheck = async () => {
    if (checking || applying) return
    setCheckFeedback(null)
    setChecking(true)
    try {
      const result = await fledgeApi.updater.check(channel, { force: true })
      queryClient.setQueryData(['updater', 'check', channel], result)
      if (result.status === 'available' && result.nextVersion) {
        openDialog(result)
      } else if (result.status === 'up-to-date') {
        setCheckFeedback('up-to-date')
      } else {
        setCheckFeedback('failed')
      }
    } catch {
      setCheckFeedback('failed')
    } finally {
      setChecking(false)
    }
  }

  const nextVersion = prompt?.result.nextVersion ?? update?.nextVersion ?? ''

  const phaseLabel =
    phase === 'downloading'
      ? t('updater.downloading')
      : phase === 'preparing'
        ? t('updater.preparing')
        : phase === 'restarting'
          ? t('updater.restarting')
          : null

  const checkLabel = checking
    ? t('header.checkForUpdatesChecking')
    : checkFeedback === 'up-to-date'
      ? t('header.updateUpToDate')
      : checkFeedback === 'failed'
        ? t('header.updateCheckFailed')
        : t('header.checkForUpdates')

  return (
    <>
      <div className="flex min-w-0 shrink-0 items-center gap-1.5">
        {showUpdate && update?.nextVersion && !applying ? (
          <button
            type="button"
            className="flex min-w-0 items-center gap-1.5 rounded-full border border-[var(--color-accent)]/35 bg-[var(--color-accent)]/10 px-3 py-1 text-[11px] font-medium leading-none text-[var(--color-accent)] transition hover:bg-[var(--color-accent)]/18"
            aria-label={t('header.updateAvailable')}
            onClick={() => openDialog(update)}
          >
            <IconDownload size={13} stroke={1.75} className="shrink-0" aria-hidden />
            <span className="truncate">{t('header.updateAvailable')}</span>
          </button>
        ) : null}

        {!applying ? (
          <button
            type="button"
            className={[
              'flex min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none transition',
              checkFeedback === 'failed'
                ? 'border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 text-[var(--color-danger)]'
                : checkFeedback === 'up-to-date'
                  ? 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)]'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)]/80 text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]',
            ].join(' ')}
            aria-label={t('header.checkForUpdates')}
            title={t('header.checkForUpdates')}
            disabled={checking}
            onClick={() => void handleManualCheck()}
          >
            <IconRefresh
              size={13}
              stroke={1.75}
              className={['shrink-0', checking ? 'animate-spin' : ''].join(' ')}
              aria-hidden
            />
            <span className="truncate">{checkLabel}</span>
          </button>
        ) : null}
      </div>

      <Dialog
        open={Boolean(prompt) || applying}
        title={t('header.updatePromptTitle')}
        onClose={closeDialog}
        size="xl"
        scrollable
        backdrop="soft"
        dismissible={!applying}
        footer={
          applying ? null : (
            <>
              <Button type="button" onClick={closeDialog}>
                {t('header.updateNo')}
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={!prompt}
                onClick={() => applyMutation.mutate()}
              >
                {t('header.updateYes')}
              </Button>
            </>
          )
        }
      >
        <div className="space-y-4 text-left text-[15px] leading-relaxed text-[var(--color-text)]">
          <p className="font-medium">
            {t('header.updatePromptVersion', { from: APP_VERSION, to: nextVersion })}
          </p>

          {applying ? (
            <div className="space-y-3 py-2">
              <p className="font-medium">{phaseLabel}</p>
              <ProgressBar percent={percent > 0 ? percent : 8} />
              <p className="text-sm text-[var(--color-text-muted)]">
                {phase === 'restarting'
                  ? t('updater.restartingHint')
                  : t('updater.progressHint')}
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <p className="text-sm font-medium text-[var(--color-text-muted)]">
                  {t('header.updateChangelog')}
                </p>
                {prompt?.result.releaseNotes?.trim() ? (
                  <div className="max-h-[min(55vh,28rem)] overflow-auto pr-1">
                    <MarkdownBody
                      text={prompt.result.releaseNotes.trim()}
                      className="changelog-plain text-[15px] leading-relaxed"
                    />
                  </div>
                ) : (
                  <p className="text-[var(--color-text-muted)]">
                    {t('header.updateChangelogEmpty')}
                  </p>
                )}
              </div>
              <p className="text-sm text-[var(--color-text-muted)]">
                {t('header.updatePromptConfirm')}
              </p>
            </>
          )}

          {applyError ? (
            <p className="text-[var(--color-danger)]">{applyError}</p>
          ) : null}
        </div>
      </Dialog>
    </>
  )
}
