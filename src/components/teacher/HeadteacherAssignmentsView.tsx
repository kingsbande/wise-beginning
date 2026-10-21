import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Save, Trash2, X } from 'lucide-react'
import { ConfirmDialog } from '../ConfirmDialog'
import { useAuth } from '../../context/AuthContext'
import { fetchClasses } from '../../lib/queries'
import { fetchSubjects } from '../../lib/gradesApi'
import {
  addTeacherAssignments,
  fetchSchoolTeachingStaff,
  fetchSchoolTeacherAssignments,
  removeTeacherAssignment,
  updateTeacherAssignment,
  type SchoolTeacherAssignment,
} from '../../lib/staff/staffApi'

interface AssignmentForm {
  teacherId: string
  classId: string
  subjectIds: string[]
}

interface AssignmentEditForm {
  teacherId: string
  classId: string
  subjectId: string
}

const EMPTY_FORM: AssignmentForm = { teacherId: '', classId: '', subjectIds: [] }
const EMPTY_EDIT_FORM: AssignmentEditForm = { teacherId: '', classId: '', subjectId: '' }
const ASSIGNMENTS_QUERY_KEY = 'school-teacher-assignments'

export function HeadteacherAssignmentsView() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const schoolId = profile?.school_id
  const [form, setForm] = useState<AssignmentForm>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<AssignmentEditForm>(EMPTY_EDIT_FORM)
  const [assignmentTeacherFilter, setAssignmentTeacherFilter] = useState('')
  const [assignmentToRemove, setAssignmentToRemove] = useState<SchoolTeacherAssignment | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const staffQuery = useQuery({
    queryKey: ['assignable-school-staff', schoolId],
    queryFn: () => fetchSchoolTeachingStaff(schoolId!),
    enabled: !!schoolId && profile?.role === 'headteacher',
  })
  const classesQuery = useQuery({
    queryKey: ['classes'],
    queryFn: fetchClasses,
    enabled: !!schoolId && profile?.role === 'headteacher',
  })
  const subjectsQuery = useQuery({
    queryKey: ['subjects'],
    queryFn: fetchSubjects,
    enabled: !!schoolId && profile?.role === 'headteacher',
  })
  const assignmentsQuery = useQuery({
    queryKey: [ASSIGNMENTS_QUERY_KEY, schoolId],
    queryFn: () => fetchSchoolTeacherAssignments(schoolId!),
    enabled: !!schoolId && profile?.role === 'headteacher',
  })

  const staff = staffQuery.data ?? []
  const classes = classesQuery.data ?? []
  const subjects = subjectsQuery.data ?? []
  const assignments = assignmentsQuery.data ?? []
  const isLoading = staffQuery.isLoading || classesQuery.isLoading || subjectsQuery.isLoading || assignmentsQuery.isLoading
  const loadError = staffQuery.error ?? classesQuery.error ?? subjectsQuery.error ?? assignmentsQuery.error

  const activeTeachers = useMemo(() => staff.filter((member) => member.is_active), [staff])
  const filteredAssignments = useMemo(
    () =>
      assignmentTeacherFilter === 'all'
        ? assignments
        : assignments.filter((assignment) => assignment.teacher_id === assignmentTeacherFilter),
    [assignmentTeacherFilter, assignments],
  )

  const addMutation = useMutation({
    mutationFn: () => {
      if (!schoolId || !form.teacherId || !form.classId || form.subjectIds.length === 0) {
        throw new Error('Select a staff member, class, and at least one subject.')
      }
      return addTeacherAssignments({
        schoolId,
        teacherId: form.teacherId,
        classId: form.classId,
        subjectIds: form.subjectIds,
      })
    },
    onSuccess: async (createdCount) => {
      setSaveMessage(
        createdCount > 0
          ? `${createdCount} subject assignment${createdCount === 1 ? '' : 's'} added. Existing assignments were skipped.`
          : 'No new assignments were needed; those subjects are already assigned.',
      )
      setForm(EMPTY_FORM)
      await queryClient.invalidateQueries({ queryKey: [ASSIGNMENTS_QUERY_KEY, schoolId] })
      await queryClient.invalidateQueries({ queryKey: ['teacher-assignments'] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!schoolId || !editingId || !editForm.teacherId || !editForm.classId || !editForm.subjectId) {
        throw new Error('Select a staff member, class, and subject.')
      }
      return updateTeacherAssignment({
        id: editingId,
        schoolId,
        teacherId: editForm.teacherId,
        classId: editForm.classId,
        subjectId: editForm.subjectId,
      })
    },
    onSuccess: async () => {
      setEditingId(null)
      setEditForm(EMPTY_EDIT_FORM)
      await queryClient.invalidateQueries({ queryKey: [ASSIGNMENTS_QUERY_KEY, schoolId] })
      await queryClient.invalidateQueries({ queryKey: ['teacher-assignments'] })
    },
  })

  const removeMutation = useMutation({
    mutationFn: removeTeacherAssignment,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [ASSIGNMENTS_QUERY_KEY, schoolId] })
      await queryClient.invalidateQueries({ queryKey: ['teacher-assignments'] })
    },
  })

  const mutationError = addMutation.error ?? updateMutation.error ?? removeMutation.error
  const optionClassName = 'min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-400/20'
  const alreadyAssignedSubjectIds = new Set(
    assignments
      .filter((assignment) => assignment.teacher_id === form.teacherId && assignment.class_id === form.classId)
      .map((assignment) => assignment.subject_id),
  )

  function toggleSubject(subjectId: string) {
    setSaveMessage(null)
    addMutation.reset()
    setForm((current) => ({
      ...current,
      subjectIds: current.subjectIds.includes(subjectId)
        ? current.subjectIds.filter((id) => id !== subjectId)
        : [...current.subjectIds, subjectId],
    }))
  }

  function beginEdit(assignment: (typeof assignments)[number]) {
    setEditingId(assignment.id)
    setEditForm({
      teacherId: assignment.teacher_id,
      classId: assignment.class_id,
      subjectId: assignment.subject_id,
    })
    updateMutation.reset()
    removeMutation.reset()
  }

  if (profile?.role !== 'headteacher') return null

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="border-b border-slate-100 pb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-600">Staff coordination</p>
          <h2 className="mt-1 text-xl font-bold text-slate-900">Teacher class & subject assignments</h2>
          <p className="mt-1 text-sm text-slate-500">
            Choose one staff member and class, then select all subjects to assign at once. Existing assignments can still be changed or removed below.
          </p>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            addMutation.mutate()
          }}
          className="mt-4 space-y-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-600">
              Staff member
              <select
                required
                value={form.teacherId}
                onChange={(event) => {
                  setSaveMessage(null)
                  addMutation.reset()
                  setForm((current) => ({ ...current, teacherId: event.target.value, subjectIds: [] }))
                }}
                className={`${optionClassName} mt-1 block w-full`}
                disabled={isLoading || activeTeachers.length === 0}
              >
                <option value="">Select teacher</option>
                {activeTeachers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.full_name}{member.role === 'headteacher' ? ' (Headteacher)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-600">
              Class
              <select
                required
                value={form.classId}
                onChange={(event) => {
                  setSaveMessage(null)
                  addMutation.reset()
                  setForm((current) => ({ ...current, classId: event.target.value, subjectIds: [] }))
                }}
                className={`${optionClassName} mt-1 block w-full`}
                disabled={isLoading || classes.length === 0}
              >
                <option value="">Select class</option>
                {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          </div>

          <fieldset disabled={!form.teacherId || !form.classId || isLoading || addMutation.isPending}>
            <legend className="text-xs font-semibold text-slate-700">
              Subjects <span className="font-normal text-slate-500">({form.subjectIds.length} selected)</span>
            </legend>
            <div className="mt-2 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-3">
              {subjects.length === 0 ? (
                <p className="text-sm text-slate-500">No subjects are configured for this school.</p>
              ) : (
                subjects.map((subject) => {
                  const isAlreadyAssigned = alreadyAssignedSubjectIds.has(subject.id)
                  const isSelected = form.subjectIds.includes(subject.id)
                  return (
                    <label
                      key={subject.id}
                      className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                        isAlreadyAssigned
                          ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                          : isSelected
                            ? 'border-rose-300 bg-rose-50 text-rose-800'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={isAlreadyAssigned}
                        onChange={() => toggleSubject(subject.id)}
                        className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                      />
                      <span className="min-w-0 flex-1">{subject.name}</span>
                      {isAlreadyAssigned && <span className="text-[11px]">Assigned</span>}
                    </label>
                  )
                })
              )}
            </div>
            {!form.teacherId || !form.classId ? (
              <p className="mt-1.5 text-xs text-slate-500">Select a staff member and class to choose subjects.</p>
            ) : null}
          </fieldset>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">
              Subjects already assigned to this staff member in this class are disabled.
            </p>
            <button
              type="submit"
              disabled={isLoading || addMutation.isPending || !form.teacherId || !form.classId || !form.subjectIds.length}
              className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto"
            >
              <Plus className="h-4 w-4" />
              {addMutation.isPending ? 'Assigning…' : `Assign ${form.subjectIds.length || ''} subject${form.subjectIds.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </form>

        {!isLoading && activeTeachers.length === 0 && (
          <p className="mt-3 text-sm text-slate-500">There are no active teachers available to assign.</p>
        )}
        {loadError instanceof Error && (
          <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Could not load assignment data: {loadError.message}
          </p>
        )}
        {mutationError instanceof Error && (
          <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Could not save the subject assignments: {mutationError.message}
          </p>
        )}
        {saveMessage && (
          <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {saveMessage}
          </p>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h3 className="font-semibold text-slate-900">Current assignments</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {assignmentTeacherFilter
                ? `${filteredAssignments.length} assignment${filteredAssignments.length === 1 ? '' : 's'}`
                : 'Choose a teacher to view their assignments'}
            </p>
          </div>
          <label className="text-xs font-medium text-slate-600">
            Filter by teacher
            <select
              aria-label="Filter current assignments by teacher"
              value={assignmentTeacherFilter}
              onChange={(event) => setAssignmentTeacherFilter(event.target.value)}
              className={`${optionClassName} mt-1 block w-full sm:min-w-64`}
              disabled={isLoading || staff.length === 0}
            >
              <option value="">Select teacher</option>
              <option value="all">All teachers</option>
              {staff.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.full_name}{member.role === 'headteacher' ? ' (Headteacher)' : ''}{member.is_active ? '' : ' (Inactive)'}
                </option>
              ))}
            </select>
          </label>
        </div>

        {isLoading ? (
          <p className="p-6 text-sm text-slate-500">Loading teacher assignments…</p>
        ) : assignmentsQuery.isError ? (
          <p className="p-6 text-sm text-rose-700">Assignments could not be loaded.</p>
        ) : assignments.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No teacher assignments have been set up yet.</p>
        ) : !assignmentTeacherFilter ? (
          <p className="p-6 text-sm text-slate-500">Select a teacher above to view their assignments, or choose all teachers.</p>
        ) : filteredAssignments.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No assignments found for this teacher.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filteredAssignments.map((assignment) => {
              const isEditing = editingId === assignment.id
              return (
                <li key={assignment.id} className="p-4 sm:px-6">
                  {isEditing ? (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault()
                        updateMutation.mutate()
                      }}
                      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.2fr_1fr_1fr_auto_auto]"
                    >
                      <select
                        aria-label="Assigned staff member"
                        value={editForm.teacherId}
                        onChange={(event) => setEditForm((current) => ({ ...current, teacherId: event.target.value }))}
                        className={optionClassName}
                        required
                      >
                        {staff.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.full_name}{member.role === 'headteacher' ? ' (Headteacher)' : ''}{member.is_active ? '' : ' (Inactive)'}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label="Assigned class"
                        value={editForm.classId}
                        onChange={(event) => setEditForm((current) => ({ ...current, classId: event.target.value }))}
                        className={optionClassName}
                        required
                      >
                        {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                      <select
                        aria-label="Assigned subject"
                        value={editForm.subjectId}
                        onChange={(event) => setEditForm((current) => ({ ...current, subjectId: event.target.value }))}
                        className={optionClassName}
                        required
                      >
                        {subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                      <button
                        type="submit"
                        disabled={updateMutation.isPending}
                        className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
                      >
                        <Save className="h-4 w-4" />
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEditingId(null); setEditForm(EMPTY_EDIT_FORM); updateMutation.reset() }}
                        className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <X className="h-4 w-4" />
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">{assignment.teacher_name}</p>
                        <p className="mt-0.5 text-sm text-slate-600">
                          {assignment.class_name} <span className="text-slate-400">·</span> {assignment.subject_name}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => beginEdit(assignment)}
                          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <Pencil className="h-4 w-4" />
                          Change
                        </button>
                        <button
                          type="button"
                          onClick={() => setAssignmentToRemove(assignment)}
                          disabled={removeMutation.isPending}
                          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {assignmentToRemove && (
        <ConfirmDialog
          title="Remove teacher assignment?"
          message={`Remove ${assignmentToRemove.subject_name} from ${assignmentToRemove.teacher_name} in ${assignmentToRemove.class_name}?`}
          confirmLabel="Remove assignment"
          onConfirm={() => {
            removeMutation.mutate(assignmentToRemove.id)
            setAssignmentToRemove(null)
          }}
          onCancel={() => setAssignmentToRemove(null)}
        />
      )}
    </div>
  )
}
