import { randomUUID } from 'node:crypto'
import type { ChildProcess } from 'node:child_process'
import type {
  LaunchPhaseEvent,
  LaunchStateEvent,
  ProgressEvent,
} from '@fledge/shared'
import type { AuthProvider } from '../auth/AuthProvider.js'
import { AuthError } from '../auth/authTypes.js'
import type { DownloadQueue } from '../download/DownloadQueue.js'
import type { InstanceStore } from '../instances/InstanceStore.js'
import type { JavaManager } from '../java/JavaManager.js'
import type { Logger } from '../logging/Logger.js'
import type { MinecraftService } from '../minecraft/MinecraftService.js'
import { ensureMinecraftInitialSettingsApplied, MINECRAFT_INITIAL_SETTINGS_APPLY_GENERATION, mergeMinecraftDebugOverlayFile, mergeMinecraftOptionsFile, verifyMinecraftOptionsFile } from '../minecraft/minecraftInitialOptions.js'
import type { SettingsStore } from '../settings/SettingsStore.js'
import type { SessionJoinProxy } from '../auth/SessionJoinProxy.js'
import type { SkinApplier } from '../skins/SkinApplier.js'

/**
 * タイトル画面到達の目安（この時点で Forge 等が options.txt を一度書き換えたあとのことが多い）。
 * Options 本体はそれより前に読まれるため、ここで直した内容は「次回起動」から確実に効く。
 * 起動中の上書きに対しては、到達までのポーリングで再書き込みしてレースに勝つ。
 *
 * 「Setting user:」「Reloading ResourceManager」は Fabric の Mod 不整合などで
 * タイトル未到達でも出るため使わない（誤ってガード停止→誤コミットの原因になる）。
 */
const TITLE_SCREEN_LOG_RE =
  /Sound engine started|OpenAL initialized|Turning off relative mouse|Startup done in /i

/** 初期設定を「反映済み」にする前にタイトル到達後ゲームが生きているべき最短時間 */
const INITIAL_SETTINGS_COMMIT_AFTER_MS = 8_000

/** Forge 等が起動直後に options.txt を潰す場合に備えた再適用間隔 */
const INITIAL_SETTINGS_GUARD_MS = 300

export type LaunchEventBus = {
  emitProgress: (e: ProgressEvent) => void
  emitPhase: (e: LaunchPhaseEvent) => void
  emitState: (e: LaunchStateEvent) => void
}

type Session = {
  id: string
  profileId: string
  accountId: string
  abort: AbortController
  child?: ChildProcess
  state: LaunchStateEvent['state']
  /** 初回 options 適用後、タイトル到達＋十分な起動成功を待って applied を立てる */
  initialSettingsPendingCommit?: boolean
  initialSettingsInstanceDir?: string
  initialSettingsOptions?: Record<string, string>
  initialSettingsOverlay?: Record<string, string>
  initialSettingsTitleSeen?: boolean
  initialSettingsGuardTimer?: ReturnType<typeof setInterval>
  runningSinceMs?: number
}

export class LaunchOrchestrator {
  private sessions = new Map<string, Session>()

  constructor(
    private readonly deps: {
      auth: AuthProvider
      instances: InstanceStore
      settings: SettingsStore
      java: JavaManager
      minecraft: MinecraftService
      queue: DownloadQueue
      logger: Logger
      events: LaunchEventBus
      sessionProxy: SessionJoinProxy
      skinApplier: SkinApplier
    },
  ) {}

  /** 後方互換: いずれかのセッション状態（優先: preparing > launching > running > idle） */
  getState(): LaunchStateEvent['state'] {
    const states = [...this.sessions.values()].map((s) => s.state)
    if (states.includes('preparing')) return 'preparing'
    if (states.includes('launching')) return 'launching'
    if (states.includes('running')) return 'running'
    if (states.includes('error')) return 'error'
    return 'idle'
  }

  listActiveSessions(): Array<{ sessionId: string; profileId: string; accountId: string; state: string }> {
    return [...this.sessions.values()].map((s) => ({
      sessionId: s.id,
      profileId: s.profileId,
      accountId: s.accountId,
      state: s.state,
    }))
  }

