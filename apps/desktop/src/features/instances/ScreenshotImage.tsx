import { useEffect, useMemo, useRef, useState, type ImgHTMLAttributes } from 'react'
import { fledgeApi } from '../../api/fledgeApi'
import { instanceScreenshotUrl } from './screenshotUrls'

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> & {
  instanceId: string
  fileName: string
  filePath?: string | null
  /** 壊れた画像アイコン横のファイル名表示を避けるため既定は空 */
  alt?: string
}

/**
 * asset URL で表示し、失敗時は共有読み込みの data URL へフォールバックする。
 * ゲーム起動中でもギャラリー閲覧できるようにする。
 */
export function ScreenshotImage({
  instanceId,
  fileName,
  filePath,
  alt = '',
  onError,
  ...imgProps
}: Props) {
  const assetUrl = useMemo(
    () => instanceScreenshotUrl(instanceId, fileName, filePath),
    [instanceId, fileName, filePath],
  )
  const [src, setSrc] = useState(assetUrl)
  const fallbackTried = useRef(false)

  useEffect(() => {
    setSrc(assetUrl)
    fallbackTried.current = false
  }, [assetUrl])

  return (
    <img
      {...imgProps}
      src={src}
      alt={alt}
      onError={(event) => {
        onError?.(event)
        if (fallbackTried.current) return
        fallbackTried.current = true
        void fledgeApi.content
          .readScreenshot(instanceId, fileName)
          .then((dataUrl) => {
            if (dataUrl) setSrc(dataUrl)
          })
          .catch(() => {
            /* keep broken state */
          })
      }}
    />
  )
}
