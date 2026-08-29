import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { IconArrowLeft, IconExternalLink } from '@tabler/icons-react'
import type {
  ContentCategory,
  ContentLoaderFilter,
  ContentProject,
  ContentProjectDetail,
  ContentVersion,
  InstanceProfile,
} from '@fledge/shared'
import { fledgeApi } from '../../api/fledgeApi'
import { Button } from '../../components/ui/Button'
import { formatJaCount } from '../../utils/formatJaCount'
import { ContentInstallButton, ContentVersionInstallButton } from './ContentInstallButton'
import { MarkdownBody } from './MarkdownBody'
import { EnvironmentPanel, LoaderInlineList, LOADER_IDS, tagLabel } from './ContentTags'
import { GalleryLightbox } from '../media/GalleryLightbox'

function formatDate(iso?: string): string | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  return new Intl.DateTimeFormat('ja', { dateStyle: 'medium' }).format(new Date(ms))
}

const PROJECT_PATH: Record<ContentCategory, string> = {
  mod: 'mod',
  modpack: 'modpack',
  resourcepack: 'resourcepack',
  shader: 'shader',
  datapack: 'datapack',
  plugin: 'plugin',
}

type TabId = 'description' | 'gallery' | 'versions'

type Props = {
  hit: ContentProject
  /** 既存インスタンスへの導入時。createMode では省略可 */
  instance?: InstanceProfile
  gameVersion: string
  loaders: ContentLoaderFilter[]
  installed?: boolean
  installedVersionId?: string
  creating?: boolean
  /** true のとき「インスタンスを作成」 */
  createMode?: boolean
  onBack: () => void
  onInstall: (versionId?: string) => void
}

