import { create } from 'zustand'
import { INSTALL_TUTORIAL_STEPS } from '../features/onboarding/installOnboardingSteps'
import type {
  AuthStatus,
  LaunchPhase,
  LaunchState,
  LaunchStateEvent,
  ProgressEvent,
} from '@fledge/shared'

export type LaunchSessionInfo = {
  sessionId: string
  profileId: string
  accountId?: string
  state: LaunchState
}

type LaunchStore = {
  /** インスタンス ID → 起動セッション */
  byProfileId: Record<string, LaunchSessionInfo>
  /** 進捗表示の対象（起動中のセッション）。UI のフォールバック用 */
  focusSessionId: string | null
  /** セッション単位の進捗（同時準備で上書きし合わない） */
  progressBySessionId: Record<string, ProgressEvent>
  phaseMessageBySessionId: Record<string, string>
  phase: LaunchPhase | null
  /** focus セッションの進捗（互換・ヘッダー向け） */
  progress: ProgressEvent | null
  phaseMessageKey: string | null
  errorMessageKey: string | null
  errorProfileId: string | null
  lastExitCode: number | null
  applyStateEvent: (e: LaunchStateEvent) => void
  applyPhase: (phase: LaunchPhase, messageKey: string, sessionId?: string) => void
  applyProgress: (progress: ProgressEvent) => void
  reset: () => void
  /** 指定インスタンスの状態。無ければ idle */
  stateFor: (profileId: string | null | undefined) => LaunchState
  anyPreparing: () => boolean
  progressForSession: (sessionId: string | null | undefined) => ProgressEvent | null
  phaseMessageForSession: (sessionId: string | null | undefined) => string | null
}

function clearSessionProgress(
  progressBySessionId: Record<string, ProgressEvent>,
  phaseMessageBySessionId: Record<string, string>,
  sessionId: string | undefined,
): {
  progressBySessionId: Record<string, ProgressEvent>
  phaseMessageBySessionId: Record<string, string>
} {
  if (!sessionId) {
    return { progressBySessionId, phaseMessageBySessionId }
  }
  if (!(sessionId in progressBySessionId) && !(sessionId in phaseMessageBySessionId)) {
    return { progressBySessionId, phaseMessageBySessionId }
  }
  const nextProgress = { ...progressBySessionId }
  const nextPhase = { ...phaseMessageBySessionId }
  delete nextProgress[sessionId]
  delete nextPhase[sessionId]
  return { progressBySessionId: nextProgress, phaseMessageBySessionId: nextPhase }
}

