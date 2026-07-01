import { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] 渲染错误:', error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900 p-6">
          <div className="max-w-md w-full text-center">
            <div className="text-6xl mb-4">💥</div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              页面出了点问题
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 break-all">
              {this.state.error?.message || '未知错误'}
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={this.handleReset}
                className="btn btn-secondary"
              >
                返回重试
              </button>
              <button
                onClick={this.handleReload}
                className="btn btn-primary"
              >
                刷新页面
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