export function ContentProjectView({
  hit,
  gameVersion,
  loaders,
  installed = false,
  installedVersionId,
  creating = false,
  createMode = false,
  onBack,
  onInstall,
}: Props) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<TabId>('description')
  const [versionId, setVersionId] = useState<string | null>(null)
  const [compatOnly, setCompatOnly] = useState(Boolean(gameVersion.trim()))
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null)

  const pageQuery = useQuery({
    queryKey: ['content-project', hit.id],
    queryFn: () => fledgeApi.content.getProject(hit.id),
    staleTime: 60_000,
  })

  const versionsQuery = useQuery({
    queryKey: ['content-project-versions', hit.id, compatOnly, gameVersion, loaders],
    queryFn: () =>
      fledgeApi.content.listVersions({
        projectId: hit.id,
        gameVersion: compatOnly ? gameVersion.trim() || undefined : undefined,
        loaders:
          compatOnly &&
          (hit.projectType === 'mod' || hit.projectType === 'plugin' || hit.projectType === 'modpack')
            ? loaders
            : [],
      }),
    enabled: true,
    staleTime: 60_000,
  })

  const project: ContentProjectDetail = {
    ...hit,
    body: '',
    gallery: [],
    donationUrls: [],
    members: [],
    ...(pageQuery.data?.project ?? {}),
  }
  const versions = versionsQuery.data ?? []
  const selectedId = versionId && versions.some((v) => v.id === versionId) ? versionId : versions[0]?.id

  const sourceUrl = `https://modrinth.com/${PROJECT_PATH[hit.projectType]}/${project.slug || hit.slug}`
  const cats = project.displayCategories?.length ? project.displayCategories : project.categories
  const gallery = project.gallery.slice(0, 8)

  const tabs: { id: TabId; label: string; hidden?: boolean }[] = [
    { id: 'description', label: t('content.tab.description') },
    { id: 'gallery', label: t('content.tab.gallery'), hidden: !pageQuery.isPending && gallery.length === 0 },
    { id: 'versions', label: t('content.tab.versions') },
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          onClick={onBack}
        >
          <IconArrowLeft size={14} stroke={1.75} />
          {t('common.back')}
        </button>
        <a
          href={sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
        >
          {t('content.openOnModrinth')}
          <IconExternalLink size={12} stroke={1.75} />
        </a>
      </div>

      <header className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        {project.iconUrl ? (
          <img
            src={project.iconUrl}
            alt=""
            width={56}
            height={56}
            decoding="async"
            className="size-14 shrink-0 rounded-[var(--radius-sm)] object-cover"
          />
        ) : (
          <div className="size-14 shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-accent-soft)]" />
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold leading-tight">{project.name}</h2>
          {project.author ? (
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{project.author}</p>
          ) : null}
          <p className="mt-1 line-clamp-2 break-words text-sm leading-relaxed text-[var(--color-text-muted)]">
            {project.description}
          </p>
          <p className="mt-1 text-[11px] tabular-nums text-[var(--color-text-muted)]">
            {t('content.downloadsCount', { n: formatJaCount(project.downloads) })}
          </p>
        </div>
        <ContentInstallButton
          installing={creating}
          installed={createMode ? false : installed}
          disabled={versionsQuery.isPending || versions.length === 0}
          mode={createMode ? 'create' : 'install'}
          onInstall={() => onInstall(selectedId)}
        />
      </header>
      {createMode ? (
        <p className="shrink-0 text-xs text-[var(--color-text-muted)]">{t('content.createInstanceHint')}</p>
      ) : null}

      <nav className="flex shrink-0 gap-1 border-b border-[var(--color-border)]">
        {tabs
          .filter((item) => !item.hidden)
          .map((item) => (
            <button
              key={item.id}
              type="button"
              className={[
                '-mb-px border-b-2 px-3 py-1.5 text-sm',
                tab === item.id
                  ? 'border-[var(--color-accent)] text-[var(--color-text)]'
                  : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
              ].join(' ')}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {tab === 'description' ? (
          pageQuery.isPending ? (
            <p className="text-sm text-[var(--color-text-muted)]">{t('common.loading')}</p>
          ) : pageQuery.isError ? (
            <p className="text-sm text-[var(--color-danger)]">
              {pageQuery.error instanceof Error ? pageQuery.error.message : String(pageQuery.error)}
            </p>
          ) : (
            <div className="space-y-4">
              <MarkdownBody text={project.body || project.description} />
              <MetaBlock project={project} cats={cats} />
            </div>
          )
        ) : tab === 'gallery' ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {gallery.map((g, index) => (
              <button
                key={g.url}
                type="button"
                className="overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)] transition-colors hover:border-[var(--color-accent)]/40"
                aria-label={g.title ?? t('content.gallery.openImage', { n: index + 1 })}
                onClick={() => setGalleryIndex(index)}
              >
                <img
                  src={g.url}
                  alt={g.title ?? ''}
                  loading="lazy"
                  decoding="async"
                  className="block h-auto w-full"
                />
              </button>
            ))}
          </div>
        ) : (
          <VersionsPanel
            versions={versions}
            selectedId={selectedId}
            compatOnly={compatOnly}
            installedVersionId={createMode ? undefined : installedVersionId}
            creating={creating}
            createMode={createMode}
            loading={versionsQuery.isPending}
            error={
              versionsQuery.isError
                ? versionsQuery.error instanceof Error
                  ? versionsQuery.error.message
                  : String(versionsQuery.error)
                : null
            }
            onCompatOnly={(v) => {
              setCompatOnly(v)
              setVersionId(null)
            }}
            onSelect={setVersionId}
            onInstall={(id) => onInstall(id)}
          />
        )}
      </div>

      {galleryIndex !== null && gallery[galleryIndex] ? (
        <GalleryLightbox
          items={gallery}
          index={galleryIndex}
          onClose={() => setGalleryIndex(null)}
          onChange={setGalleryIndex}
        />
      ) : null}
    </div>
  )
}

function MetaBlock({
  project,
  cats,
}: {
  project: ContentProjectDetail
  cats: string[]
}) {
  const { t, i18n } = useTranslation()
  const links: Array<{ href: string; label: string }> = []
  if (project.sourceUrl) links.push({ href: project.sourceUrl, label: t('content.link.source') })
  if (project.issuesUrl) links.push({ href: project.issuesUrl, label: t('content.link.issues') })
  if (project.wikiUrl) links.push({ href: project.wikiUrl, label: t('content.link.wiki') })
  if (project.discordUrl) links.push({ href: project.discordUrl, label: t('content.link.discord') })
  for (const d of project.donationUrls) links.push({ href: d.url, label: d.platform })

  return (
    <div className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs sm:grid-cols-2">
      <section>
        <h3 className="mb-1.5 font-semibold">{t('content.side.compatibility')}</h3>
        <EnvironmentPanel client={project.clientSide} server={project.serverSide} />
        {project.loaders.length ? (
          <p className="mt-2">
            <LoaderInlineList loaders={project.loaders} />
          </p>
        ) : null}
      </section>
      <section>
        <h3 className="mb-1.5 font-semibold">{t('content.side.details')}</h3>
        <dl className="space-y-1 text-[var(--color-text-muted)]">
          {cats.length ? (
            <div>
              <dt className="inline">{t('content.side.categories')}: </dt>
              <dd className="inline">
                {cats
                  .filter((tag) => !LOADER_IDS.has(tag))
                  .slice(0, 8)
                  .map((tag) => tagLabel(tag, i18n.language))
                  .join(', ')}
              </dd>
            </div>
          ) : null}
          {(project.licenseName || project.licenseId) && (
            <div>
              <dt className="inline">{t('content.license')}: </dt>
              <dd className="inline">{project.licenseName || project.licenseId}</dd>
            </div>
          )}
          {formatDate(project.publishedAt) ? (
            <div>
              <dt className="inline">{t('content.published')}: </dt>
              <dd className="inline">{formatDate(project.publishedAt)}</dd>
            </div>
          ) : null}
          {formatDate(project.dateModified) ? (
            <div>
              <dt className="inline">{t('content.updated')}: </dt>
              <dd className="inline">{formatDate(project.dateModified)}</dd>
            </div>
          ) : null}
        </dl>
        {links.length ? (
          <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {links.map((l) => (
              <li key={l.href}>
                <a href={l.href} target="_blank" rel="noreferrer" className="text-[var(--color-accent)] hover:underline">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  )
}

function VersionsPanel({
  versions,
  selectedId,
  compatOnly,
  installedVersionId,
  creating,
  createMode,
  loading,
  error,
  onCompatOnly,
  onSelect,
  onInstall,
}: {
  versions: ContentVersion[]
  selectedId?: string
  compatOnly: boolean
  installedVersionId?: string
  creating?: boolean
  createMode?: boolean
  loading: boolean
  error: string | null
  onCompatOnly: (v: boolean) => void
  onSelect: (id: string) => void
  onInstall: (id: string) => void
}) {
  const { t } = useTranslation()
  const shown = useMemo(() => versions.slice(0, 24), [versions])
  return (
    <div>
      <label className="mb-2 flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
        <input type="checkbox" checked={compatOnly} onChange={(e) => onCompatOnly(e.target.checked)} />
        {t('content.compatOnly')}
      </label>
      {loading ? (
        <p className="text-sm text-[var(--color-text-muted)]">{t('common.loading')}</p>
      ) : error ? (
        <p className="text-sm text-[var(--color-danger)]">{error}</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">{t('content.noCompatVersions')}</p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)]">
          {shown.map((v) => {
            const on = v.id === selectedId
            return (
              <li
                key={v.id}
                className={[
                  'flex flex-wrap items-center gap-2 px-3 py-2',
                  on ? 'bg-[var(--color-selection-soft)]' : 'hover:bg-[var(--color-hover)]/50',
                ].join(' ')}
              >
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onSelect(v.id)}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{v.versionNumber}</span>
                    {v.versionType && v.versionType !== 'release' ? (
                      <span className="text-[10px] uppercase text-[var(--color-text-muted)]">{v.versionType}</span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-[var(--color-text-muted)]">
                    <LoaderInlineList loaders={v.loaders} />
                    {v.loaders.length && v.gameVersions.length ? ' · ' : null}
                    {[
                      ...v.gameVersions.slice(0, 3),
                      formatDate(v.datePublished),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </button>
                <ContentVersionInstallButton
                  installed={!createMode && installedVersionId === v.id}
                  installing={creating}
                  mode={createMode ? 'create' : 'install'}
                  onInstall={() => onInstall(v.id)}
                />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