  /**
   * ゲーム起動なしで Java・クライアント／ライブラリ／アセットを準備する。
   * インスタンス作成直後にライブラリ画面の進捗へ出す用。
   */
  async prepare(profileId: string): Promise<{ sessionId: string }> {
    for (const s of this.sessions.values()) {
      if (
        s.profileId === profileId &&
        ['preparing', 'launching', 'running'].includes(s.state)
      ) {
        throw Object.assign(new Error('instance already busy'), {
          messageKey: 'launch.error.alreadyRunning',
        })
      }
    }

    const profile = await this.deps.instances.get(profileId)
    if (!profile) {
      throw Object.assign(new Error('no instance'), { messageKey: 'launch.error.noInstance' })
    }

    const sessionId = randomUUID()
    const abort = new AbortController()
    const session: Session = {
      id: sessionId,
      profileId,
      accountId: '',
      abort,
      state: 'preparing',
    }
    this.sessions.set(sessionId, session)
    this.emitState(session, 'preparing')

    try {
      this.emitPhase(sessionId, 'java', 'launch.phase.java')
      this.deps.events.emitProgress({
        scope: 'launch',
        sessionId,
        current: 1,
        total: 2,
        percent: 10,
        messageKey: 'launch.phase.java',
      })
      const javaPath = await this.deps.java.ensureJava(profile.minecraftVersion, sessionId)
      if (abort.signal.aborted) {
        throw Object.assign(new Error('cancelled'), { messageKey: 'download.cancelled' })
      }

      this.emitPhase(sessionId, 'install', 'launch.phase.install')
      this.deps.events.emitProgress({
        scope: 'launch',
        sessionId,
        current: 2,
        total: 2,
        percent: 40,
        messageKey: 'launch.phase.install',
      })
      const instanceDir = this.deps.instances.instanceDir(profile.id)
      await this.deps.minecraft.ensureInstalled(profile, instanceDir, sessionId, javaPath)
      if (abort.signal.aborted) {
        throw Object.assign(new Error('cancelled'), { messageKey: 'download.cancelled' })
      }

      // 準備時点でも初期設定を揃えておく（大量 Mod 導入後の options 欠落対策）
      await this.ensureInitialSettings(profile.id, instanceDir, profile.minecraftVersion)

      this.deps.events.emitProgress({
        scope: 'launch',
        sessionId,
        current: 2,
        total: 2,
        percent: 100,
        messageKey: 'library.prepareDone',
      })
      this.emitState(session, 'idle')
      this.sessions.delete(sessionId)
      return { sessionId }
    } catch (err) {
      const messageKey =
        err && typeof err === 'object' && 'messageKey' in err
          ? String((err as { messageKey: string }).messageKey)
          : 'launch.error.generic'
      this.deps.logger.error('launcher', `Prepare failed: ${messageKey}`)
      this.emitState(session, 'error', messageKey)
      this.sessions.delete(sessionId)
      throw Object.assign(err instanceof Error ? err : new Error(String(err)), { messageKey })
    }
  }

  /**
   * 最後に使ったインスタンスの Java・本体・ネイティブを裏で整える。
   * 起動ボタンのセッションは作らない。
   */
  async warmup(profileId: string): Promise<void> {
    const profile = await this.deps.instances.get(profileId)
    if (!profile) return
    const sessionId = `warmup-${profileId}`
    const instanceDir = this.deps.instances.instanceDir(profile.id)
    const javaPath = await this.deps.java.ensureJava(profile.minecraftVersion, sessionId)
    await this.deps.minecraft.ensureInstalled(profile, instanceDir, sessionId, javaPath)
    await this.deps.sessionProxy.ensureStarted().catch((err) => {
      this.deps.logger.warn(
        'auth',
        `Session proxy warmup skipped: ${err instanceof Error ? err.message : String(err)}`,
      )
    })
    this.deps.logger.info('launcher', `Warmed launch cache for ${profileId}`)
  }

