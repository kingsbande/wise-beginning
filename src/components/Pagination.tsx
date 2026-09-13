interface PaginationProps {
  page: number // 0-indexed
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}

export function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : page * pageSize + 1
  const to = Math.min(total, (page + 1) * pageSize)

  const controlClassName =
    'inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-900 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2'

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
      <span className="text-xs sm:text-sm">
        {total === 0 ? 'No results' : `Showing ${from}–${to} of ${total}`}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 0}
          className={controlClassName}
        >
          Previous
        </button>
        <span className="inline-flex min-h-[44px] items-center px-3 text-xs text-slate-500">
          Page {page + 1} of {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page + 1 >= totalPages}
          className={controlClassName}
        >
          Next
        </button>
      </div>
    </div>
  )
}
