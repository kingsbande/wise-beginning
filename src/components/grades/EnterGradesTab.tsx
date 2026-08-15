import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchClasses } from '../../lib/queries'
import { useAuth } from '../../context/AuthContext'
import {
  fetchGradeGrid,
  fetchProgressGrid,
  fetchProgressReportFields,
  fetchSubjectsForClass,
  fetchTerms,
  saveGrades,
  saveProgressEntries,
} from '../../lib/gradesApi'
import { AssessmentType } from '../../types'

type Mode = 'grades' | 'progress'

export function EnterGradesTab() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()

  const [mode, setMode] = useState<Mode>('grades')
  const [classId, setClassId] = useState('')
  const [termId, setTermId] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [assessmentType, setAssessmentType] = useState<AssessmentType>('midterm')

  const { data: classes = [] } = useQuery({ queryKey: ['classes'], queryFn: fetchClasses })
  const { data: terms = [] } = useQuery({ queryKey: ['terms'], queryFn: fetchTerms })
  const { data: classSubjects = [] } = useQuery({
    queryKey: ['class-subjects', classId],
    queryFn: () => fetchSubjectsForClass(classId),
    enabled: classId !== '',
  })
  const { data: progressFields = [] } = useQuery({
    queryKey: ['progress-fields'],
    queryFn: fetchProgressReportFields,
  })

  // Reset the subject choice whenever the class changes, since the
  // subject list itself depends on the class.
  useEffect(() => {
    setSubjectId('')
  }, [classId])

  const gradeGridQuery = useQuery({
    queryKey: ['grade-grid', classId, termId, subjectId, assessmentType],
    queryFn: () => fetchGradeGrid({ classId, termId, subjectId, assessmentType }),
    enabled: mode === 'grades' && classId !== '' && termId !== '' && subjectId !== '',
  })

  const progressGridQuery = useQuery({
    queryKey: ['progress-grid', classId, termId],
    queryFn: () => fetchProgressGrid({ classId, termId }),
    enabled: mode === 'progress' && classId !== '' && termId !== '',
  })

  const [scoreDrafts, setScoreDrafts] = useState<Record<string, string>>({})
  const [progressDrafts, setProgressDrafts] = useState<Record<string, string>>({})

  useEffect(() => {
    if (gradeGridQuery.data) {
      const drafts: Record<string, string> = {}
      for (const row of gradeGridQuery.data) {
        drafts[row.student_id] = row.score === null ? '' : String(row.score)
      }
      setScoreDrafts(drafts)
    }
  }, [gradeGridQuery.data])

  useEffect(() => {
    if (progressGridQuery.data) {
      const drafts: Record<string, string> = {}
      for (const row of progressGridQuery.data) {
        for (const field of progressFields) {
          drafts[`${row.student_id}:${field.id}`] = row.values[field.id] ?? ''
        }
      }
      setProgressDrafts(drafts)
    }
  }, [progressGridQuery.data, progressFields])

  const saveGradesMutation = useMutation({
    mutationFn: async () => {
      const rows = Object.entries(scoreDrafts)
        .filter(([, value]) => value.trim() !== '')
        .map(([student_id, value]) => ({ student_id, score: Number(value) }))

      await saveGrades({
        schoolId: profile!.school_id,
        termId,
        subjectId,
        assessmentType,
        enteredBy: profile!.id,
        rows,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grade-grid', classId, termId, subjectId, assessmentType] })
      queryClient.invalidateQueries({ queryKey: ['view-grid'] })
    },
  })

  const saveProgressMutation = useMutation({
    mutationFn: async () => {
      const rows = Object.entries(progressDrafts).map(([key, value]) => {
        const [student_id, field_id] = key.split(':')
        return { student_id, field_id, value }
      })

      await saveProgressEntries({
        schoolId: profile!.school_id,
        termId,
        enteredBy: profile!.id,
        rows,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['progress-grid', classId, termId] })
    },
  })

  const scoreOutOfRange = Object.values(scoreDrafts).some((v) => {
    if (v.trim() === '') return false
    const n = Number(v)
    return Number.isNaN(n) || n < 0 || n > 100
  })

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setMode('grades')}
          className={
            mode === 'grades'
              ? 'rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white'
              : 'rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100'
          }
        >
          Subject Grades
        </button>
        <button
          onClick={() => setMode('progress')}
          className={
            mode === 'progress'
              ? 'rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white'
              : 'rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100'
          }
        >
          Progress Report
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
        >
          <option value="">Select class</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={termId}
          onChange={(e) => setTermId(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
        >
          <option value="">Select term</option>
          {terms.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} — {t.academic_year}
            </option>
          ))}
        </select>

        {mode === 'grades' && (
          <>
            <select
              value={assessmentType}
              onChange={(e) => setAssessmentType(e.target.value as AssessmentType)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
            >
              <option value="midterm">Midterm</option>
              <option value="end_of_term">End of Term</option>
            </select>

            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              disabled={classId === ''}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none disabled:opacity-50"
            >
              <option value="">Select subject</option>
              {classSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      {mode === 'grades' && (
        <div className="mt-5">
          {classId === '' || termId === '' || subjectId === '' ? (
            <p className="text-sm text-gray-500">
              Choose a class, term, assessment type, and subject to load the grade sheet.
            </p>
          ) : gradeGridQuery.isLoading ? (
            <p className="text-sm text-gray-500">Loading students...</p>
          ) : gradeGridQuery.data?.length === 0 ? (
            <p className="text-sm text-gray-500">No students in this class yet.</p>
          ) : (
            <>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500">
                    <th className="py-2 pr-4">Student</th>
                    <th className="py-2 pr-4">Score (0–100)</th>
                  </tr>
                </thead>
                <tbody>
                  {gradeGridQuery.data?.map((row) => (
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

              {scoreOutOfRange && (
                <p className="mt-2 text-sm text-red-600">Scores must be between 0 and 100.</p>
              )}

              <button
                onClick={() => saveGradesMutation.mutate()}
                disabled={saveGradesMutation.isPending || scoreOutOfRange}
                className="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {saveGradesMutation.isPending ? 'Saving...' : 'Save Grades'}
              </button>
              {saveGradesMutation.isSuccess && (
                <span className="ml-3 text-sm text-green-600">Saved.</span>
              )}
            </>
          )}
        </div>
      )}

      {mode === 'progress' && (
        <div className="mt-5">
          {classId === '' || termId === '' ? (
            <p className="text-sm text-gray-500">Choose a class and term to load the progress sheet.</p>
          ) : progressFields.length === 0 ? (
            <p className="text-sm text-gray-500">
              No progress report fields set up yet — add some under the Setup tab first.
            </p>
          ) : progressGridQuery.isLoading ? (
            <p className="text-sm text-gray-500">Loading students...</p>
          ) : progressGridQuery.data?.length === 0 ? (
            <p className="text-sm text-gray-500">No students in this class yet.</p>
          ) : (
            <>
              <div className="space-y-6">
                {progressGridQuery.data?.map((row) => (
                  <div key={row.student_id} className="rounded-lg border border-gray-100 p-4">
                    <p className="text-sm font-medium text-gray-900">{row.full_name}</p>
                    <div className="mt-3 space-y-3">
                      {progressFields.map((field) => (
                        <div key={field.id}>
                          <label className="block text-xs font-medium text-gray-700">
                            {field.label}
                          </label>
                          <textarea
                            rows={2}
                            value={progressDrafts[`${row.student_id}:${field.id}`] ?? ''}
                            onChange={(e) =>
                              setProgressDrafts((prev) => ({
                                ...prev,
                                [`${row.student_id}:${field.id}`]: e.target.value,
                              }))
                            }
                            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => saveProgressMutation.mutate()}
                disabled={saveProgressMutation.isPending}
                className="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {saveProgressMutation.isPending ? 'Saving...' : 'Save Progress Reports'}
              </button>
              {saveProgressMutation.isSuccess && (
                <span className="ml-3 text-sm text-green-600">Saved.</span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