  async start(
    profileId: string,
    opts?: { accountId?: string },
  ): Promise<{ sessionId: string }> {
    for (const s of this.sessions.values()) {
      if (
        s.profileId === profileId &&
        ['preparing', 'launching', 'running'].includes(s.state)
      ) {
        throw Object.assign(new Error('instance already running'), {
          messageKey: 'launch.error.alreadyRunning',
        })
      }
    }

    const profile = await this.deps.instances.get(profileId)
    if (!profile) {
      throw Object.assign(new Error('no instance'), { messageKey: 'launch.error.noInstance' })
    }

    const account =
      opts?.accountId != null
        ? (await this.deps.auth.listAccounts()).find((a) => a.id === opts.accountId)
        : await this.deps.auth.getSession()
    if (!account) {
      throw new AuthError('not_logged_in', 'auth.error.notLoggedIn')
    }
    const accountId = account.id

    const sessionId = randomUUID()
    const abort = new AbortController()
    const session: Session = {
      id: sessionId,
      profileId,
      accountId,
      abort,
      state: 'preparing',
    }
    this.sessions.set(sessionId, session)
    this.emitState(session, 'preparing')

    try {
      this.emitPhase(sessionId, 'auth', 'launch.phase.auth')
      this.deps.events.emitProgress({
        scope: 'launch',
        sessionId,
        current: 1,
        total: 4,
        messageKey: 'launch.phase.auth',
      })

      const credentialsPromise = this.deps.auth.getLaunchCredentials(accountId)
      void this.deps.skinApplier.applySelected(accountId).catch((err) => {
        this.deps.logger.warn(
          'launcher',
          `Skin apply skipped: ${err instanceof Error ? err.message : String(err)}`,
        )
      })
      const sessionHostPromise = this.deps.sessionProxy.ensureStarted().catch((err) => {
        this.deps.logger.warn(
          'auth',
          `Session proxy failed to start: ${err instanceof Error ? err.message : String(err)}`,
        )
        return undefined
      })

      this.emitPhase(sessionId, 'java', 'launch.phase.java')
      this.deps.events.emitProgress({
        scope: 'launch',
        sessionId,
        current: 2,
        total: 4,
        messageKey: 'launch.phase.java',
      })
      const instanceDir = this.deps.instances.instanceDir(profile.id)
      const javaPromise = this.deps.java.ensureJava(profile.minecraftVersion, sessionId)

      const [credentials, javaPath, sessionHost] = await Promise.all([
        credentialsPromise,
        javaPromise,
        sessionHostPromise,
      ])
      if (abort.signal.aborted) throw Object.assign(new Error('cancelled'), { messageKey: 'download.cancelled' })

      this.emitPhase(sessionId, 'install', 'launch.phase.install')
      this.deps.events.emitProgress({
        scope: 'launch',
        sessionId,
        current: 3,
        total: 4,
        messageKey: 'launch.phase.install',
      })
      const versionId = await this.deps.minecraft.ensureInstalled(
        profile,
        instanceDir,
        sessionId,
        javaPath,
      )
      if (abort.signal.aborted) throw Object.assign(new Error('cancelled'), { messageKey: 'download.cancelled' })

      // 導入後の version JSON（javaVersion）に合わせて Java を取り直す
      const resolvedJavaPath = await this.deps.java.ensureJava(profile.minecraftVersion, sessionId)

      const settings = await this.deps.settings.get()

      // 起動直前に最新プロファイルで初期設定を強制反映（Modpack / 大量 Mod で消えても再適用）
      const initial = await this.ensureInitialSettings(
        profileId,
        instanceDir,
        profile.minecraftVersion,
      )
      if (initial.neededCommit) {
        session.initialSettingsPendingCommit = true
        session.initialSettingsInstanceDir = instanceDir
        session.initialSettingsOptions = initial.options
        session.initialSettingsOverlay = initial.overlay
      }

      this.emitPhase(sessionId, 'spawn', 'launch.phase.spawn')
      this.emitState(session, 'launching')
      const child = await this.deps.minecraft.launchGame({
        profile,
        instanceDir,
        versionId,
        javaPath: resolvedJavaPath,
        credentials,
        display: {
          fullscreen: settings.gameFullscreen,
          width: settings.gameWindowWidth,
          height: settings.gameWindowHeight,
        },
        fledgeDiscordRpc: settings.discordRichPresence,
        sessionHost,
      })
      session.child = child
      session.runningSinceMs = Date.now()
      this.emitState(session, 'running')
      this.emitPhase(sessionId, 'running', 'launch.phase.running')
      if (session.initialSettingsPendingCommit) {
        this.startInitialSettingsGuard(session)
      }
      child.stdout?.on('data', (buf: Buffer) => {
        const text = buf.toString('utf8')
        this.deps.logger.info('game', text.trimEnd())
        this.maybeRefreshSession(session, text)
        this.maybeHandleInitialSettingsTitle(session, text)
      })
      child.stderr?.on('data', (buf: Buffer) => {
        const text = buf.toString('utf8')
        this.deps.logger.warn('game', text.trimEnd())
        this.maybeRefreshSession(session, text)
        this.maybeHandleInitialSettingsTitle(session, text)
      })
      child.on('error', (err) => {
        const current = this.sessions.get(sessionId)
        if (!current) return
        this.stopInitialSettingsGuard(current)
        this.deps.logger.error(
          'launcher',
          `Game process failed to start: ${err instanceof Error ? err.message : String(err)}`,
        )
        this.emitState(current, 'error', 'launch.error.generic')
        this.sessions.delete(sessionId)
      })
      child.on('exit', (code) => {
        const current = this.sessions.get(sessionId)
        if (!current) return
        this.stopInitialSettingsGuard(current)
        void this.finalizeInitialSettingsCommit(current, code ?? 0)
        if (code && code !== 0) {
          this.deps.logger.error('launcher', `Minecraft exited with code ${code}`)
          this.emitState(current, 'error', 'launch.error.gameExited')
        } else {
          current.state = 'exited'
          this.deps.events.emitState({
            sessionId,
            profileId,
            accountId,
            state: 'exited',
            code: code ?? 0,
          })
        }
        this.sessions.delete(sessionId)
      })
      const playedAt = new Date().toISOString()
      await this.deps.settings.set({
        lastPlayedInstanceId: profileId,
        selectedInstanceId: profileId,
      })
      await this.deps.instances.update(profileId, { lastPlayedAt: playedAt })
      this.deps.events.emitProgress({
        scope: 'launch',
        sessionId,
        current: 4,
        total: 4,
        percent: 100,
        messageKey: 'launch.phase.running',
      })

      return { sessionId }
    } catch (err) {
      const messageKey =
        err instanceof AuthError
          ? err.messageKey
          : err && typeof err === 'object' && 'messageKey' in err
            ? String((err as { messageKey: string }).messageKey)
            : 'launch.error.generic'
      this.deps.logger.error(
        'launcher',
        `Launch failed: ${messageKey}: ${err instanceof Error ? err.message : String(err)}`,
      )
      this.emitState(session, 'error', messageKey)
      this.sessions.delete(sessionId)
      throw Object.assign(err instanceof Error ? err : new Error(String(err)), { messageKey })
    }
  }