export const useLaunchStore = create<LaunchStore>((set, get) => ({
  byProfileId: {},
  focusSessionId: null,
  progressBySessionId: {},
  phaseMessageBySessionId: {},
  phase: null,
  progress: null,
  phaseMessageKey: null,
  errorMessageKey: null,
  errorProfileId: null,
  lastExitCode: null,

  applyStateEvent: (e) => {
    set((s) => {
      const nextMap = { ...s.byProfileId }
      const profileId = e.profileId
      if (profileId && e.sessionId) {
        if (e.state === 'exited' || e.state === 'idle' || e.state === 'error') {
          delete nextMap[profileId]
        } else {
          nextMap[profileId] = {
            sessionId: e.sessionId,
            profileId,
            accountId: e.accountId,
            state: e.state,
          }
        }
      }

      const focusing =
        e.state === 'preparing' || e.state === 'launching' || e.state === 'running'
          ? s.focusSessionId &&
            Object.values(nextMap).some((x) => x.sessionId === s.focusSessionId)
            ? s.focusSessionId
            : (e.sessionId ?? s.focusSessionId)
          : s.focusSessionId === e.sessionId
            ? null
            : s.focusSessionId

      const cleared =
        e.state === 'idle' || e.state === 'exited' || e.state === 'error'
          ? clearSessionProgress(s.progressBySessionId, s.phaseMessageBySessionId, e.sessionId)
          : {
              progressBySessionId: s.progressBySessionId,
              phaseMessageBySessionId: s.phaseMessageBySessionId,
            }

      const focusProgress =
        focusing != null ? (cleared.progressBySessionId[focusing] ?? null) : null
      const focusPhaseKey =
        focusing != null ? (cleared.phaseMessageBySessionId[focusing] ?? null) : null

      return {
        byProfileId: nextMap,
        focusSessionId: focusing,
        ...cleared,
        errorMessageKey:
          e.state === 'error'
            ? (e.errorMessageKey ?? s.errorMessageKey)
            : e.state === 'preparing' || e.state === 'launching' || e.state === 'running'
              ? e.profileId === s.errorProfileId
                ? null
                : s.errorMessageKey
              : s.errorMessageKey,
        errorProfileId:
          e.state === 'error'
            ? (e.profileId ?? s.errorProfileId)
            : e.state === 'preparing' || e.state === 'launching' || e.state === 'running'
              ? e.profileId === s.errorProfileId
                ? null
                : s.errorProfileId
              : s.errorProfileId,
        lastExitCode: e.code ?? null,
        ...(e.state === 'idle' || e.state === 'exited' || e.state === 'error'
          ? s.focusSessionId === e.sessionId
            ? {
                phase: null,
                progress: focusProgress,
                phaseMessageKey: focusPhaseKey,
              }
            : { progress: focusProgress, phaseMessageKey: focusPhaseKey }
          : {}),
      }
    })
  },

  applyPhase: (phase, messageKey, sessionId) =>
    set((s) => {
      const nextPhaseMsg = sessionId
        ? { ...s.phaseMessageBySessionId, [sessionId]: messageKey }
        : s.phaseMessageBySessionId
      return {
        phase,
        phaseMessageBySessionId: nextPhaseMsg,
        phaseMessageKey:
          !sessionId || sessionId === s.focusSessionId || !s.focusSessionId
            ? messageKey
            : s.phaseMessageKey,
        focusSessionId: s.focusSessionId ?? sessionId ?? null,
      }
    }),

  applyProgress: (progress) =>
    set((s) => {
      const sid = progress.sessionId
      const isLaunch =
        progress.scope === 'launch' ||
        (sid != null && Object.values(s.byProfileId).some((x) => x.sessionId === sid))
      if (!isLaunch || !sid) return s

      const nextProgress = { ...s.progressBySessionId, [sid]: progress }
      const nextPhaseMsg = progress.messageKey
        ? { ...s.phaseMessageBySessionId, [sid]: progress.messageKey }
        : s.phaseMessageBySessionId

      const isFocused = !s.focusSessionId || s.focusSessionId === sid
      return {
        progressBySessionId: nextProgress,
        phaseMessageBySessionId: nextPhaseMsg,
        // focus は奪わない（同時準備でバーが飛び跳ねるのを防ぐ）
        focusSessionId: s.focusSessionId ?? sid,
        ...(isFocused
          ? {
              progress,
              phaseMessageKey: progress.messageKey ?? s.phaseMessageKey,
            }
          : {}),
      }
    }),

  reset: () =>
    set({
      byProfileId: {},
      focusSessionId: null,
      progressBySessionId: {},
      phaseMessageBySessionId: {},
      phase: null,
      progress: null,
      phaseMessageKey: null,
      errorMessageKey: null,
      lastExitCode: null,
    }),

  stateFor: (profileId) => {
    if (!profileId) return 'idle'
    return get().byProfileId[profileId]?.state ?? 'idle'
  },

  anyPreparing: () =>
    Object.values(get().byProfileId).some(
      (s) => s.state === 'preparing' || s.state === 'launching',
    ),

  progressForSession: (sessionId) => {
    if (!sessionId) return null
    return get().progressBySessionId[sessionId] ?? null
  },

  phaseMessageForSession: (sessionId) => {
    if (!sessionId) return null
    return get().phaseMessageBySessionId[sessionId] ?? null
  },
}))

export type SettingsSection =
  | 'appGeneral'
  | 'appLanguage'
  | 'appTheme'
  | 'minecraftLaunch'
  | 'minecraftInitial'
  | 'account'
  | 'java'
  | 'resources'
  | 'privacyCredits'
  | 'debug'

export type LibraryDetailTab = 'content' | 'screenshots' | 'files' | 'logs'

export type LibraryFocus = {
  instanceId: string
  tab: LibraryDetailTab
}

