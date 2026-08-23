/** ダウンロード数などを日本語向けに短く表示する（例: 1.2万、3億）。 */
export function formatJaCount(n: number): string {
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
