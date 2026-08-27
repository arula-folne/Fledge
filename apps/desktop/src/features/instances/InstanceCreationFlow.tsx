import { useState, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { IconBrandMinecraft, IconFileZip, IconWorldSearch } from '@tabler/icons-react'
import { fledgeApi } from '../../api/fledgeApi'
import { Dialog } from '../../components/ui/Dialog'
import { useInstanceCreateStore } from '../../stores/appStores'
import { InstanceWizard } from './InstanceWizard'

type Source = 'choice' | 'manual'

export function InstanceCreationFlow({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const setLastError = useInstanceCreateStore((s) => s.setLastError)
  const [source, setSource] = useState<Source>('choice')
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    setSource('choice')
    setError(null)
    onClose()
  }

  const importMutation = useMutation({
    mutationFn: (filePath: string) => fledgeApi.content.importMrpackFromPath(filePath),
    onSuccess: async (profile) => {
      await queryClient.invalidateQueries({ queryKey: ['instances'] })
      await queryClient.invalidateQueries({ queryKey: ['settings'] })
      useInstanceCreateStore.getState().unmarkCreating(profile.id)
      void fledgeApi.launch.prepare(profile.id).catch(() => {
        /* 起動準備エラーは既存イベント表示に任せる */
      })
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : String(err)
      setLastError(message)
    },
  })

  if (source === 'manual') {
    return (
      <InstanceWizard
        open={open}
        onClose={close}
        onBack={() => {
          setError(null)
          setSource('choice')
        }}
      />
    )
  }

  return (
    <Dialog
      open={open}
      title={t('instances.createSource.title')}
      subtitle={t('instances.createSource.subtitle')}
      onClose={close}
      size="lg"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <SourceCard
          icon={<IconBrandMinecraft size={30} stroke={1.6} />}
          title={t('instances.createSource.manual')}
          description={t('instances.createSource.manualHint')}
          onClick={() => setSource('manual')}
        />
        <SourceCard
          icon={<IconFileZip size={30} stroke={1.6} />}
          title={t('instances.createSource.mrpack')}
          description={t('instances.createSource.mrpackHint')}
          onClick={() => {
            setError(null)
            setLastError(null)
            close()
            navigate('/')
            void (async () => {
              const filePath = await fledgeApi.content.pickMrpack()
              if (!filePath) return
              importMutation.mutate(filePath)
            })()
          }}
        />
        <SourceCard
          icon={<IconWorldSearch size={30} stroke={1.6} />}
          title={t('instances.createSource.modrinth')}
          description={t('instances.createSource.modrinthHint')}
          onClick={() => {
            close()
            navigate('/browse')
          }}
        />
      </div>
      {error ? (
        <p className="mt-3 rounded-[var(--radius-sm)] bg-[var(--color-danger)]/15 px-3 py-2 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
    </Dialog>
  )
}

function SourceCard({
  icon,
  title,
  description,
  onClick,
}: {
  icon: ReactNode
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-center transition hover:border-[var(--color-accent)]/50 hover:bg-[var(--color-hover)]"
    >
      <span className="text-[var(--color-accent)]">{icon}</span>
      <span className="font-semibold">{title}</span>
      <span className="text-xs leading-relaxed text-[var(--color-text-muted)]">{description}</span>
    </button>
  )
}