type UiStore = {
  authStatus: AuthStatus
  setAuthStatus: (status: AuthStatus) => void
  /** ログイン失敗の i18n キー（ダイアログ表示用。null で非表示） */
  authErrorKey: string | null
  setAuthErrorKey: (key: string | null) => void
  instanceWizardOpen: boolean
  setInstanceWizardOpen: (open: boolean) => void
  editingInstanceId: string | null
  setEditingInstanceId: (id: string | null) => void
  settingsSection: SettingsSection
  setSettingsSection: (section: SettingsSection) => void
  libraryFocus: LibraryFocus | null
  setLibraryFocus: (focus: LibraryFocus | null) => void
}

export const useUiStore = create<UiStore>((set) => ({
  authStatus: 'logged_out',
  setAuthStatus: (authStatus) => set({ authStatus }),
  authErrorKey: null,
  setAuthErrorKey: (authErrorKey) => set({ authErrorKey }),
  instanceWizardOpen: false,
  setInstanceWizardOpen: (instanceWizardOpen) => set({ instanceWizardOpen }),
  editingInstanceId: null,
  setEditingInstanceId: (editingInstanceId) => set({ editingInstanceId }),
  settingsSection: 'appGeneral',
  setSettingsSection: (settingsSection) => set({ settingsSection }),
  libraryFocus: null,
  setLibraryFocus: (libraryFocus) =>
    set((s) => {
      if (
        s.libraryFocus?.instanceId === libraryFocus?.instanceId &&
        s.libraryFocus?.tab === libraryFocus?.tab
      ) {
        return s
      }
      return { libraryFocus }
    }),
}))

export type TransferJob = {
  jobId: string
  kind: string
  sessionId?: string
  messageKey?: string
  current: number
  total: number
  percent?: number
  bytesPerSecond?: number
  status: 'queued' | 'active' | 'completed' | 'failed' | 'cancelled'
  meta: Record<string, string | number | boolean>
}

/** 完了・失敗・キャンセル後もヘッダー履歴に残すエントリ */
export type TransferHistoryEntry = TransferJob & {
  finishedAt: number
}

const TRANSFER_HISTORY_LIMIT = 40

type TransferStore = {
  jobs: Record<string, TransferJob>
  history: TransferHistoryEntry[]
  /** ヘッダー表示の主ジョブ（完了するまで切り替えない） */
  pinnedJobId: string | null
  applyProgress: (e: ProgressEvent) => void
  /** 起動準備セッションを履歴へ確定（成功 / 失敗） */
  finalizeSession: (input: {
    sessionId: string
    profileId?: string
    status: 'completed' | 'failed' | 'cancelled'
    messageKey?: string
    meta?: Record<string, string | number | boolean>
    percent?: number
    current?: number
    total?: number
    kind?: string
  }) => void
  clearHistory: () => void
}

function isHistoryTerminalStatus(status: string | undefined, kind?: string): boolean {
  if (status === 'completed' || status === 'failed' || status === 'cancelled') return true
  // Java は従来 succeeded で完了していた（install サブステップの succeeded は対象外）
  if (status === 'succeeded' && kind === 'java') return true
  return false
}

function normalizeTerminalStatus(
  status: string,
): 'completed' | 'failed' | 'cancelled' {
  if (status === 'failed' || status === 'cancelled') return status
  return 'completed'
}

function resolveTransferJobId(e: ProgressEvent): string | undefined {
  if (e.jobId) return e.jobId
  // 起動・準備中の install 進捗は jobId が無いので session 単位で履歴化する
  if (e.sessionId && (e.scope === 'launch' || e.scope === 'transfer' || e.kind === 'install')) {
    return `session:${e.sessionId}`
  }
  return undefined
}

function toHistoryEntry(
  job: TransferJob,
  status: TransferJob['status'],
  finishedAt = Date.now(),
): TransferHistoryEntry {
  return {
    ...job,
    status,
    percent: status === 'completed' ? 100 : job.percent,
    finishedAt,
  }
}

function nextPinnedJobId(
  pinnedJobId: string | null,
  jobs: Record<string, TransferJob>,
  removedJobId?: string,
): string | null {
  const remaining = Object.values(jobs).filter(
    (j) => j.status === 'queued' || j.status === 'active',
  )
  const sorted = remaining.sort((a, b) => a.jobId.localeCompare(b.jobId))
  if (removedJobId && pinnedJobId === removedJobId) {
    return sorted[0]?.jobId ?? null
  }
  if (pinnedJobId && jobs[pinnedJobId]) return pinnedJobId
  return sorted[0]?.jobId ?? null
}

