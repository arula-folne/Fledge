import { useCallback, useState } from 'react'

type Pending = {
  projectIds: Set<string>
  versionByProject: Map<string, string>
}

const emptyPending = (): Pending => ({
  projectIds: new Set(),
  versionByProject: new Map(),
})

/** インストール押下直後に UI を「インストール済み」にする（裏で DL 継続）。 */
export function useOptimisticContentInstalls() {
  const [pending, setPending] = useState<Pending>(emptyPending)

  const mark = useCallback((projectId: string, versionId?: string) => {
    setPending((prev) => {
      const projectIds = new Set(prev.projectIds)
      projectIds.add(projectId)
      const versionByProject = new Map(prev.versionByProject)
      if (versionId) versionByProject.set(projectId, versionId)
      return { projectIds, versionByProject }
    })
  }, [])

  const unmark = useCallback((projectId: string) => {
    setPending((prev) => {
      if (!prev.projectIds.has(projectId)) return prev
      const projectIds = new Set(prev.projectIds)
      projectIds.delete(projectId)
      const versionByProject = new Map(prev.versionByProject)
      versionByProject.delete(projectId)
      return { projectIds, versionByProject }
    })
  }, [])

  const reset = useCallback(() => setPending(emptyPending()), [])

  const showsInstalled = useCallback(
    (projectId: string, installedIds: Set<string>, activeJobIds: Set<string>) =>
      installedIds.has(projectId) ||
      pending.projectIds.has(projectId) ||
      activeJobIds.has(projectId),
    [pending.projectIds],
  )

  const pendingVersionId = useCallback(
    (projectId: string) => pending.versionByProject.get(projectId),
    [pending.versionByProject],
  )

  return { mark, unmark, reset, showsInstalled, pendingVersionId, pendingProjectIds: pending.projectIds }
}
