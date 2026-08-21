import { Component, type ErrorInfo, type ReactNode } from 'react'

type ResetContext = {
  error: Error
  reset: () => void
}

type Props = {
  children: ReactNode
  /** 固定 or 関数フォールバック。未指定時は title / description / 再試行 UI を出す */
  fallback?: ReactNode | ((ctx: ResetContext) => ReactNode)
  title?: string
  description?: string
  retryLabel?: string
  /** 値が変わると捕捉中のエラーをクリア（モーダル閉鎖など） */
  resetKeys?: readonly unknown[]
  onRetry?: () => void
}

type State = {
  error: Error | null
}

function sameResetKeys(a?: readonly unknown[], b?: readonly unknown[]): boolean {
  if (a === b) return true
  if (!a || !b || a.length !== b.length) return false
  return a.every((value, i) => Object.is(value, b[i]))
}

function isLoadFailure(error: Error): boolean {
  return /Failed to fetch dynamically imported module|Loading chunk|Cannot find module|Unexpected token|is not defined/i.test(
    error.message,
  )
}

/** 画面全体が白落ちしないようルート／機能単位でエラーを捕捉 */
export class RouteErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Route error:', error, info.componentStack)
  }

  override componentDidUpdate(prevProps: Props): void {
    if (!this.state.error) return
    if (!sameResetKeys(prevProps.resetKeys, this.props.resetKeys)) {
      this.setState({ error: null })
    }
  }

  private reset = (): void => {
    this.setState({ error: null })
    this.props.onRetry?.()
  }

  override render(): ReactNode {
    if (this.state.error) {
      const { fallback } = this.props
      if (typeof fallback === 'function') {
        return fallback({ error: this.state.error, reset: this.reset })
      }
      if (fallback) return fallback

      const loadFailure = isLoadFailure(this.state.error)
      const title =
        this.props.title ??
        (loadFailure ? '画面の読み込みに失敗しました' : '表示中にエラーが発生しました')
      const description =
        this.props.description ??
        (loadFailure
          ? 'モジュールの読み込みに失敗しました。再試行するか、一度別の画面へ戻ってから開き直してください。'
          : this.state.error.message)

      return (
        <div className="mx-auto flex max-w-lg flex-col gap-3 p-8">
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="text-sm text-[var(--color-text-muted)]">{description}</p>
          {!loadFailure && this.props.description ? (
            <p className="text-xs text-[var(--color-text-muted)]">{this.state.error.message}</p>
          ) : null}
          <button
            type="button"
            className="self-start rounded-[var(--radius-md)] bg-[var(--color-accent)] px-3 py-2 text-sm text-white"
            onClick={this.reset}
          >
            {this.props.retryLabel ?? '再試行'}
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