  cancel(sessionId?: string): void {
    const session = sessionId
      ? this.sessions.get(sessionId)
      : [...this.sessions.values()].find((s) => s.state === 'preparing')
    if (!session || session.state !== 'preparing') return
    session.abort.abort()
    this.deps.queue.cancelBySession(session.id)
    this.deps.logger.info('launcher', 'Launch cancelled')
    this.emitState(session, 'idle')
    this.sessions.delete(session.id)
  }

  kill(sessionId?: string): void {
    const session = sessionId
      ? this.sessions.get(sessionId)
      : [...this.sessions.values()].find((s) => s.state === 'running' || s.child)
    const child = session?.child
    if (!child) return
    if (session) this.stopInitialSettingsGuard(session)
    child.kill()
    this.deps.logger.info('launcher', `Game process kill requested (${session?.id})`)
  }

  /** 進行中の導入・起動・ゲームをすべて止める（完全リセット用） */
  stopAll(): void {
    for (const session of [...this.sessions.values()]) {
      session.abort.abort()
      this.deps.queue.cancelBySession(session.id)
      this.stopInitialSettingsGuard(session)
      try {
        session.child?.kill()
      } catch {
        /* ignore */
      }
      this.emitState(session, 'idle')
      this.sessions.delete(session.id)
    }
  }

