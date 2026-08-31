import { randomUUID } from 'node:crypto'
import type { ChildProcess } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
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
import { ensureMinecraftInitialSettingsApplied, MINECRAFT_INITIAL_SETTINGS_APPLY_GENERATION, applyMinecraftInitialPatchToInstance, mergeMinecraftDebugOverlayFile, mergeMinecraftOptionsFile, snapshotMinecraftDebugOverlay, snapshotMinecraftInitialOptions, verifyMinecraftOptionsFile } from '../minecraft/minecraftInitialOptions.js'
import type { SettingsStore } from '../settings/SettingsStore.js'
import type { SessionJoinProxy } from '../auth/SessionJoinProxy.js'
import type { SkinApplier } from '../skins/SkinApplier.js'

/**
 * タイトル画面到達の目安。
 * OpenAL / Sound engine は Options.load より前に出るため使わない（ガード停止が早すぎて潰される）。
 * Options 本体はタイトルより前に読まれるため、spawn 前の書き込み＋遅延ガードで初回を守り、
 * タイトル到達時の再書き込みは「次回起動」を確実にする。
 *
 * 初期設定の適用タイミング・applied の立て方は不変条件。
 * 変更する場合は必ずユーザー確認（.cursor/rules/minecraft-initial-settings-launch.mdc）。
 */
const TITLE_SCREEN_LOG_RE =
  /Turning off relative mouse|Startup done in |Loading Music|Sound engine started|OpenAL initialized|Finished loading/i

/** 製品版は stdout にログが出ないため latest.log を定期ポーリングする */
const INITIAL_SETTINGS_LOG_POLL_MS = 2_000
/** タイトル未検出時の applied 確定フォールバック（primed 済み・起動中に潰されていない） */
const INITIAL_SETTINGS_COMMIT_MIN_RUNTIME_MS = 12_000

