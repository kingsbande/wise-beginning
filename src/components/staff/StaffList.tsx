import { FormEvent, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../context/AuthContext'
import { fetchClasses } from '../../lib/queries'
import { fetchSubjects } from '../../lib/gradesApi'
import {
  addTeacherAssignment,
  addTeacherCertification,
  deleteTeacherCertification,
  fetchStaffList,
  fetchTeacherAssignments,
  fetchTeacherCertifications,
  fetchTeacherDetails,
  removeTeacherAssignment,
  upsertTeacherDetails,
} from '../../lib/staff/staffApi'
import { TeacherDetails } from '../../types'
import { SearchBar } from '../SearchBar'
import { CreateStaffAccountModal } from './CreateStaffAccountModal'

const EMPTY_DETAILS: TeacherDetails = {
  id: '',
  date_of_birth: null,
  national_id: null,
  home_address: null,
  personal_phone: null,
  personal_email: null,
  emergency_contact_name: null,
  emergency_contact_phone: null,
  highest_degree: null,
  major: null,
  resume_summary: null,
  employee_id: null,
  date_of_hire: null,
  contract_type: null,
  salary_grade: null,
}

function TeacherDetailPanel({ teacherId }: { teacherId: string }) {
  const { profile } = useAuth()
  const queryClient = useQueryClient()

  const { data: existingDetails } = useQuery({
    queryKey: ['teacher-details', teacherId],
    queryFn: () => fetchTeacherDetails(teacherId),
  })

  const [form, setForm] = useState<TeacherDetails>(EMPTY_DETAILS)

  useEffect(() => {
    if (existingDetails !== undefined) {
      setForm(existingDetails ?? { ...EMPTY_DETAILS, id: teacherId })
    }
  }, [existingDetails, teacherId])

  const { data: classes = [] } = useQuery({ queryKey: ['classes'], queryFn: fetchClasses })
  const { data: subjects = [] } = useQuery({ queryKey: ['subjects'], queryFn: fetchSubjects })
  const { data: assignments = [] } = useQuery({
    queryKey: ['teacher-assignments', teacherId],
    queryFn: () => fetchTeacherAssignments(teacherId),
  })
  const { data: certifications = [] } = useQuery({
    queryKey: ['teacher-certifications', teacherId],
    queryFn: () => fetchTeacherCertifications(teacherId),
  })

  const [assignClassId, setAssignClassId] = useState('')
  const [assignSubjectId, setAssignSubjectId] = useState('')
  const [certTitle, setCertTitle] = useState('')
  const [certBody, setCertBody] = useState('')
  const [certIssued, setCertIssued] = useState('')
  const [certExpiry, setCertExpiry] = useState('')
  const [savedMessage, setSavedMessage] = useState(false)

  const saveDetailsMutation = useMutation({
    mutationFn: () => upsertTeacherDetails(profile!.school_id, { ...form, id: teacherId }),
    onSuccess: () => {
      setSavedMessage(true)
      queryClient.invalidateQueries({ queryKey: ['teacher-details', teacherId] })
    },
  })

  const addAssignmentMutation = useMutation({
    mutationFn: () =>
      addTeacherAssignment({
        schoolId: profile!.school_id,
        teacherId,
        classId: assignClassId,
        subjectId: assignSubjectId,
      }),
    onSuccess: () => {
      setAssignClassId('')
      setAssignSubjectId('')
      queryClient.invalidateQueries({ queryKey: ['teacher-assignments', teacherId] })
    },
  })

  const removeAssignmentMutation = useMutation({
    mutationFn: removeTeacherAssignment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['teacher-assignments', teacherId] }),
  })

  const addCertMutation = useMutation({
    mutationFn: () =>
      addTeacherCertification({
        schoolId: profile!.school_id,
        teacherId,
        title: certTitle,
        issuingBody: certBody,
        issuedDate: certIssued,
        expiryDate: certExpiry,
      }),
    onSuccess: () => {
      setCertTitle('')
      setCertBody('')
      setCertIssued('')
      setCertExpiry('')
      queryClient.invalidateQueries({ queryKey: ['teacher-certifications', teacherId] })
    },
  })

  const removeCertMutation = useMutation({
    mutationFn: deleteTeacherCertification,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['teacher-certifications', teacherId] }),
  })

  function updateField<K extends keyof TeacherDetails>(key: K, value: TeacherDetails[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setSavedMessage(false)
  }

  function handleSaveDetails(e: FormEvent) {
    e.preventDefault()
    saveDetailsMutation.mutate()
  }

  function handleAddAssignment(e: FormEvent) {
    e.preventDefault()
    if (!assignClassId || !assignSubjectId) return
    addAssignmentMutation.mutate()
  }

  function handleAddCert(e: FormEvent) {
    e.preventDefault()
    if (certTitle.trim() === '') return
    addCertMutation.mutate()
  }

  return (
    <div className="space-y-6 rounded-lg bg-gray-50 p-4">
      {/* Personal + professional details */}
      <form onSubmit={handleSaveDetails} className="space-y-3">
        <h4 className="text-sm font-semibold text-gray-900">Personal & Professional Details</h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-gray-700">Date of Birth</label>
            <input
              type="date"
              value={form.date_of_birth ?? ''}
              onChange={(e) => updateField('date_of_birth', e.target.value || null)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">National ID</label>
            <input
              value={form.national_id ?? ''}
              onChange={(e) => updateField('national_id', e.target.value || null)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">Personal Phone</label>
            <input
              value={form.personal_phone ?? ''}
              onChange={(e) => updateField('personal_phone', e.target.value || null)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">Personal Email</label>
            <input
              type="email"
              value={form.personal_email ?? ''}
              onChange={(e) => updateField('personal_email', e.target.value || null)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-700">Home Address</label>
            <input
              value={form.home_address ?? ''}
              onChange={(e) => updateField('home_address', e.target.value || null)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">Emergency Contact Name</label>
            <input
              value={form.emergency_contact_name ?? ''}
              onChange={(e) => updateField('emergency_contact_name', e.target.value || null)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">Emergency Contact Phone</label>
            <input
              value={form.emergency_contact_phone ?? ''}
              onChange={(e) => updateField('emergency_contact_phone', e.target.value || null)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">Highest Degree</label>
            <input
              value={form.highest_degree ?? ''}
              onChange={(e) => updateField('highest_degree', e.target.value || null)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">Major</label>
            <input
              value={form.major ?? ''}
              onChange={(e) => updateField('major', e.target.value || null)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">Employee ID</label>
            <input
              value={form.employee_id ?? ''}
              onChange={(e) => updateField('employee_id', e.target.value || null)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">Date of Hire</label>
            <input
              type="date"
              value={form.date_of_hire ?? ''}
              onChange={(e) => updateField('date_of_hire', e.target.value || null)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">Contract Type</label>
            <select
              value={form.contract_type ?? ''}
              onChange={(e) =>
                updateField(
                  'contract_type',
                  (e.target.value || null) as TeacherDetails['contract_type'],
                )
              }
              className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
            >
              <option value="">Not set</option>
              <option value="full_time">Full-time</option>
              <option value="part_time">Part-time</option>
              <option value="substitute">Substitute</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">Salary Grade</label>
            <input
              value={form.salary_grade ?? ''}
              onChange={(e) => updateField('salary_grade', e.target.value || null)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700">Resume / Work History Summary</label>
          <textarea
            rows={2}
            value={form.resume_summary ?? ''}
            onChange={(e) => updateField('resume_summary', e.target.value || null)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saveDetailsMutation.isPending}
            className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {saveDetailsMutation.isPending ? 'Saving...' : 'Save Details'}
          </button>
          {savedMessage && <span className="text-xs text-green-600">Saved.</span>}
        </div>
      </form>

      {/* Certifications */}
      <div className="border-t border-gray-200 pt-4">
        <h4 className="text-sm font-semibold text-gray-900">Certifications & Training</h4>
        <form onSubmit={handleAddCert} className="mt-2 flex flex-wrap gap-2">
          <input
            value={certTitle}
            onChange={(e) => setCertTitle(e.target.value)}
            placeholder="Title"
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:border-gray-900 focus:outline-none"
          />
          <input
            value={certBody}
            onChange={(e) => setCertBody(e.target.value)}
            placeholder="Issuing body"
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:border-gray-900 focus:outline-none"
          />
          <input
            type="date"
            value={certIssued}
            onChange={(e) => setCertIssued(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:border-gray-900 focus:outline-none"
          />
          <input
            type="date"
            value={certExpiry}
            onChange={(e) => setCertExpiry(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:border-gray-900 focus:outline-none"
          />
          <button
            type="submit"
            disabled={addCertMutation.isPending}
            className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            Add
          </button>
        </form>
        <ul className="mt-2 divide-y divide-gray-200">
          {certifications.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-1.5 text-xs text-gray-700">
              <span>
                {c.title}
                {c.issuing_body ? ` — ${c.issuing_body}` : ''}
                {c.issued_date ? ` (${c.issued_date})` : ''}
              </span>
              <button
                onClick={() => removeCertMutation.mutate(c.id)}
                className="text-red-600 underline hover:text-red-800"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Assignments */}
      <div className="border-t border-gray-200 pt-4">
        <h4 className="text-sm font-semibold text-gray-900">Class & Subject Assignments</h4>
        <p className="mt-1 text-xs text-gray-500">
          What this teacher can enter grades for — scoped exactly to these class+subject pairs.
        </p>
        <form onSubmit={handleAddAssignment} className="mt-2 flex flex-wrap gap-2">
          <select
            value={assignClassId}
            onChange={(e) => setAssignClassId(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:border-gray-900 focus:outline-none"
          >
            <option value="">Select class</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={assignSubjectId}
            onChange={(e) => setAssignSubjectId(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:border-gray-900 focus:outline-none"
          >
            <option value="">Select subject</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={addAssignmentMutation.isPending}
            className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            Assign
          </button>
        </form>
        <ul className="mt-2 divide-y divide-gray-200">
          {assignments.map((a) => (
            <li key={a.id} className="flex items-center justify-between py-1.5 text-xs text-gray-700">
              <span>
                {a.subject_name} — {a.class_name}
              </span>
              <button
                onClick={() => removeAssignmentMutation.mutate(a.id)}
                className="text-red-600 underline hover:text-red-800"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export function StaffList() {
  const [search, setSearch] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: staff = [], isLoading } = useQuery({ queryKey: ['staff-list'], queryFn: fetchStaffList })

  const filtered = staff.filter((s) => {
    const q = search.trim().toLowerCase()
    if (q === '') return true
    return s.full_name.toLowerCase().includes(q) || s.role.toLowerCase().includes(q)
  })

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Teachers & Staff</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <SearchBar value={search} onChange={setSearch} placeholder="Search by name or role..." />
          <button
            onClick={() => setShowCreateModal(true)}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Create Staff Account
          </button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading staff...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-500">No staff accounts yet.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((s) => (
            <div key={s.id} className="rounded-lg border border-gray-100">
              <button
                onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <div className="flex items-center gap-3">
                  {s.avatar_url ? (
                    <img src={s.avatar_url} alt={s.full_name} className="h-8 w-8 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs text-gray-400">
                      {s.full_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-gray-900">{s.full_name}</p>
                    <p className="text-xs capitalize text-gray-500">{s.role}</p>
                  </div>
                </div>
                <span className="text-xs font-medium text-gray-500 underline">
                  {expandedId === s.id ? 'Hide' : 'View Details'}
                </span>
              </button>

              {expandedId === s.id && (
                <div className="border-t border-gray-100 p-4">
                  <TeacherDetailPanel teacherId={s.id} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateStaffAccountModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ['staff-list'] })}
        />
      )}
    </div>
  )
}
