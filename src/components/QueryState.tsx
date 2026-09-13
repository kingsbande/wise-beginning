import { Loader2, RefreshCw, Inbox, AlertTriangle } from 'lucide-react'

type QueryStateProps = {
  isLoading: boolean
  isError: boolean
  error?: Error | null
  isFetching?: boolean
  onRetry?: () => void
  empty?: boolean
  emptyTitle?: string
  emptyHint?: string
  emptyAction?: React.ReactNode
  children: React.ReactNode
}

export function QueryState({
  isLoading,
  isError,
  error,
  isFetching,
  onRetry,
  empty,
  emptyTitle = 'Nothing here yet',
  emptyHint,
  emptyAction,
  children,
}: QueryStateProps) {
  if (isLoading) {
    return (
      <div role="status" className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
        <Loader2 className="h-7 w-7 animate-spin text-rose-500" />
        <p className="text-sm font-medium text-slate-500 animate-pulse" aria-live="polite">
          Loading records...
        </p>
      </div>
    )
  }

  if (isError) {
    return (
      <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-6 py-10 text-center">
        <AlertTriangle className="h-8 w-8 text-rose-600" />
        <p className="text-sm font-semibold text-rose-900">We couldn’t load these records.</p>
        <p className="max-w-sm text-xs text-rose-700">{error?.message ?? 'Please check your connection and try again.'}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 transition-colors"
          >
            <RefreshCw className="h-4 w-4" /> Try again
          </button>
        )}
      </div>
    )
  }

  if (empty) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Inbox className="h-10 w-10 text-slate-300" />
        <p className="text-sm font-semibold text-slate-600">{emptyTitle}</p>
        {emptyHint && <p className="max-w-xs text-xs text-slate-400">{emptyHint}</p>}
        {emptyAction}
      </div>
    )
  }

  return (
    <div className={`transition-opacity duration-200 ${isFetching ? 'opacity-50' : 'opacity-100'}`} aria-busy={isFetching}>
      {children}
    </div>
  )
}
