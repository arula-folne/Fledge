/** UI 表示用に整数化した進捗%（0–100）。不明時は -1 */
export function displayPercentOf(
  percent?: number | null,
  current?: number | null,
  total?: number | null,
): number {
  if (percent != null && Number.isFinite(percent)) {
    return Math.round(Math.min(100, Math.max(0, percent)))
  }
  if (total != null && total > 0 && current != null && Number.isFinite(current)) {
    return Math.round(Math.min(100, Math.max(0, (current / total) * 100)))
  }
  return -1
}

type ProgressLike = {
  percent?: number | null
  current?: number | null
  total?: number | null
  messageKey?: string | null
  status?: string | null
  kind?: string | null
}

/** 見た目が変わらない進捗はストア／再描画をスキップする */
export function progressUiEqual(a: ProgressLike, b: ProgressLike): boolean {
  return (
    displayPercentOf(a.percent, a.current, a.total) ===
      displayPercentOf(b.percent, b.current, b.total) &&
    (a.messageKey ?? '') === (b.messageKey ?? '') &&
    (a.status ?? '') === (b.status ?? '') &&
    (a.kind ?? '') === (b.kind ?? '')
  )
}
