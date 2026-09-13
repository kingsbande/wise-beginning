import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'
import { searchEverything } from '../lib/globalSearchApi'
import { useDebouncedValue } from '../lib/useDebouncedValue'

interface GlobalSearchProps {
  onSelectStudent: (name: string) => void
  onSelectParent: (name: string) => void
  onSelectStaff: (name: string) => void
  theme?: 'dark' | 'light'
}

export function GlobalSearch({ onSelectStudent, onSelectParent, onSelectStaff, theme = 'dark' }: GlobalSearchProps) {
  const [term, setTerm] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const debouncedTerm = useDebouncedValue(term, 300)
  const containerRef = useRef<HTMLDivElement>(null)

  const { data, isFetching } = useQuery({
    queryKey: ['global-search', debouncedTerm],
    queryFn: () => searchEverything(debouncedTerm),
    enabled: debouncedTerm.trim().length >= 2,
  })

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const hasResults =
    !!data && (data.students.length > 0 || data.parents.length > 0 || data.staff.length > 0)

  function selectStudent(name: string) {
    onSelectStudent(name)
    setIsOpen(false)
    setTerm('')
  }
  function selectParent(name: string) {
    onSelectParent(name)
    setIsOpen(false)
    setTerm('')
  }
  function selectStaff(name: string) {
    onSelectStaff(name)
    setIsOpen(false)
    setTerm('')
  }

  // `theme='dark'` is used in the slate-900 top header; `theme='light'`
  // is used inside the white mobile drawer so the same search component
  // stays readable on both surfaces.
  const isDark = theme === 'dark'

  const inputClassName = isDark
    ? 'w-full rounded-lg border border-white/15 bg-white/5 py-2 pl-9 pr-8 text-sm text-white placeholder:text-slate-400 focus:border-rose-400 focus:outline-none'
    : 'w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-8 text-sm text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none'

  return (
    <div ref={containerRef} className="relative w-full max-w-xs">
      <div className="relative">
        <Search
          className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${
            isDark ? 'text-slate-400' : 'text-slate-500'
          }`}
        />
        <input
          value={term}
          onChange={(e) => {
            setTerm(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Search students, parents, staff..."
          className={inputClassName}
        />
        {term && (
          <button
            onClick={() => {
              setTerm('')
              setIsOpen(false)
            }}
            aria-label="Clear search"
            className={`absolute right-2 top-1/2 -translate-y-1/2 ${
              isDark ? 'text-slate-400 hover:text-white' : 'text-slate-400 hover:text-slate-700'
            }`}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {isOpen && debouncedTerm.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-96 overflow-y-auto rounded-xl border border-slate-200 bg-white text-left shadow-xl">
          {isFetching ? (
            <p className="p-4 text-sm text-slate-500">Searching...</p>
          ) : !hasResults ? (
            <p className="p-4 text-sm text-slate-500">No results.</p>
          ) : (
            <>
              {data!.students.length > 0 && (
                <div>
                  <p className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Students
                  </p>
                  {data!.students.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => selectStudent(r.label)}
                      className="flex w-full flex-col items-start px-4 py-2 text-left hover:bg-slate-50"
                    >
                      <span className="text-sm font-medium text-slate-900">{r.label}</span>
                      <span className="text-xs text-slate-500">{r.subtitle}</span>
                    </button>
                  ))}
                </div>
              )}

              {data!.parents.length > 0 && (
                <div>
                  <p className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Parent Accounts
                  </p>
                  {data!.parents.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => selectParent(r.label)}
                      className="flex w-full flex-col items-start px-4 py-2 text-left hover:bg-slate-50"
                    >
                      <span className="text-sm font-medium text-slate-900">{r.label}</span>
                      <span className="text-xs text-slate-500">{r.subtitle}</span>
                    </button>
                  ))}
                </div>
              )}

              {data!.staff.length > 0 && (
                <div>
                  <p className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Staff
                  </p>
                  {data!.staff.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => selectStaff(r.label)}
                      className="flex w-full flex-col items-start px-4 py-2 pb-3 text-left hover:bg-slate-50"
                    >
                      <span className="text-sm font-medium text-slate-900">{r.label}</span>
                      <span className="text-xs text-slate-500">{r.subtitle}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
