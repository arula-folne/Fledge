import { useCallback } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { ContentProject } from '@fledge/shared'
import { fledgeApi } from '../api/fledgeApi'
import { RouteErrorBoundary } from '../components/RouteErrorBoundary'
import { AddContentModal } from '../features/content/AddContentModal'

type Props = {
  /** browse=検索フロー / project=インストール済みからの詳細のみ */
  mode: 'browse' | 'project'
}

/**
 * インスタンス向けコンテンツ検索・詳細。
 * 詳細画面の上にモーダルを重ねず、Browse と同様に別ルートで表示する。
 */
export default function InstanceContentBrowsePage({ mode }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { instanceId = '', projectId: pathProjectId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const projectId = mode === 'project' ? (pathProjectId ?? null) : searchParams.get('project')
  const browseMode = mode === 'browse'

  const instanceQuery = useQuery({
    queryKey: ['instances', instanceId],
    queryFn: () => fledgeApi.instances.get(instanceId),
    enabled: Boolean(instanceId),
  })

  const goDetail = useCallback(() => {
    navigate(`/library/${instanceId}`, { replace: true })
  }, [instanceId, navigate])

  const selectProject = useCallback(
    (hit: ContentProject) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set('project', hit.slug || hit.id)
          return next
        },
        { replace: false },
      )
    },
    [setSearchParams],
  )

  const backFromProject = useCallback(() => {
    if (browseMode) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('project')
          return next
        },
        { replace: true },
      )
      return
    }
    goDetail()
  }, [browseMode, goDetail, setSearchParams])

  if (instanceQuery.isPending) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--color-text-muted)]">
        {t('common.loading')}
      </div>
    )
  }

  if (!instanceQuery.data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--color-text-muted)]">
        <p>{t('common.loadErrorTitle')}</p>
        <button type="button" className="text-[var(--color-accent)] underline" onClick={() => navigate('/')}>
          {t('common.back')}
        </button>
      </div>
    )
  }

  const instance = instanceQuery.data

  return (
    <RouteErrorBoundary
      resetKeys={[instance.id, projectId ?? '', mode]}
      fallback={({ reset }) => (
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-2">
          <p className="text-sm font-medium text-[var(--color-text)]">{t('content.browseErrorTitle')}</p>
          <p className="text-sm text-[var(--color-text-muted)]">{t('content.browseErrorBody')}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-full bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-on-accent)]"
              onClick={reset}
            >
              {t('common.retry')}
            </button>
            <button
              type="button"
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-sm"
              onClick={goDetail}
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      )}
    >
      <AddContentModal
        open
        browseMode={browseMode}
        onClose={goDetail}
        instance={instance}
        projectId={projectId}
        onSelectProject={selectProject}
        onBackFromProject={backFromProject}
        onInstalled={() => {
          void queryClient.invalidateQueries({ queryKey: ['content-installed', instance.id] })
        }}
      />
    </RouteErrorBoundary>
  )
}
