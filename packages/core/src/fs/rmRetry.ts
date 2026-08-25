import fs from 'node:fs/promises'

export async function rmRetry(target: string, attempts = 5): Promise<void> {
  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      await fs.rm(target, { recursive: true, force: true })
      return
    } catch (err) {
      lastError = err
      await new Promise((resolve) => setTimeout(resolve, 250 * (i + 1)))
    }
  }
  throw lastError
}
