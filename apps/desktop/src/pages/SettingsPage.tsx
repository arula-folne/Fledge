import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react'
import {
  IconAdjustments,
  IconBrandMinecraft,
  IconBox,
  IconCoffee,
  IconFolderSearch,
  IconFolders,
  IconLibrary,
  IconPalette,
  IconPlayerPlay,
  IconUser,
  IconUsers,
} from '@tabler/icons-react'
import {
  DEFAULT_CONCURRENT_DOWNLOADS,
  DEFAULT_MAX_WRITE_CONCURRENCY,
  GAME_WINDOW_MIN_HEIGHT,
  GAME_WINDOW_MIN_WIDTH,
  GAME_WINDOW_SIZE_PRESETS,
  LAUNCHER_WINDOW_MIN_HEIGHT,
  LAUNCHER_WINDOW_MIN_WIDTH,
  LAUNCHER_WINDOW_SIZE_PRESETS,
  type Settings,
  type UiScale,
  type WindowSizePreset,
} from '@fledge/shared'
import { fledgeApi } from '../api/fledgeApi'
import { useInstallOnboardingStore, useUiStore } from '../stores/appStores'
import { Button } from '../components/ui/Button'
import { Dialog } from '../components/ui/Dialog'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { Select } from '../components/ui/Select'
import { TextField } from '../components/ui/TextField'
import { MemorySnapSlider } from '../components/ui/MemorySnapSlider'
import { Switch } from '../components/ui/Switch'
import { ThemeColorPicker } from '../components/ui/ThemeColorPicker'
import { ThemeModePicker } from '../components/ui/ThemeModePicker'
import { ThemeSeasonPicker } from '../components/ui/ThemeSeasonPicker'
import { SeasonTonePicker, coerceSeasonTone } from '../components/ui/SeasonTonePicker'
import { BackupPanel } from '../components/settings/BackupPanel'
import { JavaRuntimePanel } from '../components/settings/JavaRuntimePanel'
import { MinecraftInitialSettingsPanel } from '../components/settings/MinecraftInitialSettingsPanel'
import { DeviceQuickSettings } from '../components/settings/DeviceQuickSettings'
import { AppCredits } from '../components/brand/AppCredits'
import { applyLoggedInAccount, loadSessionQuery, sessionQueryOptions } from '../features/auth/sessionCache'
import { startLogin } from '../features/auth/loginAction'
import { McFaceAvatar } from '../features/auth/McFaceAvatar'
import { mcFaceUrl } from '../features/auth/mcFace'
import { cropSkinFaceDataUrl } from '../features/auth/skinFace'
import { applyTheme, defaultThemeColorsForMode, type ThemeColorPair } from '../styles/theme'
import { ProgressBar } from '../components/ui/ProgressBar'

