import { useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  IconArrowLeft,
  IconBook2,
  IconBrandDiscord,
  IconBug,
  IconClock,
  IconCode,
  IconDownload,
  IconExternalLink,
  IconHeart,
  IconHeartHandshake,
} from '@tabler/icons-react'
import type {
  ContentCategory,
  ContentLoaderFilter,
  ContentProject,
  ContentProjectDetail,
  InstanceProfile,
} from '@fledge/shared'
import { fledgeApi } from '../../api/fledgeApi'
import { MarkdownBody } from './MarkdownBody'
import {
  CategoryChip,
  EnvironmentPanel,
  LoaderChip,
  ProjectTagRow,
  loaderColor,
  loaderLabel,
} from './ModrinthTags'

function formatJaCount(n: number): string {
  if (n >= 100_000_000) {
    const v = n / 100_000_000
    return `${v >= 10 ? v.toFixed(1) : v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}億`
  }
  if (n >= 10_000) {
    const v = n / 10_000
    return `${Number.isInteger(v) ? v : v.toFixed(1)}万`
  }
  return n.toLocaleString('ja-JP')
}

function formatDate(iso?: string): string | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  return new Intl.DateTimeFormat('ja', { dateStyle: 'medium' }).format(new Date(ms))
}

const PROJECT_PATH: Record<ContentCategory, string> = {
  mod: 'mod',
  resourcepack: 'resourcepack',
  shader: 'shader',
  datapack: 'datapack',
  plugin: 'plugin',
}

type TabId = 'description' | 'gallery' | 'versions'

type Props = {
  hit: ContentProject
  instance: InstanceProfile
  gameVersion: string
  loaders: ContentLoaderFilter[]
  installing: boolean
  onBack: () => void
  onInstalled: () => void
  onError: (message: string | null) => void
}

