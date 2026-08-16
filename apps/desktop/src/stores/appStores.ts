import { create } from 'zustand'
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
  /** 進捗表示の対象（起動中のセッション） */
  focusSessionId: string | null
  phase: LaunchPhase | null
  progress: ProgressEvent | null
  phaseMessageKey: string | null
  errorMessageKey: string | null
  lastExitCode: number | null
  applyStateEvent: (e: LaunchStateEvent) => void
  applyPhase: (phase: LaunchPhase, messageKey: string, sessionId?: string) => void
  applyProgress: (progress: ProgressEvent) => void
  reset: () => void
  /** 指定インスタンスの状態。無ければ idle */
  stateFor: (profileId: string | null | undefined) => LaunchState
  anyPreparing: () => boolean
}

export const useLaunchStore = create<LaunchStore>((set, get) => ({
  byProfileId: {},
  focusSessionId: null,
  phase: null,
  progress: null,
  phaseMessageKey: null,
  errorMessageKey: null,
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
          ? (e.sessionId ?? s.focusSessionId)
          : s.focusSessionId === e.sessionId
            ? null
            : s.focusSessionId

      return {
        byProfileId: nextMap,
        focusSessionId: focusing,
        errorMessageKey: e.errorMessageKey ?? (e.state === 'error' ? s.errorMessageKey : null),
        lastExitCode: e.code ?? null,
        ...(e.state === 'idle' || e.state === 'exited' || e.state === 'error'
          ? s.focusSessionId === e.sessionId
            ? { phase: null, progress: null, phaseMessageKey: null }
            : {}
          : {}),
      }
    })
  },

  applyPhase: (phase, messageKey, sessionId) =>
    set((s) => ({
      phase,
      phaseMessageKey: messageKey,
      focusSessionId: sessionId ?? s.focusSessionId,
    })),

  applyProgress: (progress) =>
    set((s) => {
      const sid = progress.sessionId
      const isLaunch =
        progress.scope === 'launch' ||
        (sid != null && Object.values(s.byProfileId).some((x) => x.sessionId === sid))
      if (!isLaunch) return s
      return {
        progress,
        focusSessionId: sid ?? s.focusSessionId,
      }
    }),

  reset: () =>
    set({
      byProfileId: {},
      focusSessionId: null,
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
}))

export type SettingsSection =
  | 'basic'
  | 'display'
  | 'account'
  | 'java'
  | 'resources'
  | 'privacyCredits'

export type LibraryDetailTab = 'overview' | 'content' | 'screenshots' | 'logs' | 'settings'

export type LibraryFocus = {
  instanceId: string
  tab: LibraryDetailTab
}

type UiStore = {
  authStatus: AuthStatus
  setAuthStatus: (status: AuthStatus) => void
  logPanelOpen: boolean
  setLogPanelOpen: (open: boolean) => void
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
  logPanelOpen: false,
  setLogPanelOpen: (logPanelOpen) => set({ logPanelOpen }),
  instanceWizardOpen: false,
  setInstanceWizardOpen: (instanceWizardOpen) => set({ instanceWizardOpen }),
  editingInstanceId: null,
  setEditingInstanceId: (editingInstanceId) => set({ editingInstanceId }),
  settingsSection: 'display',
  setSettingsSection: (settingsSection) => set({ settingsSection }),
  libraryFocus: null,
  setLibraryFocus: (libraryFocus) => set({ libraryFocus }),
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

type TransferStore = {
  jobs: Record<string, TransferJob>
  applyProgress: (e: ProgressEvent) => void
}

function isTerminalStatus(status: TransferJob['status'] | undefined): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

export const useTransferStore = create<TransferStore>((set) => ({
  jobs: {},
  applyProgress: (e) => {
    const jobId = e.jobId
    if (!jobId) return
    const status = e.status ?? (typeof e.meta?.status === 'string' ? (e.meta.status as TransferJob['status']) : 'active')
    set((s) => {
      if (isTerminalStatus(status)) {
        if (!(jobId in s.jobs)) return s
        const next = { ...s.jobs }
        delete next[jobId]
        return { jobs: next }
      }
      return {
        jobs: {
          ...s.jobs,
          [jobId]: {
            jobId,
            kind: e.kind ?? 'download',
            sessionId: e.sessionId,
            messageKey: e.messageKey,
            current: e.current,
            total: e.total,
            percent: e.percent,
            bytesPerSecond: e.bytesPerSecond,
            status,
            meta: e.meta ?? s.jobs[jobId]?.meta ?? {},
          },
        },
      }
    })
  },
}))

type LogStore = {
  lines: import('@fledge/shared').LogLine[]
  append: (line: import('@fledge/shared').LogLine) => void
  setAll: (lines: import('@fledge/shared').LogLine[]) => void
  clear: () => void
}

export const useLogStore = create<LogStore>((set) => ({
  lines: [],
  append: (line) =>
    set((s) => {
      const next = [...s.lines, line]
      return { lines: next.length > 2000 ? next.slice(-2000) : next }
    }),
  setAll: (lines) => set({ lines }),
  clear: () => set({ lines: [] }),
}))
