type Translate = (key: string, opts?: Record<string, unknown>) => string

/** i18n キーらしい文字列か（ドット区切り・空白なし） */
export function looksLikeMessageKey(value: string): boolean {
  return /^[a-z][a-z0-9]*(\.[a-z0-9]+)+$/i.test(value.trim())
}

/**
 * 起動エラー表示用。キーは翻訳し、生の英語メッセージ等は「原因」として出す。
 * 古いイベントで errorMessageKey に詳細が直書きされている場合も吸収する。
 */
export function formatLaunchErrorDisplay(
  t: Translate,
  errorMessageKey: string | null | undefined,
  errorDetail?: string | null,
): { summary: string; detail: string | null } {
  const key = errorMessageKey?.trim() || ''
  const detailRaw = errorDetail?.trim() || ''

  if (!key && !detailRaw) {
    return { summary: t('launch.error.generic'), detail: null }
  }

  if (key && looksLikeMessageKey(key)) {
    return {
      summary: t(key),
      detail: detailRaw || null,
    }
  }

  // キーではなく生メッセージが渡ってきた場合
  if (key && detailRaw) {
    return { summary: t('launch.error.generic'), detail: `${key}\n${detailRaw}` }
  }
  if (key) {
    return { summary: t('launch.error.generic'), detail: key }
  }
  return { summary: t('launch.error.generic'), detail: detailRaw || null }
}
