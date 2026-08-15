import { Fragment, useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { fetchClasses, fetchStudentsPage, changeStudentStatus, hardDeleteStudent, PAGE_SIZE } from '../lib/queries'
import { useDebouncedValue } from '../lib/useDebouncedValue'
import { Student, StudentStatus } from '../types'
import { SearchBar } from './SearchBar'
import { EditStudentForm } from './EditStudentForm'
import { ConfirmDialog } from './ConfirmDialog'
import { Pagination } from './Pagination'

const STATUS_LABELS: Record<StudentStatus, string> = {
  active: 'Active',
  withdrawn: 'Withdrawn',
  graduated: 'Graduated',
  transferred: 'Transferred',
}

const STATUS_BADGE_STYLES: Record<StudentStatus, string> = {
  active: 'bg-green-50 text-green-700 border-green-200',
  withdrawn: 'bg-amber-50 text-amber-700 border-amber-200',
  graduated: 'bg-blue-50 text-blue-700 border-blue-200',
  transferred: 'bg-slate-100 text-slate-600 border-slate-200',
}

export function StudentList() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [selectedClassId, setSelectedClassId] = useState<string>('all')
  const [dateJoinedFilter, setDateJoinedFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<StudentStatus | 'all'>('active')
  const [page, setPage] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pendingStatusChange, setPendingStatusChange] = useState<{
    student: Student
    newStatus: StudentStatus
  } | null>(null)
  const [pendingHardDelete, setPendingHardDelete] = useState<Student | null>(null)

  // Shared cache entry — Registration form, Edit form, and this list
  // all read the same ['classes'] query instead of each fetching
  // their own copy.
  const { data: classes = [] } = useQuery({
    queryKey: ['classes'],
    queryFn: fetchClasses,
  })

  // Runs in parallel with the classes query above (two independent
  // useQuery calls, not a waterfall) and only ever pulls the current
  // page's rows — filtering, search, and the total count all happen
  // server-side.
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['students', page, debouncedSearch, selectedClassId, dateJoinedFilter, statusFilter],
    queryFn: () =>
      fetchStudentsPage({
        page,
        search: debouncedSearch,
        classId: selectedClassId,
        dateJoinedFrom: dateJoinedFilter,
        status: statusFilter,
      }),
    placeholderData: (previousData) => previousData, // keep old rows visible while the next page loads
  })

  const students = data?.students ?? []
  const total = data?.total ?? 0

  const statusChangeMutation = useMutation({
    mutationFn: (params: { student: Student; newStatus: StudentStatus }) =>
      changeStudentStatus({
        studentId: params.student.id,
        schoolId: profile!.school_id,
        oldStatus: params.student.status,
        newStatus: params.newStatus,
        changedBy: profile!.id,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] })
      setPendingStatusChange(null)
    },
  })

  const hardDeleteMutation = useMutation({
    mutationFn: (id: string) => hardDeleteStudent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] })
      setPendingHardDelete(null)
      setExpandedId(null)
    },
  })

  function resetToFirstPage() {
    setPage(0)
  }

  return (
    <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Students</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <SearchBar
            value={search}
            onChange={(v) => {
              setSearch(v)
              resetToFirstPage()
            }}
          />
          <select
            value={selectedClassId}
            onChange={(e) => {
              setSelectedClassId(e.target.value)
              resetToFirstPage()
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40"
          >
            <option value="all">All classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as StudentStatus | 'all')
              resetToFirstPage()
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40"
          >
            <option value="active">Active</option>
            <option value="withdrawn">Withdrawn</option>
            <option value="graduated">Graduated</option>
            <option value="transferred">Transferred</option>
            <option value="all">All statuses</option>
          </select>
          <input
            type="date"
            value={dateJoinedFilter}
            onChange={(e) => {
              setDateJoinedFilter(e.target.value)
              resetToFirstPage()
            }}
            title="Show students who joined on or after this date"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40"
          />
          {dateJoinedFilter && (
            <button
              onClick={() => {
                setDateJoinedFilter('')
                resetToFirstPage()
              }}
              className="text-xs font-medium text-slate-500 underline hover:text-rose-600"
            >
              Clear date
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500">Loading students...</p>
      ) : students.length === 0 ? (
        <p className="text-sm text-slate-500">No students found.</p>
      ) : (
        <div className={isFetching ? 'opacity-60 transition-opacity' : ''}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4">Photo</th>
                  <th className="py-2 pr-4">Adm No.</th>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Class</th>
                  <th className="py-2 pr-4">Age</th>
                  <th className="py-2 pr-4">Gender</th>
                  <th className="py-2 pr-4">Parent</th>
                  <th className="py-2 pr-4">Parent Phone</th>
                  <th className="py-2 pr-4">Year</th>
                  <th className="py-2 pr-4">Joined</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <Fragment key={s.id}>
                    <tr className="border-b border-slate-100">
                      <td className="py-2 pr-4">
                        {s.photo_url ? (
                          <img
                            src={s.photo_url}
                            alt={s.full_name}
                            className="h-8 w-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs text-slate-400">
                            {s.full_name.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-4">{s.admission_number}</td>
                      <td className="py-2 pr-4">{s.full_name}</td>
                      <td className="py-2 pr-4">{s.class_name}</td>
                      <td className="py-2 pr-4">{s.age ?? '-'}</td>
                      <td className="py-2 pr-4 capitalize">{s.gender}</td>
                      <td className="py-2 pr-4">{s.parent_name}</td>
                      <td className="py-2 pr-4">{s.parent_phone}</td>
                      <td className="py-2 pr-4">{s.academic_year}</td>
                      <td className="py-2 pr-4">{s.date_joined}</td>
                      <td className="py-2 pr-4">
                        <select
                          value={s.status}
                          onChange={(e) =>
                            setPendingStatusChange({ student: s, newStatus: e.target.value as StudentStatus })
                          }
                          className={`rounded-full border px-2 py-1 text-xs font-medium focus:outline-none ${STATUS_BADGE_STYLES[s.status]}`}
                        >
                          {(Object.keys(STATUS_LABELS) as StudentStatus[]).map((st) => (
                            <option key={st} value={st}>
                              {STATUS_LABELS[st]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setExpandedId(expandedId === s.id ? null : s.id)
                              setEditingId(null)
                            }}
                            className="text-xs font-medium text-slate-500 underline hover:text-rose-600"
                          >
                            {expandedId === s.id ? 'Hide' : 'Details'}
                          </button>
                          <button
                            onClick={() => {
                              setEditingId(editingId === s.id ? null : s.id)
                              setExpandedId(null)
                            }}
                            className="text-xs font-medium text-slate-600 underline hover:text-slate-900"
                          >
                            {editingId === s.id ? 'Cancel' : 'Edit'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {editingId === s.id && (
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <td colSpan={12} className="px-4 py-3">
                          <EditStudentForm
                            student={s}
                            classes={classes}
                            onCancel={() => setEditingId(null)}
                            onSaved={() => {
                              setEditingId(null)
                              queryClient.invalidateQueries({ queryKey: ['students'] })
                            }}
                          />
                        </td>
                      </tr>
                    )}
                    {expandedId === s.id && (
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <td colSpan={12} className="px-4 py-3">
                          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-xs text-slate-700 sm:grid-cols-3">
                            <div>
                              <dt className="font-medium text-slate-500">Government Code</dt>
                              <dd>{s.government_code || '—'}</dd>
                            </div>
                            <div>
                              <dt className="font-medium text-slate-500">Former School</dt>
                              <dd>{s.former_school || '—'}</dd>
                            </div>
                            <div>
                              <dt className="font-medium text-slate-500">Parent Occupation</dt>
                              <dd>{s.parent_occupation || '—'}</dd>
                            </div>
                            <div>
                              <dt className="font-medium text-slate-500">Authorized Pickup</dt>
                              <dd>{s.pickup_person || '—'}</dd>
                            </div>
                            <div>
                              <dt className="font-medium text-slate-500">Location</dt>
                              <dd>{s.location || '—'}</dd>
                            </div>
                            <div className="sm:col-span-2">
                              <dt className="font-medium text-slate-500">Address</dt>
                              <dd>{s.address || '—'}</dd>
                            </div>
                            <div className="sm:col-span-3">
                              <dt className="font-medium text-slate-500">
                                Sickness / Disease / Allergies
                              </dt>
                              <dd>{s.health_notes || '—'}</dd>
                            </div>
                            <div>
                              <dt className="font-medium text-slate-500">Status Since</dt>
                              <dd>{new Date(s.status_changed_at).toLocaleDateString()}</dd>
                            </div>
                          </dl>

                          <div className="mt-4 border-t border-slate-200 pt-3">
                            <p className="text-xs text-slate-400">
                              Only use this for a genuine duplicate entry — it permanently erases this
                              student's grades, progress reports, and notification history. For a
                              student who has left, use the Status dropdown above instead.
                            </p>
                            <button
                              onClick={() => setPendingHardDelete(s)}
                              className="mt-2 text-xs font-medium text-red-700 underline hover:text-red-900"
                            >
                              Permanently Delete (duplicate entry)
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </div>
      )}

      {pendingStatusChange && (
        <ConfirmDialog
          title="Change Student Status"
          message={`Change ${pendingStatusChange.student.full_name}'s status to "${STATUS_LABELS[pendingStatusChange.newStatus]}"?`}
          confirmLabel={statusChangeMutation.isPending ? 'Saving...' : 'Confirm'}
          danger={pendingStatusChange.newStatus !== 'active'}
          onCancel={() => setPendingStatusChange(null)}
          onConfirm={() => statusChangeMutation.mutate(pendingStatusChange)}
        />
      )}

      {pendingHardDelete && (
        <ConfirmDialog
          title="Permanently Delete Student"
          message={`This permanently deletes ${pendingHardDelete.full_name}'s entire record — including all grades, progress reports, and notification history. This cannot be undone. Only proceed if this is a duplicate entry.`}
          confirmLabel={hardDeleteMutation.isPending ? 'Deleting...' : 'Permanently Delete'}
          onCancel={() => setPendingHardDelete(null)}
          onConfirm={() => hardDeleteMutation.mutate(pendingHardDelete.id)}
        />
      )}
    </div>
  )
}
