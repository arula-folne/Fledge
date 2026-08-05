import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Settings } from '@fledge/shared'
import { fledgeApi } from '../api/fledgeApi'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/TextField'
import { MemorySnapSlider } from '../components/ui/MemorySnapSlider'
import { Switch } from '../components/ui/Switch'
import { ThemeModePicker } from '../components/ui/ThemeModePicker'
import { ThemeColorPicker } from '../components/ui/ThemeColorPicker'
import { JavaRuntimePanel } from '../components/settings/JavaRuntimePanel'
import { useUiStore } from '../stores/appStores'
import { applyTheme, defaultThemeColorForMode } from '../styles/theme'

export default function SettingsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const setAuthStatus = useUiStore((s) => s.setAuthStatus)
  const [section, setSection] = useState<'basic' | 'display' | 'account' | 'java' | 'resources'>(
    'display',
  )
  const [message, setMessage] = useState<string | null>(null)

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => fledgeApi.settings.get(),
  })
  const pathsQuery = useQuery({
    queryKey: ['paths'],
    queryFn: () => fledgeApi.paths.get(),
  })
  const sessionQuery = useQuery({
    queryKey: ['session'],
    queryFn: () => fledgeApi.auth.session(),
  })
  const accountsQuery = useQuery({
    queryKey: ['accounts'],
    queryFn: () => fledgeApi.auth.list(),
    enabled: section === 'account',
  })

  const saveMutation = useMutation({
    mutationFn: (partial: Partial<Settings>) => fledgeApi.settings.set(partial),
    onMutate: async (partial) => {
      await queryClient.cancelQueries({ queryKey: ['settings'] })
      const previous = queryClient.getQueryData<Settings>(['settings'])
      if (previous) {
        const optimistic = { ...previous, ...partial }
        queryClient.setQueryData(['settings'], optimistic)
        applyTheme(optimistic)
      }
      return { previous }
    },
    onError: (err, _partial, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(['settings'], ctx.previous)
        applyTheme(ctx.previous)
      }
      setMessage(err instanceof Error ? err.message : String(err))
    },
    onSuccess: async (next) => {
      setMessage(null)
      applyTheme(next)
      queryClient.setQueryData(['settings'], next)
    },
  })

  const saveMutateRef = useRef(saveMutation.mutate)
  saveMutateRef.current = saveMutation.mutate
  const handleThemeColorChange = useCallback((themeColor: Settings['themeColor']) => {
    saveMutateRef.current({ themeColor })
  }, [])

  const resetMutation = useMutation({
    mutationFn: () => fledgeApi.settings.reset(),
    onSuccess: async (next) => {
      applyTheme(next)
      queryClient.setQueryData(['settings'], next)
      setMessage(t('settings.resetAllDone'))
    },
    onError: (err) => {
      setMessage(err instanceof Error ? err.message : String(err))
    },
  })

  const logoutMutation = useMutation({
    mutationFn: (accountId?: string) => fledgeApi.auth.logout(accountId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['session'] }),
        queryClient.invalidateQueries({ queryKey: ['accounts'] }),
      ])
      const next = await fledgeApi.auth.session()
      setAuthStatus(next.status)
    },
  })

  const switchAccountMutation = useMutation({
    mutationFn: (accountId: string) => fledgeApi.auth.switch(accountId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['session'] }),
        queryClient.invalidateQueries({ queryKey: ['accounts'] }),
      ])
    },
  })

  const addAccountMutation = useMutation({
    mutationFn: () => fledgeApi.auth.login(),
    onSuccess: async () => {
      setAuthStatus('logged_in')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['session'] }),
        queryClient.invalidateQueries({ queryKey: ['accounts'] }),
      ])
    },
  })

  const settings = settingsQuery.data
  const paths = pathsQuery.data

  const tabs: Array<{ id: typeof section; label: string }> = [
    { id: 'display', label: t('settings.section.display') },
    { id: 'basic', label: t('settings.section.basic') },
    { id: 'account', label: t('settings.section.account') },
    { id: 'java', label: t('settings.section.java') },
    { id: 'resources', label: t('settings.section.resources') },
  ]

  if (!settings) {
    return <p className="text-[var(--color-text-muted)]">{t('common.loading')}</p>
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 text-[var(--color-text)]">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">{t('settings.title')}</h1>

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={[
              'rounded-[var(--radius-sm)] px-3 py-2 text-sm',
              section === tab.id
                ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)] font-medium'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface)]',
            ].join(' ')}
            onClick={() => setSection(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {message ? (
        <div className="rounded-[var(--radius-sm)] bg-[var(--color-accent-soft)] px-3 py-2 text-sm">
          {message}
        </div>
      ) : null}

      {section === 'basic' ? (
        <>
          <Section title={t('settings.block.minecraft')}>
            <Toggle
              label={t('settings.fullscreen')}
              hint={t('settings.fullscreenHint')}
              checked={settings.gameFullscreen}
              onChange={(gameFullscreen) => saveMutation.mutate({ gameFullscreen })}
            />
            <WindowSizeFields
              title={t('settings.windowSize')}
              hint={t('settings.windowSizeHint')}
              width={settings.gameWindowWidth}
              height={settings.gameWindowHeight}
              minWidth={640}
              maxWidth={7680}
              minHeight={480}
              maxHeight={4320}
              disabled={settings.gameFullscreen}
              onCommitWidth={(gameWindowWidth) => saveMutation.mutate({ gameWindowWidth })}
              onCommitHeight={(gameWindowHeight) => saveMutation.mutate({ gameWindowHeight })}
            />
            <MemorySnapSlider
              label={t('settings.memory')}
              value={settings.defaultMemoryMaxMb}
              onChange={(defaultMemoryMaxMb) => saveMutation.mutate({ defaultMemoryMaxMb })}
            />
            <TextField
              label={t('settings.defaultJvmArgs')}
              value={settings.defaultJvmArgs.join(' ')}
              onChange={(e) =>
                saveMutation.mutate({
                  defaultJvmArgs: e.target.value
                    .split(/\s+/)
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </Section>
        </>
      ) : null}

      {section === 'account' ? (
        <Section title={t('settings.block.account')}>
          {(() => {
            const account = sessionQuery.data?.account
            const status = sessionQuery.data?.status
            const accounts = accountsQuery.data ?? []
            const faceUrl =
              account?.avatarUrl ??
              (account?.uuid
                ? `https://mc-heads.net/avatar/${account.uuid.replaceAll('-', '')}/64`
                : null)

            return (
              <div className="space-y-5">
                {account ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-accent-soft)]">
                        {faceUrl ? (
                          <img
                            src={faceUrl}
                            alt=""
                            className="h-full w-full"
                            style={{ imageRendering: 'pixelated' }}
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-[var(--color-text)]">
                            {account.displayName.slice(0, 1)}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 space-y-1">
                        <p className="text-xs text-[var(--color-text-muted)]">
                          {t('settings.account.current')}
                        </p>
                        <p className="truncate text-lg font-semibold text-[var(--color-text)]">
                          {account.displayName}
                        </p>
                        <p className="text-xs text-[var(--color-text-muted)]">
                          {status === 'expired'
                            ? t('auth.status.expired')
                            : status === 'refreshing'
                              ? t('auth.status.refreshing')
                              : t('auth.status.loggedIn')}
                        </p>
                      </div>
                    </div>

                    <dl className="space-y-3 text-sm">
                      <div>
                        <dt className="text-xs text-[var(--color-text-muted)]">
                          {t('settings.account.uuid')}
                        </dt>
                        <dd className="mt-0.5 break-all font-mono text-xs text-[var(--color-text)]">
                          {account.uuid}
                        </dd>
                      </div>
                    </dl>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-[var(--color-text-muted)]">{t('auth.status.loggedOut')}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {t('settings.account.notLoggedInHint')}
                    </p>
                  </div>
                )}

                {accounts.length > 0 ? (
                  <div className="space-y-2 border-t border-[var(--color-border)] pt-4">
                    <h3 className="text-sm font-medium text-[var(--color-text)]">
                      {t('auth.savedAccounts')}
                    </h3>
                    <ul className="space-y-2">
                      {accounts.map((a) => {
                        const active = a.id === account?.id
                        const aFace =
                          a.avatarUrl ??
                          `https://mc-heads.net/avatar/${a.uuid.replaceAll('-', '')}/64`
                        return (
                          <li
                            key={a.id}
                            className="flex flex-wrap items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2"
                          >
                            <img
                              src={aFace}
                              alt=""
                              className="h-10 w-10 rounded border border-[var(--color-border)]"
                              style={{ imageRendering: 'pixelated' }}
                              referrerPolicy="no-referrer"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-[var(--color-text)]">
                                {a.displayName}
                                {active ? (
                                  <span className="ml-2 text-[10px] font-semibold text-[var(--color-accent)]">
                                    {t('auth.active')}
                                  </span>
                                ) : null}
                              </p>
                              <p className="truncate font-mono text-[10px] text-[var(--color-text-muted)]">
                                {a.uuid}
                              </p>
                            </div>
                            {!active ? (
                              <Button
                                disabled={switchAccountMutation.isPending}
                                onClick={() => switchAccountMutation.mutate(a.id)}
                              >
                                {t('auth.useAccount')}
                              </Button>
                            ) : null}
                            <Button
                              variant="danger"
                              disabled={logoutMutation.isPending}
                              onClick={() => logoutMutation.mutate(a.id)}
                            >
                              {t('auth.removeAccount')}
                            </Button>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2 border-t border-[var(--color-border)] pt-4">
                  <Button
                    variant="primary"
                    disabled={addAccountMutation.isPending}
                    onClick={() => addAccountMutation.mutate()}
                  >
                    {t('auth.addAccount')}
                  </Button>
                </div>

                <p className="text-xs text-[var(--color-text-muted)]">{t('settings.account.multiHint')}</p>
              </div>
            )
          })()}
        </Section>
      ) : null}

      {section === 'display' ? (
        <Section title={t('settings.block.fledge')}>
          <WindowSizeFields
            title={t('settings.launcherWindowSize')}
            hint={t('settings.launcherWindowSizeHint')}
            width={settings.launcherWindowWidth}
            height={settings.launcherWindowHeight}
            minWidth={900}
            maxWidth={7680}
            minHeight={600}
            maxHeight={4320}
            onCommitWidth={(launcherWindowWidth) => saveMutation.mutate({ launcherWindowWidth })}
            onCommitHeight={(launcherWindowHeight) => saveMutation.mutate({ launcherWindowHeight })}
          />
          <Toggle
            label={t('settings.minimizeOnLaunch')}
            hint={t('settings.minimizeOnLaunchHint')}
            checked={settings.minimizeOnLaunch}
            onChange={(minimizeOnLaunch) => saveMutation.mutate({ minimizeOnLaunch })}
          />
          <Toggle
            label={t('settings.discordRichPresence')}
            hint={t('settings.discordRichPresenceHint')}
            checked={settings.discordRichPresence}
            onChange={(discordRichPresence) => saveMutation.mutate({ discordRichPresence })}
          />

          <div className="space-y-4 pt-5 mt-1 border-t border-[var(--color-border)]">
            <BlockHeading>{t('settings.block.appearance')}</BlockHeading>
            <ThemeModePicker
              value={settings.themeMode}
              labels={{
                light: t('settings.theme.light'),
                dark: t('settings.theme.dark'),
                color: t('settings.theme.color'),
                oled: t('settings.theme.oled'),
                system: t('settings.theme.system'),
              }}
              onChange={(mode) => {
                if (mode === 'color' && settings.themeMode !== 'color') {
                  saveMutation.mutate({
                    themeMode: mode,
                    themeColor: defaultThemeColorForMode(settings.themeMode),
                  })
                  return
                }
                saveMutation.mutate({ themeMode: mode })
              }}
            />
            {settings.themeMode === 'color' ? (
              <ThemeColorPicker
                title={t('settings.themeColor')}
                value={settings.themeColor}
                onChange={handleThemeColorChange}
              />
            ) : null}
            <Toggle
              label={t('settings.hardwareAcceleration')}
              checked={settings.hardwareAcceleration}
              onChange={(hardwareAcceleration) => saveMutation.mutate({ hardwareAcceleration })}
            />
            <Toggle
              label={t('settings.useOsWindowChrome')}
              hint={t('settings.useOsWindowChromeHint')}
              warning={t('settings.restartRequired')}
              checked={settings.useOsWindowChrome}
              onChange={(useOsWindowChrome) => saveMutation.mutate({ useOsWindowChrome })}
            />
          </div>

          <div className="space-y-2 pt-5 mt-1 border-t border-[var(--color-border)]">
            <BlockHeading>{t('settings.block.about')}</BlockHeading>
            <p className="whitespace-pre-line text-sm text-[var(--color-text-muted)]">
              {t('settings.aboutNote')}
            </p>
          </div>

          <div className="space-y-3 pt-5 mt-1 border-t border-[var(--color-border)]">
            <BlockHeading>{t('settings.block.reset')}</BlockHeading>
            <p className="text-xs text-[var(--color-text-muted)]">{t('settings.resetAllHint')}</p>
            <Button
              variant="danger"
              disabled={resetMutation.isPending}
              onClick={() => {
                if (!window.confirm(t('settings.resetAllConfirm'))) return
                resetMutation.mutate()
              }}
            >
              {t('settings.resetAll')}
            </Button>
          </div>
        </Section>
      ) : null}

      {section === 'java' ? (
        <Section>
          <JavaRuntimePanel onMessage={setMessage} />
        </Section>
      ) : null}

      {section === 'resources' ? (
        <Section>
          <div>
            <h3 className="mb-2 text-sm font-medium">{t('settings.appDirectory')}</h3>
            <p className="mb-2 break-all text-xs text-[var(--color-text-muted)]">
              {paths?.root}
            </p>
            <Button disabled={!paths} onClick={() => paths && void fledgeApi.paths.open(paths.root)}>
              {t('settings.openAppDirectory')}
            </Button>
          </div>
          <Button
            onClick={async () => {
              await fledgeApi.cache.clear()
              setMessage(t('settings.cacheCleared'))
            }}
          >
            {t('settings.clearCache')}
          </Button>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--color-text-muted)]">{t('settings.concurrentDownloads')}</span>
            <input
              type="number"
              min={1}
              max={32}
              value={settings.concurrentDownloads}
              onChange={(e) =>
                saveMutation.mutate({ concurrentDownloads: Number(e.target.value) || 10 })
              }
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-input)] px-3 py-2 text-[var(--color-text)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--color-text-muted)]">{t('settings.maxWriteConcurrency')}</span>
            <input
              type="number"
              min={1}
              max={32}
              value={settings.maxWriteConcurrency}
              onChange={(e) =>
                saveMutation.mutate({ maxWriteConcurrency: Number(e.target.value) || 10 })
              }
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-input)] px-3 py-2 text-[var(--color-text)]"
            />
          </label>
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-[var(--color-text)]">
              {t('settings.curseforgeApiKey')}
            </h3>
            <p className="text-xs text-[var(--color-text-muted)]">
              {t('settings.curseforgeApiKeyHint')}
            </p>
            <TextField
              label={t('settings.curseforgeApiKey')}
              type="password"
              defaultValue={settings.curseforgeApiKey ?? ''}
              key={`cf-key-${settings.curseforgeApiKey ? 'set' : 'empty'}`}
              autoComplete="off"
              onBlur={(e) => {
                const next = e.target.value
                if (next !== (settings.curseforgeApiKey ?? '')) {
                  saveMutation.mutate({ curseforgeApiKey: next })
                  void queryClient.invalidateQueries({ queryKey: ['content-providers'] })
                }
              }}
            />
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-[var(--color-text)]">{t('settings.backupFolder')}</h3>
            <p className="break-all text-xs text-[var(--color-text-muted)]">
              {settings.backupFolder ?? '—'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={async () => {
                  const folder = await fledgeApi.paths.selectFolder()
                  if (folder) saveMutation.mutate({ backupFolder: folder })
                }}
              >
                {t('settings.selectBackupFolder')}
              </Button>
              <Button
                variant="primary"
                disabled={!settings.backupFolder}
                onClick={async () => {
                  const dest = await fledgeApi.backup.run()
                  setMessage(`${t('settings.backupDone')}: ${dest}`)
                }}
              >
                {t('settings.runBackup')}
              </Button>
            </div>
          </div>
        </Section>
      ) : null}
    </div>
  )
}

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      {title ? <BlockHeading>{title}</BlockHeading> : null}
      {children}
    </section>
  )
}

function BlockHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold tracking-tight text-[var(--color-text)]">{children}</h2>
}

function WindowSizeFields({
  title,
  hint,
  width,
  height,
  minWidth,
  maxWidth,
  minHeight,
  maxHeight,
  disabled,
  onCommitWidth,
  onCommitHeight,
}: {
  title: string
  hint: string
  width: number
  height: number
  minWidth: number
  maxWidth: number
  minHeight: number
  maxHeight: number
  disabled?: boolean
  onCommitWidth: (width: number) => void
  onCommitHeight: (height: number) => void
}) {
  const { t } = useTranslation()
  const [widthText, setWidthText] = useState(String(width))
  const [heightText, setHeightText] = useState(String(height))

  useEffect(() => {
    setWidthText(String(width))
  }, [width])
  useEffect(() => {
    setHeightText(String(height))
  }, [height])

  const commitWidth = () => {
    const n = Number(widthText.replace(/[^\d]/g, ''))
    if (!Number.isFinite(n) || n <= 0) {
      setWidthText(String(width))
      return
    }
    const next = Math.min(maxWidth, Math.max(minWidth, Math.trunc(n)))
    setWidthText(String(next))
    if (next !== width) onCommitWidth(next)
  }

  const commitHeight = () => {
    const n = Number(heightText.replace(/[^\d]/g, ''))
    if (!Number.isFinite(n) || n <= 0) {
      setHeightText(String(height))
      return
    }
    const next = Math.min(maxHeight, Math.max(minHeight, Math.trunc(n)))
    setHeightText(String(next))
    if (next !== height) onCommitHeight(next)
  }

  return (
    <div>
      <h3 className="mb-1 text-sm font-medium text-[var(--color-text)]">{title}</h3>
      <p className="mb-3 text-xs text-[var(--color-text-muted)]">{hint}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label={t('settings.windowWidth')}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={widthText}
          disabled={disabled}
          onChange={(e) => setWidthText(e.target.value.replace(/[^\d]/g, ''))}
          onBlur={commitWidth}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />
        <TextField
          label={t('settings.windowHeight')}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={heightText}
          disabled={disabled}
          onChange={(e) => setHeightText(e.target.value.replace(/[^\d]/g, ''))}
          onBlur={commitHeight}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />
      </div>
    </div>
  )
}

function Toggle({
  label,
  hint,
  warning,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  warning?: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="min-w-0">
        <span className="font-medium text-[var(--color-text)]">{label}</span>
        {hint ? <span className="mt-1 block text-xs text-[var(--color-text-muted)]">{hint}</span> : null}
        {warning ? (
          <span
            className="mt-1.5 inline-block rounded-[var(--radius-sm)] px-2 py-1 text-xs font-semibold"
            style={{ backgroundColor: '#ffcece', color: '#ea553a' }}
          >
            {warning}
          </span>
        ) : null}
      </span>
      <Switch checked={checked} onChange={onChange} aria-label={label} />
    </div>
  )
}