export function ContentProjectView({
  hit,
  instance,
  gameVersion,
  loaders,
  installing,
  onBack,
  onInstalled,
  onError,
}: Props) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<TabId>('description')
  const [versionId, setVersionId] = useState<string | null>(null)
  const [compatOnly, setCompatOnly] = useState(true)
  const [galleryOpen, setGalleryOpen] = useState<string | null>(null)

  const pageQuery = useQuery({
    queryKey: ['content-project', hit.id],
    queryFn: () => fledgeApi.content.getProject(hit.id),
  })

  const project: ContentProjectDetail = {
    ...hit,
    body: '',
    gallery: [],
    donationUrls: [],
    members: [],
    ...(pageQuery.data?.project ?? {}),
  }
  const versions = pageQuery.data?.versions ?? []

  const filtered = useMemo(() => {
    if (!compatOnly) return versions
    return versions.filter((v) => {
      const gvOk = !gameVersion || v.gameVersions.includes(gameVersion)
      const loaderOk =
        loaders.length === 0 || v.loaders.some((l) => loaders.includes(l as ContentLoaderFilter))
      return gvOk && loaderOk
    })
  }, [versions, compatOnly, gameVersion, loaders])

  const selectedId = versionId && filtered.some((v) => v.id === versionId) ? versionId : filtered[0]?.id

  const installMutation = useMutation({
    mutationFn: (id?: string) =>
      fledgeApi.content.install({
        instanceId: instance.id,
        provider: 'modrinth',
        projectId: hit.id,
        category: hit.projectType,
        versionId: id ?? selectedId,
        gameVersion: gameVersion.trim() || undefined,
        loaders: hit.projectType === 'mod' || hit.projectType === 'plugin' ? loaders : [],
      }),
    onMutate: () => onError(null),
    onSuccess: () => onInstalled(),
    onError: (err) => onError(err instanceof Error ? err.message : String(err)),
  })

  const busy = installing || installMutation.isPending
  const modrinthUrl = `https://modrinth.com/${PROJECT_PATH[hit.projectType]}/${project.slug || hit.slug}`
  const cats = project.displayCategories?.length ? project.displayCategories : project.categories
  const featured = project.gallery.find((g) => g.featured) ?? project.gallery[0]
  const restGallery = project.gallery.filter((g) => g.url !== featured?.url)

  const tabs: { id: TabId; label: string; hidden?: boolean }[] = [
    { id: 'description', label: t('content.tab.description') },
    { id: 'gallery', label: t('content.tab.gallery'), hidden: project.gallery.length === 0 },
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
          {t('content.backToSearch')}
        </button>
        <a
          href={modrinthUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
        >
          {t('content.openOnModrinth')}
          <IconExternalLink size={12} stroke={1.75} />
        </a>
      </div>

      <header className="flex flex-wrap items-start gap-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        {project.iconUrl ? (
          <img
            src={project.iconUrl}
            alt=""
            className="size-24 shrink-0 rounded-[var(--radius-md)] object-cover"
          />
        ) : (
          <div className="size-24 shrink-0 rounded-[var(--radius-md)] bg-[var(--color-accent-soft)]" />
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-bold leading-tight">{project.name}</h2>
          {project.author ? (
            <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">
              {t('content.byAuthor', { name: project.author })}
            </p>
          ) : null}
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-text)]">{project.description}</p>
          <div className="mt-3">
            <ProjectTagRow
              clientSide={project.clientSide}
              serverSide={project.serverSide}
              categories={cats}
              loaders={project.loaders}
              maxCategories={8}
            />
          </div>
        </div>
        <div className="flex w-40 shrink-0 flex-col gap-2">
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-[var(--color-accent)] text-sm font-semibold text-[var(--color-on-accent)] disabled:opacity-50"
            disabled={busy || !selectedId}
            onClick={() => installMutation.mutate(undefined)}
          >
            <IconDownload size={18} stroke={1.75} />
            {busy ? t('content.installing') : t('content.install')}
          </button>
          <div className="flex justify-center gap-4 text-xs tabular-nums text-[var(--color-text-muted)]">
            <span className="inline-flex items-center gap-1">
              <IconDownload size={14} stroke={1.75} />
              {formatJaCount(project.downloads)}
            </span>
            {project.follows != null ? (
              <span className="inline-flex items-center gap-1">
                <IconHeart size={14} stroke={1.75} />
                {formatJaCount(project.follows)}
              </span>
            ) : null}
          </div>
          {installMutation.isError ? (
            <p className="text-[10px] text-[var(--color-danger)]">
              {installMutation.error instanceof Error
                ? installMutation.error.message
                : String(installMutation.error)}
            </p>
          ) : null}
        </div>
      </header>

      <nav className="flex shrink-0 gap-1 border-b border-[var(--color-border)]">
        {tabs
          .filter((item) => !item.hidden)
          .map((item) => (
            <button
              key={item.id}
              type="button"
              className={[
                '-mb-px border-b-2 px-3 py-2 text-sm font-medium',
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

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-h-0 overflow-y-auto pr-1">
          {pageQuery.isPending ? (
            <p className="text-sm text-[var(--color-text-muted)]">{t('common.loading')}</p>
          ) : pageQuery.isError ? (
            <p className="text-sm text-[var(--color-danger)]">
              {pageQuery.error instanceof Error ? pageQuery.error.message : String(pageQuery.error)}
            </p>
          ) : tab === 'description' ? (
            <MarkdownBody text={project.body || project.description} />
          ) : tab === 'gallery' ? (
            <div className="space-y-3">
              {featured ? (
                <button type="button" className="block w-full" onClick={() => setGalleryOpen(featured.url)}>
                  <img
                    src={featured.url}
                    alt={featured.title ?? ''}
                    className="max-h-[28rem] w-full rounded-[var(--radius-md)] object-contain bg-[var(--color-bg)]"
                  />
                </button>
              ) : null}
              {restGallery.length ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {restGallery.map((g) => (
                    <button
                      key={g.url}
                      type="button"
                      onClick={() => setGalleryOpen(g.url)}
                    >
                      <img
                        src={g.url}
                        alt={g.title ?? ''}
                        className="h-28 w-full rounded-[var(--radius-sm)] object-cover"
                      />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <VersionsPanel
              versions={filtered}
              selectedId={selectedId}
              compatOnly={compatOnly}
              busy={busy}
              onCompatOnly={(v) => {
                setCompatOnly(v)
                setVersionId(null)
              }}
              onSelect={setVersionId}
              onInstall={(id) => installMutation.mutate(id)}
            />
          )}
        </div>

        <aside className="min-h-0 space-y-4 overflow-y-auto pb-2 text-sm">
          <SideBlock title={t('content.side.compatibility')}>
            <EnvironmentPanel client={project.clientSide} server={project.serverSide} />
          </SideBlock>
          {project.loaders.length ? (
            <SideBlock title={t('content.filter.loader')}>
              <div className="flex flex-wrap gap-x-2 gap-y-1">
                {project.loaders.map((l) => (
                  <LoaderChip key={l} loader={l} />
                ))}
              </div>
            </SideBlock>
          ) : null}
          {cats.length ? (
            <SideBlock title={t('content.side.categories')}>
              <div className="flex flex-wrap gap-1">
                {cats.map((tag) => (
                  <CategoryChip key={tag} tag={tag} />
                ))}
              </div>
            </SideBlock>
          ) : null}
          {project.gameVersions.length ? (
            <SideBlock title={t('content.filter.gameVersion')}>
              <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
                {project.gameVersions.slice(0, 12).join(', ')}
                {project.gameVersions.length > 12
                  ? ` +${project.gameVersions.length - 12}`
                  : ''}
              </p>
            </SideBlock>
          ) : null}
          <LinksBlock project={project} />
          {project.members.length ? (
            <SideBlock title={t('content.side.creators')}>
              <ul className="space-y-2">
                {project.members.map((m) => (
                  <li key={m.username} className="flex items-center gap-2">
                    {m.avatarUrl ? (
                      <img src={m.avatarUrl} alt="" className="size-8 rounded-full object-cover" />
                    ) : (
                      <div className="size-8 rounded-full bg-[var(--color-accent-soft)]" />
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{m.username}</div>
                      {m.role ? (
                        <div className="text-[11px] text-[var(--color-text-muted)]">{m.role}</div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </SideBlock>
          ) : null}
          <SideBlock title={t('content.side.details')}>
            <dl className="space-y-1.5 text-xs">
              {(project.licenseName || project.licenseId) && (
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--color-text-muted)]">{t('content.license')}</dt>
                  <dd>
                    {project.licenseUrl ? (
                      <a
                        href={project.licenseUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--color-accent)] hover:underline"
                      >
                        {project.licenseName || project.licenseId}
                      </a>
                    ) : (
                      project.licenseName || project.licenseId
                    )}
                  </dd>
                </div>
              )}
              {formatDate(project.publishedAt) ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--color-text-muted)]">{t('content.published')}</dt>
                  <dd>{formatDate(project.publishedAt)}</dd>
                </div>
              ) : null}
              {formatDate(project.dateModified) ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--color-text-muted)]">{t('content.updated')}</dt>
                  <dd>{formatDate(project.dateModified)}</dd>
                </div>
              ) : null}
            </dl>
          </SideBlock>
        </aside>
      </div>

      {galleryOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-6"
          onClick={() => setGalleryOpen(null)}
        >
          <img src={galleryOpen} alt="" className="max-h-full max-w-full object-contain" />
        </button>
      ) : null}
    </div>
  )
}

function SideBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-bold tracking-wide text-[var(--color-text)]">{title}</h3>
      {children}
    </section>
  )
}

function LinksBlock({ project }: { project: ContentProjectDetail }) {
  const { t } = useTranslation()
  const links: Array<{ href: string; label: string; icon: ReactNode }> = []
  if (project.sourceUrl) {
    links.push({ href: project.sourceUrl, label: t('content.link.source'), icon: <IconCode size={14} stroke={1.75} /> })
  }
  if (project.issuesUrl) {
    links.push({ href: project.issuesUrl, label: t('content.link.issues'), icon: <IconBug size={14} stroke={1.75} /> })
  }
  if (project.wikiUrl) {
    links.push({ href: project.wikiUrl, label: t('content.link.wiki'), icon: <IconBook2 size={14} stroke={1.75} /> })
  }
  if (project.discordUrl) {
    links.push({
      href: project.discordUrl,
      label: t('content.link.discord'),
      icon: <IconBrandDiscord size={14} stroke={1.75} />,
    })
  }
  for (const d of project.donationUrls) {
    links.push({
      href: d.url,
      label: d.platform,
      icon: <IconHeartHandshake size={14} stroke={1.75} />,
    })
  }
  if (!links.length) return null
  return (
    <SideBlock title={t('content.side.links')}>
      <ul className="space-y-1">
        {links.map((l) => (
          <li key={l.href}>
            <a
              href={l.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-[var(--color-accent)] hover:underline"
            >
              {l.icon}
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </SideBlock>
  )
}

function VersionsPanel({
  versions,
  selectedId,
  compatOnly,
  busy,
  onCompatOnly,
  onSelect,
  onInstall,
}: {
  versions: Array<{
    id: string
    name: string
    versionNumber: string
    gameVersions: string[]
    loaders: string[]
    datePublished?: string
    downloads: number
    versionType?: 'release' | 'beta' | 'alpha'
  }>
  selectedId?: string
  compatOnly: boolean
  busy: boolean
  onCompatOnly: (v: boolean) => void
  onSelect: (id: string) => void
  onInstall: (id: string) => void
}) {
  const { t } = useTranslation()
  const typeColor: Record<string, string> = {
    release: '#1bd96a',
    beta: '#e07a3d',
    alpha: '#e35d6a',
  }
  return (
    <div>
      <label className="mb-2 flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
        <input
          type="checkbox"
          checked={compatOnly}
          onChange={(e) => onCompatOnly(e.target.checked)}
        />
        {t('content.compatOnly')}
      </label>
      {versions.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">{t('content.noCompatVersions')}</p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)]">
          {versions.slice(0, 60).map((v) => {
            const on = v.id === selectedId
            return (
              <li
                key={v.id}
                className={[
                  'flex flex-wrap items-center gap-2 px-3 py-2.5',
                  on ? 'bg-[var(--color-selection-soft)]' : 'hover:bg-[var(--color-hover)]/50',
                ].join(' ')}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => onSelect(v.id)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{v.versionNumber}</span>
                    {v.versionType && v.versionType !== 'release' ? (
                      <span
                        className="text-[10px] font-bold uppercase"
                        style={{ color: typeColor[v.versionType] }}
                      >
                        {v.versionType}
                      </span>
                    ) : null}
                    <span className="truncate text-xs text-[var(--color-text-muted)]">{v.name}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--color-text-muted)]">
                    {v.loaders.map((l) => (
                      <span key={l} style={{ color: loaderColor(l) }} className="font-semibold">
                        {loaderLabel(l)}
                      </span>
                    ))}
                    {v.gameVersions.slice(0, 4).map((g) => (
                      <span key={g}>{g}</span>
                    ))}
                    {v.gameVersions.length > 4 ? <span>+{v.gameVersions.length - 4}</span> : null}
                    {formatDate(v.datePublished) ? (
                      <span className="inline-flex items-center gap-0.5">
                        <IconClock size={11} stroke={1.75} />
                        {formatDate(v.datePublished)}
                      </span>
                    ) : null}
                    <span className="inline-flex items-center gap-0.5 tabular-nums">
                      <IconDownload size={11} stroke={1.75} />
                      {formatJaCount(v.downloads)}
                    </span>
                  </div>
                </button>
                <button
                  type="button"
                  className="shrink-0 rounded-full bg-[var(--color-accent)] px-3 py-1 text-xs font-medium text-[var(--color-on-accent)] disabled:opacity-50"
                  disabled={busy}
                  onClick={() => onInstall(v.id)}
                >
                  {t('content.install')}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
