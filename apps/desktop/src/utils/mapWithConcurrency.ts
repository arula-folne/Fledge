/**
 * 配列を制限付き並列で処理し、Promise.allSettled 相当の結果を返す。
 * コンテンツ一括 install など、IPC / ディスクを一気に塞がない用途。
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length)
  let next = 0
  const limit = Math.max(1, Math.min(concurrency, Math.max(items.length, 1)))
  const workers = Array.from({ length: limit }, async () => {
    for (;;) {
      const index = next
      next += 1
      if (index >= items.length) return
      try {
        const value = await fn(items[index]!, index)
        results[index] = { status: 'fulfilled', value }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  })
  await Promise.all(workers)
  return results
}