/** 連続書き換えではなく、遅延ワンショットで再適用する（製品版でもレースしにくい） */
const INITIAL_SETTINGS_GUARD_AT_MS = [3_000, 7_000, 12_000, 20_000] as const

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
  /** 初回 options 適用後、タイトルでディスクが健全なら終了時に applied を立てる */
  initialSettingsPendingCommit?: boolean
  initialSettingsInstanceDir?: string
  initialSettingsOptions?: Record<string, string>
  initialSettingsOverlay?: Record<string, string>
  initialSettingsTitleSeen?: boolean
  /**
   * 起動中に options.txt を直した（ガード／タイトル再書き込み）。
   * true のときは今セッションではゲームが古い内容を読んでいる可能性があるので applied にしない。
   */
  initialSettingsRewroteDuringSession?: boolean
  /** タイトル到達時、再書き込みなしでパッチが一致していた */
  initialSettingsCleanAtTitle?: boolean
  /** spawn 直前の verify が通った（この起動で Options.load が読むべき内容） */
  initialSettingsVerifiedAtSpawn?: boolean
  initialSettingsGuardTimers?: Array<ReturnType<typeof setTimeout>>
  initialSettingsLogPollTimer?: ReturnType<typeof setInterval>
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

      // 初期設定の options.txt 適用は初回「起動」直前のみ（prepare では触らない）

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

      // 初回起動直前: 未適用なら今の初期設定を反映。空パッチは終了時 applied、ありはタイトル健全時のみ
      const initial = await this.ensureInitialSettings(profileId, instanceDir)
      if (initial.firstLaunchPass) {
        session.initialSettingsPendingCommit = true
        session.initialSettingsInstanceDir = instanceDir
        session.initialSettingsOptions = initial.options
        session.initialSettingsOverlay = initial.overlay
      }

      // Options.load より前にパッチがあればファイルを確定（書き込み成功だけでは applied にしない）
      if (Object.keys(initial.options).length > 0) {
        await applyMinecraftInitialPatchToInstance(
          instanceDir,
          initial.options,
          initial.overlay,
        )
        const ok = await verifyMinecraftOptionsFile(instanceDir, initial.options)
        if (!ok) {
          throw Object.assign(new Error('Minecraft options.txt was not ready before launch'), {
            messageKey: 'launch.error.generic',
          })
        }
        session.initialSettingsVerifiedAtSpawn = true
        this.deps.logger.info(
          'launcher',
          `Pre-spawn options verified at ${path.join(instanceDir, 'options.txt')}`,
        )
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
      // ガードは書き込みがあるときだけ（空パッチの初回は不要）
      if (session.initialSettingsPendingCommit && Object.keys(initial.options).length > 0) {
        this.startInitialSettingsGuard(session)
        this.startInitialSettingsLogPoller(session)
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
        this.stopInitialSettingsWatchers(current)
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
        this.stopInitialSettingsWatchers(current)
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
    if (session) this.stopInitialSettingsWatchers(session)
    child.kill()
    this.deps.logger.info('launcher', `Game process kill requested (${session?.id})`)
  }

  /** 進行中の導入・起動・ゲームをすべて止める（完全リセット用） */
  stopAll(): void {
    for (const session of [...this.sessions.values()]) {
      session.abort.abort()
      this.deps.queue.cancelBySession(session.id)
      this.stopInitialSettingsWatchers(session)
      try {
        session.child?.kill()
      } catch {
        /* ignore */
      }
      this.emitState(session, 'idle')
      this.sessions.delete(session.id)
    }
  }

  /** 指定インスタンスに紐づく起動セッションを停止する（インスタンス削除用） */
  stopForProfile(profileId: string): void {
    for (const session of [...this.sessions.values()]) {
      if (session.profileId !== profileId) continue
      session.abort.abort()
      this.deps.queue.cancelBySession(session.id)
      this.stopInitialSettingsWatchers(session)
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
  ): Promise<{
    neededCommit: boolean
    /** 未適用の初回起動パス（空パッチは終了時 applied、ありはタイトル健全時） */
    firstLaunchPass: boolean
    options: Record<string, string>
    overlay: Record<string, string>
  }> {
    const empty = { neededCommit: false, firstLaunchPass: false, options: {}, overlay: {} }
    const latest = await this.deps.instances.get(profileId)
    if (!latest?.minecraftInitialSettingsSeeded) {
      return empty
    }
    try {
      // 現行世代で applied なら二度とグローバル設定を拾わない（世代不足は一度だけ再適用）
      const generation = latest.minecraftInitialSettingsApplyGeneration ?? 0
      const committed =
        Boolean(latest.minecraftInitialSettingsApplied) &&
        generation >= MINECRAFT_INITIAL_SETTINGS_APPLY_GENERATION
      if (committed) {
        return empty
      }

      // 未適用（＝まだ初回起動を完了していない）: 起動時点の最新初期設定を使う
      const settings = await this.deps.settings.get()
      const mcVersion = latest.minecraftVersion
      const options = snapshotMinecraftInitialOptions(
        settings.minecraftInitialSettings,
        mcVersion,
        settings.locale,
      )
      const overlay = snapshotMinecraftDebugOverlay(
        settings.minecraftInitialSettings,
        mcVersion,
      )

      await this.deps.instances.update(profileId, {
        pendingMinecraftOptions: options,
        pendingMinecraftDebugOverlay: overlay,
        minecraftInitialSettingsPrimed: false,
      })

      const result = await ensureMinecraftInitialSettingsApplied(
        instanceDir,
        options,
        overlay,
        false,
      )
      if (result.neededCommit) {
        this.deps.logger.info(
          'launcher',
          `Minecraft initial options ensured for ${profileId} at ${path.join(instanceDir, 'options.txt')} (${Object.keys(result.options).length} keys)`,
        )
      }
      return {
        neededCommit: result.neededCommit,
        firstLaunchPass: true,
        options: result.options,
        overlay: result.overlay,
      }
    } catch (err) {
      this.deps.logger.warn(
        'launcher',
        `Failed to apply Minecraft initial options: ${err instanceof Error ? err.message : String(err)}`,
      )
      throw err
    }
  }

  /** Forge 等が起動中に options.txt をディスク上で潰した場合の整合用（次回 Options.load 向け）。起動中メモリへの即時反映は期待しない */
  private startInitialSettingsGuard(session: Session): void {
    this.stopInitialSettingsGuard(session)
    const instanceDir = session.initialSettingsInstanceDir
    const options = session.initialSettingsOptions
    const overlay = session.initialSettingsOverlay
    if (!instanceDir || !options) return

    session.initialSettingsGuardTimers = INITIAL_SETTINGS_GUARD_AT_MS.map((delayMs) =>
      setTimeout(() => {
        void (async () => {
          if (!session.initialSettingsPendingCommit || session.initialSettingsTitleSeen) return
          try {
            await this.pollTitleFromLatestLog(session)
            if (session.initialSettingsTitleSeen) return
            if (await verifyMinecraftOptionsFile(instanceDir, options)) return
            await mergeMinecraftOptionsFile(instanceDir, options)
            if (overlay && Object.keys(overlay).length > 0) {
              await mergeMinecraftDebugOverlayFile(instanceDir, overlay)
            }
            session.initialSettingsRewroteDuringSession = true
            this.deps.logger.info(
              'launcher',
              `Re-applied Minecraft initial options during startup (${session.profileId}, +${delayMs}ms)`,
            )
          } catch (err) {
            this.deps.logger.warn(
              'launcher',
              `Initial options guard failed: ${err instanceof Error ? err.message : String(err)}`,
            )
          }
        })()
      }, delayMs),
    )
  }

  private stopInitialSettingsGuard(session: Session): void {
    for (const timer of session.initialSettingsGuardTimers ?? []) {
      clearTimeout(timer)
    }
    session.initialSettingsGuardTimers = undefined
  }

  /** 製品版向け: latest.log を定期読み取りしてタイトル到達を検出する */
  private startInitialSettingsLogPoller(session: Session): void {
    this.stopInitialSettingsLogPoller(session)
    session.initialSettingsLogPollTimer = setInterval(() => {
      void this.pollTitleFromLatestLog(session)
    }, INITIAL_SETTINGS_LOG_POLL_MS)
  }

  private stopInitialSettingsLogPoller(session: Session): void {
    if (session.initialSettingsLogPollTimer) {
      clearInterval(session.initialSettingsLogPollTimer)
      session.initialSettingsLogPollTimer = undefined
    }
  }

  private stopInitialSettingsWatchers(session: Session): void {
    this.stopInitialSettingsGuard(session)
    this.stopInitialSettingsLogPoller(session)
  }

  /** stdout が空でも logs/latest.log からタイトル到達を拾う */
  private async pollTitleFromLatestLog(session: Session): Promise<void> {
    if (!session.initialSettingsPendingCommit || session.initialSettingsTitleSeen) return
    const instanceDir = session.initialSettingsInstanceDir
    if (!instanceDir) return
    try {
      const logPath = path.join(instanceDir, 'logs', 'latest.log')
      const text = await fs.readFile(logPath, 'utf8')
      const slice = text.length > 48_000 ? text.slice(-48_000) : text
      if (!TITLE_SCREEN_LOG_RE.test(slice)) return
      session.initialSettingsTitleSeen = true
      this.stopInitialSettingsWatchers(session)
      await this.reapplyInitialSettingsAtTitle(session)
    } catch {
      /* ログ未作成 */
    }
  }

  private maybeHandleInitialSettingsTitle(session: Session, text: string): void {
    if (!session.initialSettingsPendingCommit || session.initialSettingsTitleSeen) return
    if (!TITLE_SCREEN_LOG_RE.test(text)) return
    session.initialSettingsTitleSeen = true
    this.stopInitialSettingsWatchers(session)
    void this.reapplyInitialSettingsAtTitle(session)
  }

  /**
   * タイトル到達時の確認。
   * 一致していればこの起動でゲームが正しい options を読んだとみなし、終了時に applied 可能。
   * 崩れていれば直して次回起動に回す（起動中メモリへの即時反映は目的ではない）。
   */
  private async reapplyInitialSettingsAtTitle(session: Session): Promise<void> {
    const instanceDir = session.initialSettingsInstanceDir
    const options = session.initialSettingsOptions
    const overlay = session.initialSettingsOverlay ?? {}
    if (!instanceDir || !options) return
    try {
      if (Object.keys(options).length === 0) {
        session.initialSettingsCleanAtTitle = true
        return
      }
      const alreadyOk = await verifyMinecraftOptionsFile(instanceDir, options)
      if (alreadyOk && !session.initialSettingsRewroteDuringSession) {
        session.initialSettingsCleanAtTitle = true
        this.deps.logger.info(
          'launcher',
          `Minecraft initial options intact at title for ${session.profileId}`,
        )
        return
      }
      await mergeMinecraftOptionsFile(instanceDir, options)
      if (Object.keys(overlay).length > 0) {
        await mergeMinecraftDebugOverlayFile(instanceDir, overlay)
      }
      session.initialSettingsRewroteDuringSession = true
      session.initialSettingsCleanAtTitle = false
      const ok = await verifyMinecraftOptionsFile(instanceDir, options)
      this.deps.logger.info(
        'launcher',
        `Minecraft initial options rewritten at title for next launch (${session.profileId}, verify=${ok})`,
      )
    } catch (err) {
      session.initialSettingsRewroteDuringSession = true
      session.initialSettingsCleanAtTitle = false
      this.deps.logger.warn(
        'launcher',
        `Failed to lock Minecraft initial options at title: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  /**
   * 終了時の applied 確定。
   * - パッチ空: 一度 spawn して終了したら applied
   * - パッチあり 1 回目: primed のみ立てて applied にしない（2 回目 Options.load 用）
   * - パッチあり 2 回目以降: タイトルで一致、または primed+verify+十分な稼働時間
   */
  private async finalizeInitialSettingsCommit(session: Session, exitCode: number): Promise<void> {
    if (!session.initialSettingsPendingCommit) return
    if (session.runningSinceMs == null) {
      this.deps.logger.info(
        'launcher',
        `Skip Minecraft initial settings commit for ${session.profileId} (never spawned)`,
      )
      return
    }
    try {
      const profile = await this.deps.instances.get(session.profileId)
      const instanceDir = session.initialSettingsInstanceDir
      const options = session.initialSettingsOptions ?? {}
      const hasPatch = Object.keys(options).length > 0
      const runtimeMs = Date.now() - session.runningSinceMs
      const primed = Boolean(profile?.minecraftInitialSettingsPrimed)

      if (instanceDir && hasPatch) {
        await mergeMinecraftOptionsFile(instanceDir, options)
        if (session.initialSettingsOverlay && Object.keys(session.initialSettingsOverlay).length > 0) {
          await mergeMinecraftDebugOverlayFile(instanceDir, session.initialSettingsOverlay)
        }
      }

      if (!hasPatch) {
        await this.deps.instances.update(session.profileId, {
          minecraftInitialSettingsApplied: true,
          minecraftInitialSettingsApplyGeneration: MINECRAFT_INITIAL_SETTINGS_APPLY_GENERATION,
          pendingMinecraftOptions: {},
          pendingMinecraftDebugOverlay: {},
        })
        this.deps.logger.info(
          'launcher',
          `Committed Minecraft initial settings for ${session.profileId} (empty patch, exit=${exitCode})`,
        )
        return
      }

      if (!primed) {
        await this.deps.instances.update(session.profileId, {
          minecraftInitialSettingsPrimed: true,
        })
        this.deps.logger.info(
          'launcher',
          `Primed Minecraft initial settings for ${session.profileId} (exit=${exitCode}, defer applied until next launch)`,
        )
        return
      }

      const verifyAtExit =
        instanceDir != null && (await verifyMinecraftOptionsFile(instanceDir, options))
      const canCommit =
        !session.initialSettingsRewroteDuringSession &&
        Boolean(session.initialSettingsVerifiedAtSpawn) &&
        verifyAtExit &&
        (Boolean(session.initialSettingsCleanAtTitle) ||
          (runtimeMs >= INITIAL_SETTINGS_COMMIT_MIN_RUNTIME_MS &&
            Boolean(session.initialSettingsTitleSeen)) ||
          (runtimeMs >= INITIAL_SETTINGS_COMMIT_MIN_RUNTIME_MS &&
            !session.initialSettingsTitleSeen))

      if (!canCommit) {
        this.deps.logger.info(
          'launcher',
          `Defer Minecraft initial settings commit for ${session.profileId} (exit=${exitCode}, title=${Boolean(session.initialSettingsTitleSeen)}, clean=${Boolean(session.initialSettingsCleanAtTitle)}, rewrote=${Boolean(session.initialSettingsRewroteDuringSession)}, runtimeMs=${runtimeMs}, verifyAtExit=${verifyAtExit})`,
        )
        return
      }

      await this.deps.instances.update(session.profileId, {
        minecraftInitialSettingsApplied: true,
        minecraftInitialSettingsApplyGeneration: MINECRAFT_INITIAL_SETTINGS_APPLY_GENERATION,
        minecraftInitialSettingsPrimed: true,
        pendingMinecraftOptions: {},
        pendingMinecraftDebugOverlay: {},
      })
      this.deps.logger.info(
        'launcher',
        `Committed Minecraft initial settings for ${session.profileId} (exit=${exitCode}, title=${Boolean(session.initialSettingsTitleSeen)}, primed=${primed})`,
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