  private async ensureInitialSettings(
    profileId: string,
    instanceDir: string,
    fallbackMinecraftVersion: string,
  ): Promise<{
    neededCommit: boolean
    options: Record<string, string>
    overlay: Record<string, string>
  }> {
    const empty = { neededCommit: false, options: {}, overlay: {} }
    const latest = await this.deps.instances.get(profileId)
    if (!latest?.minecraftInitialSettingsSeeded) {
      return empty
    }
    try {
      const settings = await this.deps.settings.get()
      const committed =
        Boolean(latest.minecraftInitialSettingsApplied) &&
        (latest.minecraftInitialSettingsApplyGeneration ?? 0) >=
          MINECRAFT_INITIAL_SETTINGS_APPLY_GENERATION
      const result = await ensureMinecraftInitialSettingsApplied(
        instanceDir,
        settings.minecraftInitialSettings,
        latest.minecraftVersion || fallbackMinecraftVersion,
        committed,
      )
      if (result.neededCommit) {
        this.deps.logger.info(
          'launcher',
          `Minecraft initial options ensured for ${profileId} (${Object.keys(result.options).length} keys)`,
        )
      }
      return {
        neededCommit: result.neededCommit,
        options: result.options,
        overlay: result.overlay,
      }
    } catch (err) {
      this.deps.logger.warn(
        'launcher',
        `Failed to apply Minecraft initial options: ${err instanceof Error ? err.message : String(err)}`,
      )
      return empty
    }
  }

  /** Forge 等が起動中に options.txt を書き換えても、タイトル到達まで監視して戻す */
  private startInitialSettingsGuard(session: Session): void {
    this.stopInitialSettingsGuard(session)
    const instanceDir = session.initialSettingsInstanceDir
    const options = session.initialSettingsOptions
    const overlay = session.initialSettingsOverlay
    if (!instanceDir || !options) return

    session.initialSettingsGuardTimer = setInterval(() => {
      void (async () => {
        if (!session.initialSettingsPendingCommit || session.initialSettingsTitleSeen) return
        try {
          if (await verifyMinecraftOptionsFile(instanceDir, options)) return
          await mergeMinecraftOptionsFile(instanceDir, options)
          if (overlay && Object.keys(overlay).length > 0) {
            await mergeMinecraftDebugOverlayFile(instanceDir, overlay)
          }
          this.deps.logger.info(
            'launcher',
            `Re-applied Minecraft initial options during startup (${session.profileId})`,
          )
        } catch (err) {
          this.deps.logger.warn(
            'launcher',
            `Initial options guard failed: ${err instanceof Error ? err.message : String(err)}`,
          )
        }
      })()
    }, INITIAL_SETTINGS_GUARD_MS)
  }

  private stopInitialSettingsGuard(session: Session): void {
    if (session.initialSettingsGuardTimer) {
      clearInterval(session.initialSettingsGuardTimer)
      session.initialSettingsGuardTimer = undefined
    }
  }

  private maybeHandleInitialSettingsTitle(session: Session, text: string): void {
    if (!session.initialSettingsPendingCommit || session.initialSettingsTitleSeen) return
    if (!TITLE_SCREEN_LOG_RE.test(text)) return
    session.initialSettingsTitleSeen = true
    this.stopInitialSettingsGuard(session)
    void this.reapplyInitialSettingsAtTitle(session)
  }

