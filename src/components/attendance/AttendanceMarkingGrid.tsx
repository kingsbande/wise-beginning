import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react'
import {
  ATTENDANCE_STATUSES,
  fetchAttendanceGrid,
  saveAttendance,
  normalizeClassId,
} from '../../lib/attendanceApi'
import type { AttendanceStatus } from '../../types'
import { getUserFriendlyError } from '../../lib/errorMessages'

interface AttendanceMarkingGridProps {
  schoolId: string
  classId: string
  className: string
  markedBy: string
}

const STATUS_PILL_STYLES: Record<AttendanceStatus, string> = {
  present: 'bg-green-600 text-white border-green-600 shadow-xs',
  absent: 'bg-red-600 text-white border-red-600 shadow-xs',
  late: 'bg-amber-500 text-white border-amber-500 shadow-xs',
  half_day: 'bg-blue-500 text-white border-blue-500 shadow-xs',
  excused: 'bg-slate-500 text-white border-slate-500 shadow-xs',
}

const STATUS_PILL_INACTIVE = 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'

export function AttendanceMarkingGrid({
  schoolId,
  classId,
  className,
  markedBy,
}: AttendanceMarkingGridProps) {
  const queryClient = useQueryClient()
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [drafts, setDrafts] = useState<Record<string, AttendanceStatus | null>>({})
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const safeClassId = classId ? normalizeClassId(classId) : '';
  const { data: rows = [], isLoading, isFetching, isError: isGridError, error: gridError, refetch } = useQuery({
    queryKey: ['attendance-grid', safeClassId, date],
    queryFn: () => fetchAttendanceGrid({ classId: safeClassId, date }),
    enabled: !!classId,
  });

  // Sync drafts when rows from database change
  useEffect(() => {
    const next: Record<string, AttendanceStatus | null> = {}
    for (const row of rows) {
      next[row.student_id] = row.status
    }
    setDrafts(next)
  }, [rows])

  // Check if there are unsaved local modifications
  const hasUnsavedChanges = useMemo(() => {
    if (rows.length === 0) return false
    for (const row of rows) {
      if ((drafts[row.student_id] ?? null) !== (row.status ?? null)) {
        return true
      }
    }
    return false
  }, [rows, drafts])

  const saveMutation = useMutation({
    mutationFn: async () => {
      setErrorMessage(null)
      setSaveSuccessMessage(null)

      const changedRows = rows.filter((row) => (drafts[row.student_id] ?? null) !== (row.status ?? null))
      const toSave = changedRows.flatMap((row) => {
        const status = drafts[row.student_id]
        return status ? [{ student_id: row.student_id, status }] : []
      })
      const clearedStudentIds = changedRows
        .filter((row) => row.status !== null && drafts[row.student_id] === null)
        .map((row) => row.student_id)

      if (toSave.length === 0 && clearedStudentIds.length === 0) {
        throw new Error('There are no attendance changes to save.')
      }

      return saveAttendance({ schoolId, classId, date, markedBy, rows: toSave, clearedStudentIds })
    },
    onSuccess: ({ savedCount, clearedCount }) => {
      const messages = []
      if (savedCount > 0) messages.push(`saved attendance for ${savedCount} student(s)`)
      if (clearedCount > 0) messages.push(`cleared ${clearedCount} saved mark(s)`)
      setSaveSuccessMessage(`Successfully ${messages.join(' and ')}.`)
      // Invalidate queries so that grid and reports update immediately
      queryClient.invalidateQueries({ queryKey: ['attendance-grid', classId, date] })
      queryClient.invalidateQueries({ queryKey: ['attendance-summary'] })
      queryClient.invalidateQueries({ queryKey: ['attendance-records'] })
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : getErrorMessage(error)
      const partialSavePrefixes = [
        'Attendance marks were saved, but cleared records could not be removed: ',
        'Cleared records could not be removed: ',
      ]
      const partialSavePrefix = partialSavePrefixes.find((prefix) => message.startsWith(prefix))
      if (partialSavePrefix) {
        queryClient.invalidateQueries({ queryKey: ['attendance-grid', classId, date] })
        queryClient.invalidateQueries({ queryKey: ['attendance-summary'] })
        const detail = getUserFriendlyError(
          new Error(message.slice(partialSavePrefix.length)),
          'Check that you have permission for this class and that the attendance permissions SQL has been applied, then refresh the register.',
        )
        const outcome = partialSavePrefix.startsWith('Attendance marks')
          ? 'Some attendance marks were saved, but the selected marks could not be cleared.'
          : 'The selected attendance marks could not be cleared.'
        setErrorMessage(`${outcome} ${detail}`)
        return
      }

      if (message.toLowerCase().includes('timed out')) {
        setErrorMessage('The request took too long. Refresh the register to confirm whether the attendance was saved before retrying.')
        return
      }

      setErrorMessage(getUserFriendlyError(
        new Error(message),
        'Attendance could not be saved. Please refresh the register and try again.',
      ))
    },
  })

  function markAllPresent() {
    setSaveSuccessMessage(null)
    setErrorMessage(null)
    const next: Record<string, AttendanceStatus | null> = {}
    for (const row of rows) {
      next[row.student_id] = 'present'
    }
    setDrafts(next)
  }

  const markedCount = rows.filter((r) => drafts[r.student_id] != null).length
  const unmarkedCount = rows.length - markedCount

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-4">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-base font-semibold text-gray-900 sm:text-lg">{className}</h3>
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value)
              setSaveSuccessMessage(null)
              setErrorMessage(null)
            }}
            disabled={saveMutation.isPending}
            max={new Date().toISOString().slice(0, 10)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-800 shadow-xs focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-400/20"
          />
          <button
            onClick={markAllPresent}
            disabled={isLoading || rows.length === 0 || saveMutation.isPending}
            className="rounded-lg border border-green-600 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-50 transition-colors disabled:opacity-50"
          >
            Mark All Present
          </button>
          <button
            onClick={() => refetch()}
            disabled={isFetching || saveMutation.isPending}
            title="Reload from server"
            className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {hasUnsavedChanges && (
            <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 border border-amber-200">
              Unsaved changes
            </span>
          )}
          {unmarkedCount > 0 && (
            <span className="text-xs text-slate-500">
              {unmarkedCount} of {rows.length} unmarked
            </span>
          )}
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || isLoading || rows.length === 0 || !hasUnsavedChanges}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-500 transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-rose-400/30"
          >
            {saveMutation.isPending ? 'Saving attendance...' : 'Save Attendance'}
          </button>
        </div>
      </div>

      {/* Alerts */}
      {saveSuccessMessage && (
        <div role="status" aria-live="polite" className="mt-3 flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-800 border border-green-200">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-green-600" />
          <span>{saveSuccessMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div role="alert" aria-live="assertive" className="mt-3 flex items-center gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-800 border border-rose-200">
          <AlertCircle className="h-4 w-4 flex-shrink-0 text-rose-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="mt-4">
        {isLoading ? (
          <div className="py-8 text-center text-sm text-gray-500">Loading student roll...</div>
        ) : isGridError ? (
          <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <p>{getUserFriendlyError(
              new Error(getErrorMessage(gridError)),
              'The attendance register could not be loaded. Please try again.',
            )}</p>
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="mt-2 rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-50"
            >
              {isFetching ? 'Loading...' : 'Try again'}
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500">No active students in this class.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {rows.map((row) => (
              <div
                key={row.student_id}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5 hover:bg-slate-50/60 px-2 rounded-lg transition-colors"
              >
                <span className="text-sm font-medium text-gray-800">{row.full_name}</span>
                <div className="flex flex-wrap gap-1.5">
          {ATTENDANCE_STATUSES.map((s: { value: AttendanceStatus; label: string }) => {
            const isSelected = drafts[row.student_id] === s.value;
            return (
              <button
                key={s.value}
                type="button"
                disabled={saveMutation.isPending}
                onClick={() => {
                  setSaveSuccessMessage(null);
                  setErrorMessage(null);
                  setDrafts((prev) => ({
                    ...prev,
                    [row.student_id]: prev[row.student_id] === s.value ? null : s.value,
                  }));
                }}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
                  isSelected ? STATUS_PILL_STYLES[s.value] : STATUS_PILL_INACTIVE
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {s.label}
              </button>
            );
          })}

                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    return error.message
  }
  return ''
}