export default function SettingsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const sectionRaw = useUiStore((s) => s.settingsSection)
  const setSection = useUiStore((s) => s.setSettingsSection)
  const section = sectionRaw

  const [message, setMessage] = useState<string | null>(null)
  const [restartNoticeOpen, setRestartNoticeOpen] = useState(false)
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)
  const [factoryResetOpen, setFactoryResetOpen] = useState(false)
  const [factoryResetProgress, setFactoryResetProgress] = useState<{
    percent: number
    messageKey: string
  } | null>(null)

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => fledgeApi.settings.get(),
  })
  const appDirectoryQuery = useQuery({
    queryKey: ['app-directory'],
    queryFn: () => fledgeApi.paths.getAppDirectory(),
  })
  const sessionQuery = useQuery({
    queryKey: ['session'],
    ...sessionQueryOptions,
    queryFn: () => loadSessionQuery(queryClient),
  })
  const accountsQuery = useQuery({
    queryKey: ['accounts'],
    queryFn: () => fledgeApi.auth.list(),
    enabled: section === 'account',
  })
  const selectedSkinId = settingsQuery.data?.selectedSkinId
  const sessionAccount = sessionQuery.data?.account
  const sessionStatus = sessionQuery.data?.status
  const showAccountFace =
    Boolean(sessionAccount) &&
    sessionStatus !== 'expired' &&
    sessionStatus !== 'logged_out'
  const accountFaceQuery = useQuery({
    queryKey: ['account-face', selectedSkinId, 64],
    enabled: section === 'account' && showAccountFace && Boolean(selectedSkinId),
    staleTime: 30 * 60_000,
    gcTime: 10 * 60_000,
    queryFn: async () => {
      const dataUrl = await fledgeApi.skins.getDataUrl(selectedSkinId!)
      if (!dataUrl) return null
      return cropSkinFaceDataUrl(dataUrl, 64)
    },
  })

  const saveMutation = useMutation({
    mutationFn: (partial: Partial<Settings>) => fledgeApi.settings.set(partial),
    onMutate: async (partial) => {
      await queryClient.cancelQueries({ queryKey: ['settings'] })
      const previous = queryClient.getQueryData<Settings>(['settings'])
      if (previous) {
        const optimistic: Settings = { ...previous, ...partial }
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
  const handleThemeColorChange = useCallback((pair: ThemeColorPair) => {
    saveMutateRef.current({
      themeColor: pair.base,
      themeAccentColor: pair.accent,
    })
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

  const factoryResetMutation = useMutation({
    mutationFn: async () => {
      try {
        localStorage.clear()
      } catch {
        /* ignore */
      }
      await fledgeApi.app.factoryReset()
    },
    onMutate: () => {
      setFactoryResetProgress({
        percent: 0,
        messageKey: 'settings.factoryReset.progress.stopping',
      })
      queryClient.removeQueries({ queryKey: ['instances'] })
      queryClient.removeQueries({ queryKey: ['settings'] })
      queryClient.removeQueries({ queryKey: ['skins'] })
      queryClient.removeQueries({ queryKey: ['session'] })
      queryClient.removeQueries({ queryKey: ['accounts'] })
    },
    onError: (err) => {
      setFactoryResetProgress(null)
      setMessage(err instanceof Error ? err.message : String(err))
    },
  })

  useEffect(() => {
    return fledgeApi.on.progress((e) => {
      if (e.jobId !== 'factory-reset') return
      const total = Math.max(1, e.total)
      setFactoryResetProgress({
        percent:
          typeof e.percent === 'number'
            ? e.percent
            : Math.round(((e.current ?? 0) / total) * 100),
        messageKey: e.messageKey ?? 'settings.factoryReset.progress.data',
      })
    })
  }, [])

  const logoutMutation = useMutation({
    mutationFn: (accountId?: string) => fledgeApi.auth.logout(accountId),
  })

  const switchAccountMutation = useMutation({
    mutationFn: (accountId: string) => fledgeApi.auth.switch(accountId),
    onSuccess: async (account) => {
      applyLoggedInAccount(queryClient, account)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['skins'] }),
        queryClient.invalidateQueries({ queryKey: ['settings'] }),
        queryClient.invalidateQueries({ queryKey: ['account-face'] }),
      ])
    },
  })

  const addAccountMutation = useMutation({
    mutationFn: () => startLogin(queryClient),
  })

  const saveRestartRequiredSetting = (partial: Partial<Settings>) => {
    saveMutation.mutate(partial, {
      onSuccess: () => setRestartNoticeOpen(true),
    })
  }

  const settings = settingsQuery.data
  const appDirectory = appDirectoryQuery.data

  const setAppDirectoryMutation = useMutation({
    mutationFn: (next: string | null) => fledgeApi.paths.setAppDirectory(next),
    onSuccess: (info) => {
      queryClient.setQueryData(['app-directory'], info)
      setMessage(null)
      if (info.restartRequired) setRestartNoticeOpen(true)
    },
    onError: (err) => {
      setMessage(err instanceof Error ? err.message : String(err))
    },
  })

  const browseAppDirectory = async () => {
    const selected = await fledgeApi.paths.selectFolder()
    if (!selected) return
    setAppDirectoryMutation.mutate(selected)
  }

  type SettingsTab = {
    id: typeof section
    label: string
    Icon: ComponentType<{ size?: number; stroke?: number; className?: string }>
  }

  const navGroups: Array<{ label?: string; items: SettingsTab[] }> = [
    {
      label: t('settings.group.app'),
      items: [
        { id: 'appGeneral', label: t('settings.section.appGeneral'), Icon: IconAdjustments },
        { id: 'appTheme', label: t('settings.section.appTheme'), Icon: IconPalette },
      ],
    },
    {
      label: t('settings.group.minecraft'),
      items: [
        { id: 'minecraftLaunch', label: t('settings.section.minecraftLaunch'), Icon: IconPlayerPlay },
        { id: 'minecraftInitial', label: t('settings.section.minecraftInitial'), Icon: IconBrandMinecraft },
        { id: 'java', label: t('settings.section.java'), Icon: IconCoffee },
      ],
    },
    {
      label: t('settings.group.other'),
      items: [
        { id: 'account', label: t('settings.section.account'), Icon: IconUsers },
        { id: 'resources', label: t('settings.section.resources'), Icon: IconFolders },
        { id: 'privacyCredits', label: t('settings.section.privacyCredits'), Icon: IconLibrary },
      ],
    },
  ]

  const tabs = navGroups.flatMap((group) => group.items)

  if (!settings) {
    return <p className="text-[var(--color-text-muted)]">{t('common.loading')}</p>
  }

  const currentTab = tabs.find((tab) => tab.id === section)

  return (
    <div className="mx-auto flex h-full min-h-0 max-w-6xl flex-col text-[var(--color-text)]">
      <h1 className="mb-2 shrink-0 text-lg font-semibold text-[var(--color-text)]">
        {t('settings.title')}
      </h1>

      <div className="grid min-h-0 flex-1 grid-cols-[auto_minmax(0,1fr)] gap-4">
        <nav
          className="flex min-h-0 w-max min-w-[12rem] flex-col gap-0.5 self-stretch py-1"
          aria-label={t('settings.title')}
        >
          {navGroups.map((group, groupIndex) => (
            <div key={group.label ?? `group-${groupIndex}`} className={groupIndex > 0 ? 'mt-3' : undefined}>
              {group.label ? (
                <p className="mb-1 px-2.5 text-[11px] font-medium tracking-wide text-[var(--color-text-muted)]">
                  {group.label}
                </p>
              ) : null}
              <div className="flex flex-col gap-0.5">
                {group.items.map((tab) => {
                  const TabIcon = tab.Icon
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      className={[
                        'flex w-full items-center gap-2 whitespace-nowrap rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-sm',
                        section === tab.id
                          ? 'bg-[var(--color-selection-soft)] font-medium text-[var(--color-selection)]'
                          : 'text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
                      ].join(' ')}
                      onClick={() => setSection(tab.id)}
                    >
                      <TabIcon size={18} stroke={1.7} className="shrink-0" />
                      <span className="break-keep">{tab.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="min-h-0 min-w-0 space-y-4 overflow-y-auto overflow-x-visible pr-1">
          {currentTab ? (
            <h2 className="flex items-center gap-2 whitespace-nowrap text-lg font-semibold tracking-tight text-[var(--color-text)]">
              <currentTab.Icon size={22} stroke={1.7} className="shrink-0" />
              <span className="break-keep">{currentTab.label}</span>
            </h2>
          ) : null}

          {message ? (
            <div className="rounded-[var(--radius-sm)] bg-[var(--color-accent-soft)] px-3 py-2 text-sm">
              {message}
            </div>
          ) : null}

      {section === 'minecraftLaunch' ? (
        <>
          <Section title={t('settings.block.gameWindow')}>
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
              minWidth={GAME_WINDOW_MIN_WIDTH}
              maxWidth={7680}
              minHeight={GAME_WINDOW_MIN_HEIGHT}
              maxHeight={4320}
              presets={GAME_WINDOW_SIZE_PRESETS}
              disabled={settings.gameFullscreen}
              onCommitWidth={(gameWindowWidth) => saveMutation.mutate({ gameWindowWidth })}
              onCommitHeight={(gameWindowHeight) => saveMutation.mutate({ gameWindowHeight })}
              onCommitSize={(gameWindowWidth, gameWindowHeight) =>
                saveMutation.mutate({ gameWindowWidth, gameWindowHeight })
              }
            />
          </Section>
          <Section title={t('settings.block.gamePerformance')}>
            <MemorySnapSlider
              label={t('settings.memory')}
              hint={t('settings.memoryHint')}
              value={settings.defaultMemoryMaxMb}
              onChange={(defaultMemoryMaxMb) => saveMutation.mutate({ defaultMemoryMaxMb })}
            />
            <TextField
              label={t('settings.defaultJvmArgs')}
              hint={t('settings.defaultJvmArgsHint')}
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

      {section === 'minecraftInitial' ? (
          <MinecraftInitialSettingsPanel
              value={settings.minecraftInitialSettings}
              onChange={(minecraftInitialSettings) => saveMutation.mutate({ minecraftInitialSettings })}
              labels={{
                hint: t('settings.minecraftInitial.hint'),
                reset: t('settings.minecraftInitial.reset'),
                mcDefault: t('settings.minecraftInitial.mcDefault'),
                game: t('settings.minecraftInitial.group.game'),
                audio: t('settings.minecraftInitial.group.audio'),
                video: t('settings.minecraftInitial.group.video'),
                controls: t('settings.minecraftInitial.group.controls'),
                lang: t('settings.minecraftInitial.lang'),
                langSearch: t('settings.minecraftInitial.langSearch'),
                langEmpty: t('settings.minecraftInitial.langEmpty'),
                subtitles: t('settings.minecraftInitial.subtitles'),
                autoJump: t('settings.minecraftInitial.autoJump'),
                fov: t('settings.minecraftInitial.fov'),
                masterVolume: t('settings.minecraftInitial.masterVolume'),
                music: t('settings.minecraftInitial.music'),
                maxFps: t('settings.minecraftInitial.maxFps'),
                vsync: t('settings.minecraftInitial.vsync'),
                fpsCondition: t('settings.minecraftInitial.fpsCondition'),
                fpsConditionAfk: t('settings.minecraftInitial.fpsConditionAfk'),
                fpsConditionMinimized: t('settings.minecraftInitial.fpsConditionMinimized'),
                guiScale: t('settings.minecraftInitial.guiScale'),
                guiScaleAuto: t('settings.minecraftInitial.guiScaleAuto'),
                brightness: t('settings.minecraftInitial.brightness'),
                renderDistance: t('settings.minecraftInitial.renderDistance'),
                simulationDistance: t('settings.minecraftInitial.simulationDistance'),
                mouseSensitivity: t('settings.minecraftInitial.mouseSensitivity'),
                on: t('common.on'),
                off: t('common.off'),
                unlimited: t('settings.minecraftInitial.unlimited'),
                chunks: t('settings.minecraftInitial.chunks'),
                degrees: t('settings.minecraftInitial.degrees'),
                normal: t('settings.minecraftInitial.normal'),
                quakePro: t('settings.minecraftInitial.quakePro'),
                moody: t('settings.minecraftInitial.moody'),
                bright: t('settings.minecraftInitial.bright'),
              }}
            />
      ) : null}

      {section === 'account' ? (
        <Section>
          {(() => {
            const account = sessionQuery.data?.account
            const status = sessionQuery.data?.status
            const accounts = accountsQuery.data ?? []
            const showUserFace = Boolean(account) && status !== 'expired' && status !== 'logged_out'
            const faceUrl = showUserFace
              ? (accountFaceQuery.data ?? mcFaceUrl(account, 64))
              : null

            return (
              <div className="space-y-5">
                {account ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-4">
                      {faceUrl ? (
                        <McFaceAvatar src={faceUrl} size={64} radius="md" />
                      ) : status === 'expired' ? (
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-accent-soft)] text-[var(--color-text-muted)]">
                          <IconUser size={36} stroke={1.75} aria-hidden />
                        </div>
                      ) : (
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-accent-soft)] text-lg font-semibold text-[var(--color-text)]">
                          {account.displayName.slice(0, 1)}
                        </div>
                      )}
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
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-accent-soft)] text-[var(--color-text-muted)]">
                      <IconUser size={36} stroke={1.75} aria-hidden />
                    </div>
                    <div className="min-w-0 space-y-2">
                      <p className="text-sm text-[var(--color-text-muted)]">{t('auth.status.loggedOut')}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        {t('settings.account.notLoggedInHint')}
                      </p>
                    </div>
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
                          active && showUserFace
                            ? (accountFaceQuery.data ?? mcFaceUrl(a, 40))
                            : mcFaceUrl(a, 40)
                        return (
                          <li
                            key={a.id}
                            className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2"
                          >
                            {aFace ? (
                              <McFaceAvatar src={aFace} size={40} radius="md" className="bg-[var(--color-bg)]" />
                            ) : (
                              <span className="h-10 w-10 shrink-0 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)]" />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-[var(--color-text)]">
                                {a.displayName}
                                {active ? (
                                  <span className="ml-2 text-[10px] font-semibold text-[var(--color-selection)]">
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

      {section === 'appGeneral' ? (
        <>
          <DeviceQuickSettings
            settings={settings}
            onApply={(partial, options) => {
              if (options?.restartRequired) saveRestartRequiredSetting(partial)
              else saveMutation.mutate(partial)
            }}
          />
          <Section title={t('settings.block.windowGeneral')}>
            <p className="text-xs text-[var(--color-text-muted)]">{t('settings.windowGeneralHint')}</p>
            <WindowSizeFields
              title={t('settings.launcherWindowSize')}
              hint={t('settings.launcherWindowSizeHint')}
              width={settings.launcherWindowWidth}
              height={settings.launcherWindowHeight}
              minWidth={LAUNCHER_WINDOW_MIN_WIDTH}
              maxWidth={7680}
              minHeight={LAUNCHER_WINDOW_MIN_HEIGHT}
              maxHeight={4320}
              presets={LAUNCHER_WINDOW_SIZE_PRESETS}
              onCommitWidth={(launcherWindowWidth) =>
                saveMutation.mutate(launcherWindowPatch(launcherWindowWidth, settings.launcherWindowHeight))
              }
              onCommitHeight={(launcherWindowHeight) =>
                saveMutation.mutate(launcherWindowPatch(settings.launcherWindowWidth, launcherWindowHeight))
              }
              onCommitSize={(launcherWindowWidth, launcherWindowHeight) =>
                saveMutation.mutate(launcherWindowPatch(launcherWindowWidth, launcherWindowHeight))
              }
            />
            <UiScalePicker
              value={settings.uiScale}
              onChange={(uiScale) => saveMutation.mutate({ uiScale })}
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
            <Toggle
              label={t('settings.hardwareAcceleration')}
              hint={t('settings.hardwareAccelerationHint')}
              checked={settings.hardwareAcceleration}
              onChange={(hardwareAcceleration) =>
                saveRestartRequiredSetting({ hardwareAcceleration })
              }
            />
            <div className="space-y-3 border-t border-[var(--color-border)] pt-5">
              <p className="text-xs text-[var(--color-text-muted)]">{t('settings.resetAllHint')}</p>
              <Button
                variant="danger"
                disabled={resetMutation.isPending}
                onClick={() => setResetConfirmOpen(true)}
              >
                {t('settings.resetAll')}
              </Button>
            </div>
          </Section>
        </>
      ) : null}

      {section === 'appTheme' ? (
        <>
          <Section title={t('settings.block.standardTheme')}>
            <div data-fledge-tutorial="tutorial-settings-theme">
            <ThemeModePicker
              value={settings.themeFamily === 'standard' ? settings.themeMode : null}
              labels={{
                light: t('settings.theme.light'),
                dark: t('settings.theme.dark'),
                color: t('settings.theme.color'),
                oled: t('settings.theme.oled'),
                system: t('settings.theme.system'),
              }}
              onChange={(mode) => {
                if (mode === 'color' && settings.themeMode !== 'color') {
                  const colors = defaultThemeColorsForMode(settings.themeMode)
                  saveMutation.mutate({
                    themeFamily: 'standard',
                    themeMode: mode,
                    seasonThemeId: null,
                    themeColor: colors.base,
                    themeAccentColor: colors.accent,
                  })
                  return
                }
                saveMutation.mutate({
                  themeFamily: 'standard',
                  themeMode: mode,
                  seasonThemeId: null,
                })
              }}
            />
            {settings.themeFamily === 'standard' && settings.themeMode === 'color' ? (
              <ThemeColorPicker
                value={{
                  base: settings.themeColor ?? { r: 255, g: 255, b: 255 },
                  accent: settings.themeAccentColor ?? { r: 91, g: 164, b: 217 },
                }}
                onChange={handleThemeColorChange}
              />
            ) : null}
            </div>
          </Section>
          <Section title={t('settings.block.seasonTheme')}>
            {settings.themeFamily === 'season' && settings.seasonThemeId ? (
              <SeasonTonePicker
                value={coerceSeasonTone(settings.themeMode)}
                onChange={(tone) => {
                  saveMutation.mutate({
                    themeFamily: 'season',
                    seasonThemeId: settings.seasonThemeId,
                    themeMode: tone,
                  })
                }}
              />
            ) : null}
            <ThemeSeasonPicker
              value={settings.themeFamily === 'season' ? settings.seasonThemeId : null}
              onChange={(id) => {
                saveMutation.mutate({
                  themeFamily: 'season',
                  seasonThemeId: id,
                  themeMode: coerceSeasonTone(settings.themeMode),
                })
              }}
            />
          </Section>
        </>
      ) : null}

      {section === 'privacyCredits' ? (
        <>
          <Section title={t('settings.block.privacy')}>
            <p className="whitespace-pre-line text-sm text-[var(--color-text-muted)]">
              {t('settings.privacyNote')}
            </p>
          </Section>
          <Section title={t('settings.block.credits')}>
            <AppCredits />
          </Section>
          <Section title={t('settings.block.about')}>
            <p className="whitespace-pre-line text-sm text-[var(--color-text-muted)]">
              {t('settings.aboutNote')}
            </p>
          </Section>
        </>
      ) : null}

      {section === 'java' ? (
        <Section>
          <JavaRuntimePanel onMessage={setMessage} />
        </Section>
      ) : null}

      {section === 'resources' ? (
        <>
          <Section title={t('settings.appDirectory')}>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-input)] px-3 py-2.5">
                  <IconBox
                    size={18}
                    stroke={1.6}
                    className="shrink-0 text-[var(--color-text-muted)]"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-[var(--color-text)]">
                    {appDirectory?.configured ?? '…'}
                  </span>
                </div>
                <button
                  type="button"
                  className="grid size-10 shrink-0 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-input)] text-[var(--color-text)] transition hover:bg-[var(--color-hover)] disabled:opacity-50"
                  aria-label={t('settings.appDirectoryBrowse')}
                  disabled={setAppDirectoryMutation.isPending}
                  onClick={() => void browseAppDirectory()}
                >
                  <IconFolderSearch size={18} stroke={1.6} />
                </button>
              </div>
              <p className="text-xs text-[var(--color-text-muted)]">{t('settings.appDirectoryHint')}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  disabled={!appDirectory}
                  onClick={() =>
                    appDirectory && void fledgeApi.paths.open(appDirectory.configured)
                  }
                >
                  {t('settings.openAppDirectory')}
                </Button>
                {appDirectory?.isCustom ? (
                  <Button
                    variant="ghost"
                    disabled={setAppDirectoryMutation.isPending}
                    onClick={() => setAppDirectoryMutation.mutate(null)}
                  >
                    {t('settings.appDirectoryReset')}
                  </Button>
                ) : null}
              </div>
            </div>
          </Section>
          <Section title={t('settings.block.downloads')}>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-[var(--color-text)]">{t('settings.concurrentDownloads')}</span>
              <span className="text-xs text-[var(--color-text-muted)]">
                {t('settings.concurrentDownloadsHint')}
              </span>
              <input
                type="number"
                min={1}
                max={32}
                value={settings.concurrentDownloads}
                onChange={(e) =>
                  saveMutation.mutate({
                    concurrentDownloads: Number(e.target.value) || DEFAULT_CONCURRENT_DOWNLOADS,
                  })
                }
                className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-input)] px-3 py-2 text-[var(--color-text)]"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-[var(--color-text)]">{t('settings.maxWriteConcurrency')}</span>
              <span className="text-xs text-[var(--color-text-muted)]">
                {t('settings.maxWriteConcurrencyHint')}
              </span>
              <input
                type="number"
                min={1}
                max={32}
                value={settings.maxWriteConcurrency}
                onChange={(e) =>
                  saveMutation.mutate({
                    maxWriteConcurrency: Number(e.target.value) || DEFAULT_MAX_WRITE_CONCURRENCY,
                  })
                }
                className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-input)] px-3 py-2 text-[var(--color-text)]"
              />
            </label>
          </Section>
          <Section>
            <BackupPanel
              settings={settings}
              onSave={(partial) => saveMutation.mutate(partial)}
              onMessage={setMessage}
            />
          </Section>
          <Section title={t('settings.block.tutorial')}>
            <div>
              <h3 className="text-sm font-medium text-[var(--color-text)]">
                {t('settings.installTutorial')}
              </h3>
              <p className="mt-1 mb-2 text-xs text-[var(--color-text-muted)]">
                {t('settings.installTutorialHint')}
              </p>
              <Button
                variant="secondary"
                onClick={() => useInstallOnboardingStore.getState().openManual()}
              >
                {t('settings.startInstallTutorial')}
              </Button>
            </div>
          </Section>
          <Section title={t('settings.block.maintenance')}>
            <div>
              <h3 className="text-sm font-medium text-[var(--color-text)]">{t('settings.clearCache')}</h3>
              <p className="mt-1 mb-2 text-xs text-[var(--color-text-muted)]">{t('settings.clearCacheHint')}</p>
              <Button
                onClick={async () => {
                  await fledgeApi.cache.clear()
                  setMessage(t('settings.cacheCleared'))
                }}
              >
                {t('settings.clearCache')}
              </Button>
            </div>
            <div>
              <h3 className="text-sm font-medium text-[var(--color-text)]">{t('settings.factoryReset')}</h3>
              <p className="mt-1 mb-2 text-xs text-[var(--color-text-muted)]">{t('settings.factoryResetHint')}</p>
              <Button
                variant="danger"
                disabled={factoryResetMutation.isPending}
                onClick={() => setFactoryResetOpen(true)}
              >
                {factoryResetMutation.isPending
                  ? t('settings.factoryResetPending')
                  : t('settings.factoryReset')}
              </Button>
            </div>
          </Section>
        </>
      ) : null}
        </div>
      </div>

      <Dialog
        open={restartNoticeOpen}
        title={t('settings.restartNoticeTitle')}
        onClose={() => setRestartNoticeOpen(false)}
        footer={
          <>
            <Button type="button" onClick={() => setRestartNoticeOpen(false)}>
              {t('settings.restartNoticeOk')}
            </Button>
            <Button
              variant="primary"
              type="button"
              onClick={() => {
                void fledgeApi.app.relaunch()
              }}
            >
              {t('settings.restartNoticeRestart')}
            </Button>
          </>
        }
      >
        <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--color-text)]">
          {t('settings.restartNoticeBody')}
        </p>
      </Dialog>
      <ConfirmDialog
        open={resetConfirmOpen}
        title={t('settings.resetAll')}
        body={t('settings.resetAllConfirm')}
        confirmLabel={t('settings.resetAll')}
        pending={resetMutation.isPending}
        onCancel={() => setResetConfirmOpen(false)}
        onConfirm={() => {
          resetMutation.mutate(undefined, {
            onSettled: () => setResetConfirmOpen(false),
          })
        }}
      />
      <Dialog
        open={factoryResetOpen}
        title={
          factoryResetMutation.isPending
            ? t('settings.factoryResetPending')
            : t('settings.factoryResetConfirm')
        }
        onClose={() => {
          if (!factoryResetMutation.isPending) {
            setFactoryResetOpen(false)
            setFactoryResetProgress(null)
          }
        }}
        dismissible={!factoryResetMutation.isPending}
        compact
        footer={
          factoryResetMutation.isPending ? null : (
            <>
              <Button type="button" onClick={() => setFactoryResetOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={() => factoryResetMutation.mutate()}
              >
                {t('settings.factoryReset')}
              </Button>
            </>
          )
        }
      >
        {factoryResetMutation.isPending ? (
          <div className="space-y-2 py-1">
            <p className="text-center text-xs text-[var(--color-text-muted)]">
              {t(factoryResetProgress?.messageKey ?? 'settings.factoryReset.progress.data')}
            </p>
            <ProgressBar percent={factoryResetProgress?.percent ?? 0} />
            <p className="text-center text-[10px] leading-snug text-[var(--color-text-muted)]">
              {t('settings.factoryReset.progressHint')}
            </p>
          </div>
        ) : (
          <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--color-text)]">
            {t('settings.factoryResetConfirmBody')}
          </p>
        )}
      </Dialog>
    </div>
  )
}

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5">
      {title ? <BlockHeading>{title}</BlockHeading> : null}
      {children}
    </section>
  )
}

function BlockHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-semibold tracking-tight text-[var(--color-text)]">{children}</h2>
}

const UI_SCALE_OPTIONS: UiScale[] = ['minimal', 'normal', 'wide']

function UiScalePicker({
  value,
  onChange,
}: {
  value: UiScale
  onChange: (value: UiScale) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="min-w-0">
        <span className="font-medium text-[var(--color-text)]">{t('settings.uiScale')}</span>
        <span className="mt-1 block text-xs text-[var(--color-text-muted)]">{t('settings.uiScaleHint')}</span>
      </span>
      <Select
        className="w-36 shrink-0"
        value={value}
        options={UI_SCALE_OPTIONS.map((option) => ({
          value: option,
          label: t(`settings.uiScale.${option}`),
        }))}
        onChange={(e) => {
          const next = e.currentTarget.value
          if (next === 'minimal' || next === 'normal' || next === 'wide') onChange(next)
        }}
      />
    </div>
  )
}

/** 540p 付近では UI が窮屈なのでコンパクトに寄せる */
function launcherWindowPatch(
  launcherWindowWidth: number,
  launcherWindowHeight: number,
): Partial<Settings> {
  const patch: Partial<Settings> = { launcherWindowWidth, launcherWindowHeight }
  if (launcherWindowHeight <= 560 || launcherWindowWidth <= 1000) {
    patch.uiScale = 'minimal'
  }
  return patch
}

function matchWindowPreset(width: number, height: number, presets: readonly WindowSizePreset[]) {
  return presets.find((p) => p.width === width && p.height === height) ?? null
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
  presets = GAME_WINDOW_SIZE_PRESETS,
  disabled,
  onCommitWidth,
  onCommitHeight,
  onCommitSize,
}: {
  title: string
  hint: string
  width: number
  height: number
  minWidth: number
  maxWidth: number
  minHeight: number
  maxHeight: number
  presets?: readonly WindowSizePreset[]
  disabled?: boolean
  onCommitWidth: (width: number) => void
  onCommitHeight: (height: number) => void
  onCommitSize: (width: number, height: number) => void
}) {
  const { t } = useTranslation()
  const [widthText, setWidthText] = useState(String(width))
  const [heightText, setHeightText] = useState(String(height))
  const matched = matchWindowPreset(width, height, presets)

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

  const applyPreset = (id: string) => {
    const preset = presets.find((p) => p.id === id)
    if (!preset) return
    const nextW = Math.min(maxWidth, Math.max(minWidth, preset.width))
    const nextH = Math.min(maxHeight, Math.max(minHeight, preset.height))
    setWidthText(String(nextW))
    setHeightText(String(nextH))
    if (nextW !== width || nextH !== height) onCommitSize(nextW, nextH)
  }

  const presetOptions = [
    ...presets.map((p) => ({ value: p.id, label: p.id })),
    { value: 'custom', label: t('settings.windowPresetCustom') },
  ]

  return (
    <div>
      <h3 className="mb-1 text-sm font-medium text-[var(--color-text)]">{title}</h3>
      <p className="mb-3 text-xs text-[var(--color-text-muted)]">{hint}</p>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_minmax(8rem,10rem)]">
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
        <Select
          label={t('settings.windowPreset')}
          value={matched?.id ?? 'custom'}
          disabled={disabled}
          options={presetOptions}
          onChange={(e) => {
            const id = e.currentTarget.value
            if (id === 'custom') return
            applyPreset(id)
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