  /** タイトル到達時に最終書き込み（Forge の初回上書き後）。メモリ上の設定は次回起動から確実に効く */
  private async reapplyInitialSettingsAtTitle(session: Session): Promise<void> {
    const instanceDir = session.initialSettingsInstanceDir
    const options = session.initialSettingsOptions
    const overlay = session.initialSettingsOverlay ?? {}
    if (!instanceDir || !options) return
    try {
      await mergeMinecraftOptionsFile(instanceDir, options)
      if (Object.keys(overlay).length > 0) {
        await mergeMinecraftDebugOverlayFile(instanceDir, overlay)
      }
      const ok = await verifyMinecraftOptionsFile(instanceDir, options)
      this.deps.logger.info(
        'launcher',
        `Minecraft initial options ${ok ? 'locked' : 'written'} at title screen for ${session.profileId}`,
      )
    } catch (err) {
      this.deps.logger.warn(
        'launcher',
        `Failed to lock Minecraft initial options at title: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  private async finalizeInitialSettingsCommit(session: Session, exitCode: number): Promise<void> {
    if (!session.initialSettingsPendingCommit) return
    const ranMs = session.runningSinceMs != null ? Date.now() - session.runningSinceMs : 0
    // タイトル未到達・異常終了・短命起動ではコミットしない（次回起動で再適用）
    const baseOk =
      exitCode === 0 &&
      session.initialSettingsTitleSeen === true &&
      ranMs >= INITIAL_SETTINGS_COMMIT_AFTER_MS
    if (!baseOk) {
      this.deps.logger.info(
        'launcher',
        `Defer Minecraft initial settings commit for ${session.profileId} (exit=${exitCode}, title=${Boolean(session.initialSettingsTitleSeen)}, ranMs=${ranMs})`,
      )
      return
    }
    try {
      const instanceDir = session.initialSettingsInstanceDir
      const options = session.initialSettingsOptions
      if (instanceDir && options) {
        await mergeMinecraftOptionsFile(instanceDir, options)
        if (session.initialSettingsOverlay && Object.keys(session.initialSettingsOverlay).length > 0) {
          await mergeMinecraftDebugOverlayFile(instanceDir, session.initialSettingsOverlay)
        }
        const verified = await verifyMinecraftOptionsFile(instanceDir, options)
        if (!verified) {
          this.deps.logger.info(
            'launcher',
            `Defer Minecraft initial settings commit for ${session.profileId} (options verify failed)`,
          )
          return
        }
      }
      await this.deps.instances.update(session.profileId, {
        minecraftInitialSettingsApplied: true,
        minecraftInitialSettingsApplyGeneration: MINECRAFT_INITIAL_SETTINGS_APPLY_GENERATION,
        pendingMinecraftOptions: {},
        pendingMinecraftDebugOverlay: {},
      })
      this.deps.logger.info(
        'launcher',
        `Committed Minecraft initial settings for ${session.profileId}`,
      )
    } catch (err) {
      this.deps.logger.warn(
        'launcher',
        `Failed to commit Minecraft initial settings: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  private emitPhase(sessionId: string, phase: LaunchPhaseEvent['phase'], messageKey: string): void {
    this.deps.events.emitPhase({ sessionId, phase, messageKey })
  }

  private emitState(
    session: Session,
    state: LaunchStateEvent['state'],
    errorMessageKey?: string,
  ): void {
    session.state = state
    this.deps.events.emitState({
      sessionId: session.id,
      profileId: session.profileId,
      accountId: session.accountId,
      state,
      errorMessageKey,
    })
  }

  private lastSessionRefreshAt = new Map<string, number>()

  private maybeRefreshSession(session: Session, text: string): void {
    if (!/invalid session/i.test(text)) return
    const now = Date.now()
    const prev = this.lastSessionRefreshAt.get(session.id) ?? 0
    if (now - prev < 15_000) return
    this.lastSessionRefreshAt.set(session.id, now)
    void this.deps.auth
      .ensureCredentials(session.accountId, { force: true })
      .then(() => {
        this.deps.logger.info(
          'auth',
          '無効なセッションを検知したためトークンを更新しました。サーバーに再接続してください（Fledge の再起動は不要です）。',
        )
      })
      .catch((err) => {
        this.deps.logger.warn(
          'auth',
          `Session refresh after invalid session failed: ${err instanceof Error ? err.message : String(err)}`,
        )
      })
  }
}
