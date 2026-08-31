import { useQuery } from '@tanstack/react-query'
import { fledgeApi } from '../api/fledgeApi'
import { NewsList } from '../features/news/NewsList'
import { HomeLibrarySection } from '../features/instances/HomeLibrarySection'

export default function HomePage() {
  const instancesQuery = useQuery({
    queryKey: ['instances'],
    queryFn: () => fledgeApi.instances.list(),
  })

  const instances = instancesQuery.data ?? []

  return (
    <div className="flex h-full min-h-0 flex-col gap-[var(--home-gap)] overflow-hidden lg:grid lg:grid-cols-[minmax(0,1fr)_var(--home-news-col)] lg:grid-rows-[minmax(0,1fr)]">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:h-full">
        <HomeLibrarySection instances={instances} />
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-hidden lg:h-full">
        <NewsList compact />
      </div>
    </div>
  )
}
