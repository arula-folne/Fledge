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
import {
  mergeMinecraftOptionsFile,
} from '../minecraft/minecraftInitialOptions.js'
import type { SettingsStore } from '../settings/SettingsStore.js'
import type { SessionJoinProxy } from '../auth/SessionJoinProxy.js'
import type { SkinApplier } from '../skins/SkinApplier.js'

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

      if (profile.minecraftInitialSettingsSeeded && !profile.minecraftInitialSettingsApplied) {
        try {
          await mergeMinecraftOptionsFile(instanceDir, profile.pendingMinecraftOptions ?? {})
          await this.deps.instances.update(profileId, {
            minecraftInitialSettingsApplied: true,
            pendingMinecraftOptions: {},
          })
        } catch (err) {
          this.deps.logger.warn(
            'launcher',
            `Failed to apply Minecraft initial options: ${err instanceof Error ? err.message : String(err)}`,
          )
        }
      }

      this.emitPhase(sessionId, 'spawn', 'launch.phase.spawn')
      this.emitState(session, 'launching')
      const settings = await this.deps.settings.get()
      const child = await this.deps.minecraft.launchGame({
        profile,
        instanceDir,
        versionId,
        javaPath,
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
      this.emitState(session, 'running')
      this.emitPhase(sessionId, 'running', 'launch.phase.running')
      child.stdout?.on('data', (buf: Buffer) => {
        const text = buf.toString('utf8')
        this.deps.logger.info('game', text.trimEnd())
        this.maybeRefreshSession(session, text)
      })
      child.stderr?.on('data', (buf: Buffer) => {
        const text = buf.toString('utf8')
        this.deps.logger.warn('game', text.trimEnd())
        this.maybeRefreshSession(session, text)
      })
      child.on('error', (err) => {
        const current = this.sessions.get(sessionId)
        if (!current) return
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
    child.kill()
    this.deps.logger.info('launcher', `Game process kill requested (${session?.id})`)
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
