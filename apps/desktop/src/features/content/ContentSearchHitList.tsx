import { Fragment, type ReactNode } from 'react'
import type { ContentProject } from '@fledge/shared'
import { ContentCategoryLabel } from './contentCategoryIcons'
import { groupProjectsByCategory } from './contentFavoritesList'

const listClass =
  'divide-y divide-[var(--color-border)] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]'

type Props = {
  hits: ContentProject[]
  groupByCategory?: boolean
  renderRow: (hit: ContentProject, index: number) => ReactNode
}

export function ContentSearchHitList({ hits, groupByCategory = false, renderRow }: Props) {
  if (!groupByCategory) {
    return (
      <ul className={listClass}>
        {hits.map((hit, index) => (
          <Fragment key={`${hit.provider}:${hit.id}`}>{renderRow(hit, index)}</Fragment>
        ))}
      </ul>
    )
  }

  const groups = groupProjectsByCategory(hits)
  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <section key={group.category} className="min-w-0">
          <h3 className="mb-1.5 flex items-center gap-1.5 px-0.5 text-sm font-semibold text-[var(--color-text)]">
            <ContentCategoryLabel category={group.category} iconSize={15} />
            <span className="tabular-nums text-[var(--color-text-muted)]">{group.items.length}</span>
          </h3>
          <ul className={listClass}>
            {group.items.map((hit, index) => (
              <Fragment key={`${hit.provider}:${hit.id}`}>{renderRow(hit, index)}</Fragment>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
