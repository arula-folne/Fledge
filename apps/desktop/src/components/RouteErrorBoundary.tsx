import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  fallback?: ReactNode
}

type State = {
  error: Error | null
}

/** 画面全体が白落ちしないようルート単位でエラーを捕捉 */
export class RouteErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Route error:', error, info.componentStack)
  }

  override render(): ReactNode {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="mx-auto flex max-w-lg flex-col gap-3 p-8">
          <h1 className="text-lg font-semibold">表示中にエラーが発生しました</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            {this.state.error.message}
          </p>
          <button
            type="button"
            className="self-start rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-3 py-2 text-sm text-white"
            onClick={() => this.setState({ error: null })}
          >
            再試行
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
