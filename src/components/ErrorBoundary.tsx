import React, { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error?: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Uncaught error in component tree:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="max-w-2xl rounded-lg border border-red-200 bg-white p-6 shadow">
            <h2 className="mb-2 text-lg font-semibold text-red-700">Something went wrong</h2>
            <p className="mb-4 text-sm text-red-600">An error occurred while rendering this page.</p>
            <details className="whitespace-pre-wrap text-xs text-slate-700">
              {this.state.error?.message}
              {'\n'}
              {this.state.error?.stack}
            </details>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
