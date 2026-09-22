import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fledgeApi } from '../../api/fledgeApi'
import { ScreenshotGallery, type ScreenshotGalleryEntry } from './ScreenshotGallery'

type Props = {
  instanceId: string
}

/** インスタンス screenshots/ を表示 */
export function ScreenshotsTab({ instanceId }: Props) {
  const screenshotsQuery = useQuery({
    queryKey: ['content-media', instanceId, 'screenshots'],
    queryFn: () => fledgeApi.content.listMedia(instanceId, 'screenshots'),
  })

  const entries = useMemo<ScreenshotGalleryEntry[]>(
    () =>
      (screenshotsQuery.data ?? []).map((file) => ({
        instanceId,
        fileName: file.name,
        filePath: file.path,
        mtime: file.mtime,
      })),
    [screenshotsQuery.data, instanceId],
  )

  return (
    <ScreenshotGallery
      entries={entries}
      pending={screenshotsQuery.isPending}
      openFolderInstanceId={instanceId}
    />
  )
}