function pushHistory(
  history: TransferHistoryEntry[],
  entry: TransferHistoryEntry,
): TransferHistoryEntry[] {
  return [entry, ...history.filter((h) => h.jobId !== entry.jobId)].slice(
    0,
    TRANSFER_HISTORY_LIMIT,
  )
}

export const useTransferStore = create<TransferStore>((set) => ({
  jobs: {},
  history: [],
  pinnedJobId: null,
  clearHistory: () => set({ history: [] }),
  finalizeSession: (input) => {
    const jobId = `session:${input.sessionId}`
    set((s) => {
      const prev = s.jobs[jobId]
      const meta = {
        ...(prev?.meta ?? {}),
        ...(input.meta ?? {}),
        ...(input.profileId ? { instanceId: input.profileId } : {}),
      }
      const snapshot: TransferJob = {
        jobId,
        kind: input.kind ?? prev?.kind ?? 'install',
        sessionId: input.sessionId,
        messageKey: input.messageKey ?? prev?.messageKey,
        current: input.current ?? prev?.current ?? 0,
        total: input.total ?? prev?.total ?? 0,
        percent:
          input.status === 'completed' ? 100 : (input.percent ?? prev?.percent),
        status: input.status,
        meta,
      }
      let history = pushHistory(s.history, toHistoryEntry(snapshot, input.status))
      const next = { ...s.jobs }
      delete next[jobId]

      // 同一セッションの Java 導入など、取り残されたアクティブジョブも完了へ
      for (const [id, job] of Object.entries(s.jobs)) {
        if (id === jobId) continue
        if (job.sessionId !== input.sessionId) continue
        if (job.status !== 'queued' && job.status !== 'active') continue
        history = pushHistory(
          history,
          toHistoryEntry(
            {
              ...job,
              status: input.status,
              percent: input.status === 'completed' ? 100 : job.percent,
              messageKey:
                input.status === 'completed'
                  ? 'library.prepareDone'
                  : (job.messageKey ?? input.messageKey),
            },
            input.status,
          ),
        )
        delete next[id]
      }

      return {
        jobs: next,
        pinnedJobId: nextPinnedJobId(s.pinnedJobId, next, jobId),
        history,
      }
    })
  },
  applyProgress: (e) => {
    const jobId = resolveTransferJobId(e)
    if (!jobId) return

    const rawStatus =
      e.status ??
      (typeof e.meta?.status === 'string' ? String(e.meta.status) : undefined)

    set((s) => {
      // content / java 等の明示的な完了・失敗のみ履歴へ（install 途中の succeeded は含めない）
      if (isHistoryTerminalStatus(rawStatus, e.kind)) {
        const terminal = normalizeTerminalStatus(rawStatus as string)
        const prev = s.jobs[jobId]
        const snapshotBase: TransferJob = prev
          ? {
              ...prev,
              kind: e.kind ?? prev.kind,
              sessionId: e.sessionId ?? prev.sessionId,
              messageKey: e.messageKey ?? prev.messageKey,
              current: e.current ?? prev.current,
              total: e.total ?? prev.total,
              percent: e.percent ?? prev.percent,
              bytesPerSecond: e.bytesPerSecond ?? prev.bytesPerSecond,
              status: terminal,
              meta: { ...prev.meta, ...(e.meta ?? {}) },
            }
          : {
              jobId,
              kind: e.kind ?? 'download',
              sessionId: e.sessionId,
              messageKey: e.messageKey,
              current: e.current ?? 0,
              total: e.total ?? 0,
              percent: e.percent,
              bytesPerSecond: e.bytesPerSecond,
              status: terminal,
              meta: e.meta ?? {},
            }
        const history = pushHistory(s.history, toHistoryEntry(snapshotBase, terminal))
        if (!(jobId in s.jobs)) {
          return { history }
        }
        const next = { ...s.jobs }
        delete next[jobId]
        return {
          jobs: next,
          pinnedJobId: nextPinnedJobId(s.pinnedJobId, next, jobId),
          history,
        }
      }

      // finalize 後の遅延 progress で完了ジョブを復活させない
      if (s.history.some((h) => h.jobId === jobId && isHistoryTerminalStatus(h.status, h.kind))) {
        return s
      }

      const prev = s.jobs[jobId]
      const job: TransferJob = {
        jobId,
        kind: e.kind ?? prev?.kind ?? 'download',
        sessionId: e.sessionId ?? prev?.sessionId,
        messageKey: e.messageKey ?? prev?.messageKey,
        current: e.current ?? prev?.current ?? 0,
        total: e.total ?? prev?.total ?? 0,
        percent: e.percent ?? prev?.percent,
        bytesPerSecond: e.bytesPerSecond ?? prev?.bytesPerSecond,
        status: rawStatus === 'queued' ? 'queued' : 'active',
        meta: { ...(prev?.meta ?? {}), ...(e.meta ?? {}) },
      }
      const wasNew = !prev
      const pinnedJobId =
        s.pinnedJobId && (s.jobs[s.pinnedJobId] || jobId === s.pinnedJobId)
          ? s.pinnedJobId
          : wasNew || !s.pinnedJobId
            ? s.pinnedJobId ?? jobId
            : s.pinnedJobId
      return {
        jobs: {
          ...s.jobs,
          [jobId]: job,
        },
        pinnedJobId: pinnedJobId ?? jobId,
      }
    })
  },
}))


