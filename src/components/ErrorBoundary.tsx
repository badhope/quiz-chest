import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  /** 出错时展示的降级内容；缺省使用内置提示。 */
  fallback?: (error: Error, reset: () => void) => ReactNode
  /** 错误上报钩子，便于接入监控而不引入依赖。 */
  onError?: (error: Error, info: ErrorInfo) => void
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * 局部错误边界。
 *
 * 目的不是兜住一切，而是保证「一个页面/一个图表崩了」不会把整个应用变成白屏。
 * 用法：在路由出口与体积大、依赖外部输入的子树（如图表、导入预览）各包一层。
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info)
  }

  reset = (): void => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    if (this.props.fallback) return this.props.fallback(error, this.reset)

    return (
      <div className="error-fallback" role="alert">
        <h2 className="serif">这部分出错了</h2>
        <p>其他功能仍可正常使用。可以重试，或返回上一页继续操作。</p>
        <pre className="error-fallback-detail">{error.message}</pre>
        <div className="error-fallback-actions">
          <button className="button button-primary button-sm" onClick={this.reset}>
            重试
          </button>
          <button
            className="button button-ghost button-sm"
            onClick={() => window.location.reload()}
          >
            重新加载
          </button>
        </div>
      </div>
    )
  }
}
