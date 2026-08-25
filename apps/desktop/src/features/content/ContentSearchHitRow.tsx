import type { ContentProject } from '@fledge/shared'
import { ContentInstallButton } from './ContentInstallButton'
import { ProjectTagRow } from './ContentTags'
import { formatJaCount } from '../../utils/formatJaCount'

type Props = {
  hit: ContentProject
  tagIcons: Map<string, string>
  onOpen: () => void
  onInstall: () => void
  installing?: boolean
  installed?: boolean
  /** install=既存へ導入 / create=新規インスタンス作成 */
  mode?: 'install' | 'create'
  /** 行の明暗交互用 */
  index?: number
}

/**
 * 検索ヒット行。説明・タグの有無に関わらず高さを揃える。
 */
export function ContentSearchHitRow({
  hit,
  tagIcons,
  onOpen,
  onInstall,
  installing = false,
  installed = false,
  mode = 'install',
  index = 0,
}: Props) {
  const zebra = index % 2 === 1
  return (
    <li>
      <div
        className={[
          'flex h-[5.75rem] items-center gap-4 overflow-hidden px-4 py-3',
          zebra ? 'bg-[var(--color-zebra)]' : 'bg-[var(--color-surface)]',
        ].join(' ')}
      >
        <button
          type="button"
          className="flex min-h-0 min-w-0 flex-1 items-center gap-3.5 text-left"
          onClick={onOpen}
        >
          {hit.iconUrl ? (
            <img
              src={hit.iconUrl}
              alt=""
              width={48}
              height={48}
              loading="lazy"
              decoding="async"
              className="size-12 shrink-0 rounded-[var(--radius-sm)] object-cover"
            />
          ) : (
            <div className="size-12 shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-accent-soft)]" />
          )}
          <div className="grid min-w-0 flex-1 grid-rows-[auto_1.25rem_1.25rem] gap-1.5">
            <div className="flex min-w-0 items-baseline gap-2.5">
              <span className="truncate text-base font-medium leading-snug">{hit.name}</span>
              {hit.author ? (
                <span className="truncate text-sm leading-snug text-[var(--color-text-muted)]">
                  {hit.author}
                </span>
              ) : null}
              <span className="ml-auto shrink-0 text-sm tabular-nums leading-snug text-[var(--color-text-muted)]">
                {formatJaCount(hit.downloads)}
              </span>
            </div>
            <p className="truncate text-sm leading-5 text-[var(--color-text-muted)]">
              {hit.description?.trim() || '\u00a0'}
            </p>
            <div className="min-h-5 overflow-hidden leading-5">
              <ProjectTagRow
                categories={hit.displayCategories ?? []}
                loaders={hit.loaders ?? []}
                tagIcons={tagIcons}
              />
            </div>
          </div>
        </button>
        <div className="shrink-0">
          <ContentInstallButton
            size="sm"
            mode={mode}
            installing={installing}
            installed={installed}
            onInstall={onInstall}
          />
        </div>
      </div>
    </li>
  )
}
