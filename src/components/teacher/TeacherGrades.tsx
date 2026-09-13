import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../context/AuthContext'
import { fetchTeacherAssignments } from '../../lib/staff/staffApi'
import { fetchClasses } from '../../lib/queries'
import { fetchGradeGrid, fetchGradeScale, fetchTerms, saveGrades, scoreToLetter } from '../../lib/gradesApi'
import { AssessmentType } from '../../types'

type Mode = 'enter' | 'view'

export function TeacherGrades() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<Mode>('enter')

  const { data: assignments = [] } = useQuery({
    queryKey: ['teacher-assignments', profile?.id],
    queryFn: () => fetchTeacherAssignments(profile!.id),
    enabled: !!profile?.id,
  })
  const { data: terms = [] } = useQuery({ queryKey: ['terms'], queryFn: fetchTerms })
  const { data: gradeScale = [] } = useQuery({ queryKey: ['grade-scale'], queryFn: fetchGradeScale })

  // ================= Enter Grades =================
  // The dropdown is built directly from this teacher's own
  // assignments — there is no way to select a class/subject
  // combination they aren't actually assigned to write for.
  const [enterAssignmentId, setEnterAssignmentId] = useState('')
  const [enterTermId, setEnterTermId] = useState('')
  const [enterAssessmentType, setEnterAssessmentType] = useState<AssessmentType>('midterm')

  const selectedAssignment = assignments.find((a) => a.id === enterAssignmentId)

  const enterGridQuery = useQuery({
    queryKey: [
      'teacher-grade-grid',
      selectedAssignment?.class_id,
      enterTermId,
      selectedAssignment?.subject_id,
      enterAssessmentType,
    ],
    queryFn: () =>
      fetchGradeGrid({
        classId: selectedAssignment!.class_id,
        termId: enterTermId,
        subjectId: selectedAssignment!.subject_id,
        assessmentType: enterAssessmentType,
      }),
    enabled: !!selectedAssignment && enterTermId !== '',
  })

  const [scoreDrafts, setScoreDrafts] = useState<Record<string, string>>({})

  useEffect(() => {
    if (enterGridQuery.data) {
      const drafts: Record<string, string> = {}
      for (const row of enterGridQuery.data) {
        drafts[row.student_id] = row.score === null ? '' : String(row.score)
      }
      setScoreDrafts(drafts)
    }
  }, [enterGridQuery.data])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const rows = Object.entries(scoreDrafts)
        .filter(([, value]) => value.trim() !== '')
        .map(([student_id, value]) => ({ student_id, score: Number(value) }))

      await saveGrades({
        schoolId: profile!.school_id,
        termId: enterTermId,
        subjectId: selectedAssignment!.subject_id,
        assessmentType: enterAssessmentType,
        enteredBy: profile!.id,
        rows,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [
          'teacher-grade-grid',
          selectedAssignment?.class_id,
          enterTermId,
          selectedAssignment?.subject_id,
          enterAssessmentType,
        ],
      })
    },
  })

  const scoreOutOfRange = Object.values(scoreDrafts).some((v) => {
    if (v.trim() === '') return false
    const n = Number(v)
    return Number.isNaN(n) || n < 0 || n > 100
  })

  // ================= View Grades =================
  // Subject is restricted to ones this teacher actually teaches
  // (derived from their assignments); class is NOT restricted —
  // fetchClasses() returns every class in the school, since a
  // teacher may view (not edit) any class's grades for a subject
  // they teach elsewhere.
  const distinctSubjects = useMemo(() => {
    const seen = new Map<string, string>()
    for (const a of assignments) seen.set(a.subject_id, a.subject_name)
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }))
  }, [assignments])

  const [viewSubjectId, setViewSubjectId] = useState('')
  const [viewClassId, setViewClassId] = useState('')
  const [viewTermId, setViewTermId] = useState('')
  const [viewAssessmentType, setViewAssessmentType] = useState<AssessmentType>('midterm')

  const { data: allClasses = [] } = useQuery({
    queryKey: ['classes'],
    queryFn: fetchClasses,
    enabled: mode === 'view',
  })

  const isEditableCombo = assignments.some(
    (a) => a.subject_id === viewSubjectId && a.class_id === viewClassId,
  )

  const viewGridQuery = useQuery({
    queryKey: ['teacher-view-grade-grid', viewClassId, viewTermId, viewSubjectId, viewAssessmentType],
    queryFn: () =>
      fetchGradeGrid({
        classId: viewClassId,
        termId: viewTermId,
        subjectId: viewSubjectId,
        assessmentType: viewAssessmentType,
      }),
    enabled: viewClassId !== '' && viewTermId !== '' && viewSubjectId !== '',
  })

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => setMode('enter')}
          className={
            mode === 'enter'
              ? 'rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white'
              : 'rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100'
          }
        >
          Enter Grades
        </button>
        <button
          onClick={() => setMode('view')}
          className={
            mode === 'view'
              ? 'rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white'
              : 'rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100'
          }
        >
          View Grades
        </button>
      </div>

      {mode === 'enter' &&
        (assignments.length === 0 ? (
          <p className="text-sm text-gray-500">
            No class/subject assignments yet — ask your admin to assign you.
          </p>
        ) : (
          <div>
            <div className="grid gap-2 sm:flex sm:flex-wrap">
              <select
                value={enterAssignmentId}
                onChange={(e) => setEnterAssignmentId(e.target.value)}
                className="w-full min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none sm:w-auto"
              >
                <option value="">Select class — subject</option>
                {assignments.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.class_name} — {a.subject_name}
                  </option>
                ))}
              </select>

              <select
                value={enterTermId}
                onChange={(e) => setEnterTermId(e.target.value)}
                className="w-full min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none sm:w-auto"
              >
                <option value="">Select term</option>
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} — {t.academic_year}
                  </option>
                ))}
              </select>

              <select
                value={enterAssessmentType}
                onChange={(e) => setEnterAssessmentType(e.target.value as AssessmentType)}
                className="w-full min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none sm:w-auto"
              >
                <option value="midterm">Midterm</option>
                <option value="end_of_term">End of Term</option>
              </select>
            </div>

            <div className="mt-5">
              {!selectedAssignment || enterTermId === '' ? (
                <p className="text-sm text-gray-500">
                  Choose a class/subject, term, and assessment type to load the grade sheet.
                </p>
              ) : enterGridQuery.isLoading ? (
                <p className="text-sm text-gray-500">Loading students...</p>
              ) : enterGridQuery.data?.length === 0 ? (
                <p className="text-sm text-gray-500">No students in this class yet.</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[22rem] text-left text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-gray-500">
                          <th className="py-2 pr-4">Student</th>
                          <th className="py-2 pr-4">Score (0–100)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {enterGridQuery.data?.map((row) => (
                          <tr key={row.student_id} className="border-b border-gray-100">
                            <td className="py-2 pr-4">{row.full_name}</td>
                            <td className="py-2 pr-4">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={scoreDrafts[row.student_id] ?? ''}
                                onChange={(e) =>
                                  setScoreDrafts((prev) => ({ ...prev, [row.student_id]: e.target.value }))
                                }
                                className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-sm focus:border-gray-900 focus:outline-none"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {scoreOutOfRange && (
                    <p className="mt-2 text-sm text-red-600">Scores must be between 0 and 100.</p>
                  )}

                  <button
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending || scoreOutOfRange}
                    className="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                  >
                    {saveMutation.isPending ? 'Saving...' : 'Save Grades'}
                  </button>
                  {saveMutation.isSuccess && <span className="ml-3 text-sm text-green-600">Saved.</span>}
                </>
              )}
            </div>
          </div>
        ))}

      {mode === 'view' && (
        <div>
          <div className="flex flex-wrap gap-2">
            <select
              value={viewSubjectId}
              onChange={(e) => {
                setViewSubjectId(e.target.value)
                setViewClassId('')
              }}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
            >
              <option value="">Select subject</option>
              {distinctSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <select
              value={viewClassId}
              onChange={(e) => setViewClassId(e.target.value)}
              disabled={viewSubjectId === ''}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none disabled:opacity-50"
            >
              <option value="">Select class</option>
              {allClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <select
              value={viewTermId}
              onChange={(e) => setViewTermId(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
            >
              <option value="">Select term</option>
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {t.academic_year}
                </option>
              ))}
            </select>

            <select
              value={viewAssessmentType}
              onChange={(e) => setViewAssessmentType(e.target.value as AssessmentType)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
            >
              <option value="midterm">Midterm</option>
              <option value="end_of_term">End of Term</option>
            </select>
          </div>

          {viewClassId !== '' && viewSubjectId !== '' && viewTermId !== '' && (
            <p className="mt-3">
              {isEditableCombo ? (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                  This is one of your classes — editable from Enter Grades
                </span>
              ) : (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  View only — not your assigned class
                </span>
              )}
            </p>
          )}

          <div className="mt-4">
            {viewClassId === '' || viewSubjectId === '' || viewTermId === '' ? (
              <p className="text-sm text-gray-500">
                Choose a subject, class, term, and assessment type to view grades.
              </p>
            ) : viewGridQuery.isLoading ? (
              <p className="text-sm text-gray-500">Loading...</p>
            ) : viewGridQuery.data?.length === 0 ? (
              <p className="text-sm text-gray-500">No students in this class yet.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500">
                    <th className="py-2 pr-4">Student</th>
                    <th className="py-2 pr-4">Score</th>
                    <th className="py-2 pr-4">Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {viewGridQuery.data?.map((row) => (
                    <tr key={row.student_id} className="border-b border-gray-100">
                      <td className="py-2 pr-4">{row.full_name}</td>
                      <td className="py-2 pr-4">{row.score ?? '-'}</td>
                      <td className="py-2 pr-4">{scoreToLetter(gradeScale, row.score) ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