/** インスタンス作成中（一覧に先に載ったあとも完了までバッジ表示） */
type InstanceCreateStore = {
  creatingIds: Record<string, true>
  lastError: string | null
  markCreating: (id: string) => void
  unmarkCreating: (id: string) => void
  setLastError: (message: string | null) => void
  isCreating: (id: string) => boolean
}

export const useInstanceCreateStore = create<InstanceCreateStore>((set, get) => ({
  creatingIds: {},
  lastError: null,
  markCreating: (id) =>
    set((s) => (s.creatingIds[id] ? s : { creatingIds: { ...s.creatingIds, [id]: true } })),
  unmarkCreating: (id) =>
    set((s) => {
      if (!s.creatingIds[id]) return s
      const next = { ...s.creatingIds }
      delete next[id]
      return { creatingIds: next }
    }),
  setLastError: (lastError) => set({ lastError }),
  isCreating: (id) => Boolean(get().creatingIds[id]),
}))

type InstallOnboardingStore = {
  manualOpen: boolean
  openManual: () => void
  closeManual: () => void
  interactiveActive: boolean
  interactiveStepIndex: number
  interactivePersistOnComplete: boolean
  startInteractive: (opts?: { persistOnComplete?: boolean }) => void
  stopInteractive: () => void
  nextInteractiveStep: () => void
  prevInteractiveStep: () => void
  openManualInteractive: () => void
}

export const useInstallOnboardingStore = create<InstallOnboardingStore>((set, get) => ({
  manualOpen: false,
  openManual: () => set({ manualOpen: true }),
  closeManual: () => set({ manualOpen: false }),
  interactiveActive: false,
  interactiveStepIndex: 0,
  interactivePersistOnComplete: false,
  startInteractive: (opts) =>
    set({
      interactiveActive: true,
      interactiveStepIndex: 0,
      interactivePersistOnComplete: opts?.persistOnComplete ?? false,
      manualOpen: false,
    }),
  stopInteractive: () =>
    set({
      interactiveActive: false,
      interactiveStepIndex: 0,
      interactivePersistOnComplete: false,
    }),
  nextInteractiveStep: () => {
    const { interactiveStepIndex } = get()
    if (interactiveStepIndex >= INSTALL_TUTORIAL_STEPS.length - 1) return
    set({ interactiveStepIndex: interactiveStepIndex + 1 })
  },
  prevInteractiveStep: () => {
    const { interactiveStepIndex } = get()
    if (interactiveStepIndex <= 0) return
    set({ interactiveStepIndex: interactiveStepIndex - 1 })
  },
  openManualInteractive: () =>
    set({
      interactiveActive: true,
      interactiveStepIndex: 0,
      interactivePersistOnComplete: false,
      manualOpen: false,
    }),
}))
