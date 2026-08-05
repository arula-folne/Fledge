import { randomUUID } from 'node:crypto'
import type { LogLevel, LogLine, LogSource } from '@fledge/shared'

export type LogListener = (line: LogLine) => void

export class Logger {
  private listeners = new Set<LogListener>()
  private recent: LogLine[] = []
  private readonly maxRecent: number

  constructor(maxRecent = 2000) {
    this.maxRecent = maxRecent
  }

  onLine(listener: LogListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getRecent(): LogLine[] {
    return [...this.recent]
  }

  log(source: LogSource, level: LogLevel, message: string, context?: Record<string, string>): void {
    const line: LogLine = {
      id: randomUUID(),
      ts: Date.now(),
      source,
      level,
      message,
      context,
    }
    this.recent.push(line)
    if (this.recent.length > this.maxRecent) {
      this.recent.splice(0, this.recent.length - this.maxRecent)
    }
    for (const listener of this.listeners) listener(line)
  }

  info(source: LogSource, message: string, context?: Record<string, string>): void {
    this.log(source, 'info', message, context)
  }

  warn(source: LogSource, message: string, context?: Record<string, string>): void {
    this.log(source, 'warn', message, context)
  }

  error(source: LogSource, message: string, context?: Record<string, string>): void {
    this.log(source, 'error', message, context)
  }

  debug(source: LogSource, message: string, context?: Record<string, string>): void {
    this.log(source, 'debug', message, context)
  }
}
