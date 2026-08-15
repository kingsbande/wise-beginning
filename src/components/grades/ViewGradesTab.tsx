import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchClasses } from '../../lib/queries'
import { useAuth } from '../../context/AuthContext'
import {
  fetchGradeRelease,
  fetchGradeScale,
  fetchProgressEntriesForStudent,
  fetchProgressReportFields,
  fetchTerms,
  fetchViewGrid,
  releaseGrades,
  scoreToLetter,
} from '../../lib/gradesApi'
import { generateGradeReportPdf, generateProgressReportPdf } from '../../lib/pdf'
import { ConfirmDialog } from '../ConfirmDialog'

export function ViewGradesTab() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()

  const [classId, setClassId] = useState('')
  const [termId, setTermId] = useState('')
  const [confirmingRelease, setConfirmingRelease] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const { data: classes = [] } = useQuery({ queryKey: ['classes'], queryFn: fetchClasses })
  const { data: terms = [] } = useQuery({ queryKey: ['terms'], queryFn: fetchTerms })
  const { data: gradeScale = [] } = useQuery({ queryKey: ['grade-scale'], queryFn: fetchGradeScale })
  const { data: progressFields = [] } = useQuery({
    queryKey: ['progress-fields'],
    queryFn: fetchProgressReportFields,
  })

  const viewGridQuery = useQuery({
    queryKey: ['view-grid', classId, termId],
    queryFn: () => fetchViewGrid({ classId, termId }),
    enabled: classId !== '' && termId !== '',
  })

  const releaseQuery = useQuery({
    queryKey: ['grade-release', classId, termId],
    queryFn: () => fetchGradeRelease(classId, termId),
    enabled: classId !== '' && termId !== '',
  })

  const releaseMutation = useMutation({
    mutationFn: () =>
      releaseGrades({
        schoolId: profile!.school_id,
        classId,
        termId,
        releasedBy: profile!.id,
      }),
    onSuccess: () => {
      setConfirmingRelease(false)
      queryClient.invalidateQueries({ queryKey: ['grade-release', classId, termId] })
    },
  })

  const selectedClass = classes.find((c) => c.id === classId)
  const selectedTerm = terms.find((t) => t.id === termId)

  async function handleDownloadGradeReport(row: {
    student_id: string
    full_name: string
    admission_number: string
    bySubject: Record<string, { midterm: number | null; end_of_term: number | null }>
  }) {
    if (!profile || !viewGridQuery.data || !selectedClass || !selectedTerm) return

    setDownloadingId(`grade-${row.student_id}`)
    try {
      const rows = viewGridQuery.data.subjects.map((subject) => {
        const cell = row.bySubject[subject.id]
        const finalScore = cell.end_of_term ?? cell.midterm
        return {
          subject: subject.name,
          midterm: cell.midterm,
          endOfTerm: cell.end_of_term,
          letter: scoreToLetter(gradeScale, finalScore),
        }
      })

      await generateGradeReportPdf({
        schoolName: profile.school_name,
        logoUrl: profile.school_logo_url,
        studentName: row.full_name,
        admissionNumber: row.admission_number,
        className: selectedClass.name,
        termName: selectedTerm.name,
        academicYear: selectedTerm.academic_year,
        rows,
      })
    } finally {
      setDownloadingId(null)
    }
  }

  async function handleDownloadProgressReport(row: { student_id: string; full_name: string; admission_number: string }) {
    if (!profile || !selectedClass || !selectedTerm) return

    setDownloadingId(`progress-${row.student_id}`)
    try {
      const values = await fetchProgressEntriesForStudent(row.student_id, termId)
      const fields = progressFields.map((f) => ({ label: f.label, value: values[f.id] ?? '' }))

      await generateProgressReportPdf({
        schoolName: profile.school_name,
        logoUrl: profile.school_logo_url,
        studentName: row.full_name,
        admissionNumber: row.admission_number,
        className: selectedClass.name,
        termName: selectedTerm.name,
        academicYear: selectedTerm.academic_year,
        fields,
      })
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="flex flex-wrap items-center gap-2">
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

        {classId !== '' && termId !== '' && (
          <div className="ml-auto flex items-center gap-3">
            {releaseQuery.data ? (
              <span className="rounded-full bg-green-100 px-3 py-1 text-xs text-green-700">
                Released {new Date(releaseQuery.data.released_at).toLocaleDateString()}
              </span>
            ) : (
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-500">
                Not yet released
              </span>
            )}
            <button
              onClick={() => setConfirmingRelease(true)}
              className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800"
            >
              {releaseQuery.data ? 'Re-release' : 'Release Grades'}
            </button>
          </div>
        )}
      </div>

      <div className="mt-5">
        {classId === '' || termId === '' ? (
          <p className="text-sm text-gray-500">Choose a class and term to view grades.</p>
        ) : viewGridQuery.isLoading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : viewGridQuery.data?.subjects.length === 0 ? (
          <p className="text-sm text-gray-500">
            No subjects are assigned to this class yet — add some under the Setup tab.
          </p>
        ) : viewGridQuery.data?.rows.length === 0 ? (
          <p className="text-sm text-gray-500">No students in this class yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="py-2 pr-4">Student</th>
                  {viewGridQuery.data?.subjects.map((s) => (
                    <th key={s.id} className="py-2 pr-4">
                      {s.name}
                      <div className="text-[10px] font-normal text-gray-400">Mid / End / Grade</div>
                    </th>
                  ))}
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {viewGridQuery.data?.rows.map((row) => (
                  <tr key={row.student_id} className="border-b border-gray-100">
                    <td className="py-2 pr-4">{row.full_name}</td>
                    {viewGridQuery.data!.subjects.map((s) => {
                      const cell = row.bySubject[s.id]
                      const finalScore = cell.end_of_term ?? cell.midterm
                      const letter = scoreToLetter(gradeScale, finalScore)
                      return (
                        <td key={s.id} className="py-2 pr-4 text-xs">
                          {cell.midterm ?? '-'} / {cell.end_of_term ?? '-'} / {letter ?? '-'}
                        </td>
                      )
                    })}
                    <td className="py-2 pr-4">
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => handleDownloadGradeReport(row)}
                          disabled={downloadingId === `grade-${row.student_id}`}
                          className="text-xs font-medium text-blue-600 underline hover:text-blue-800 disabled:opacity-50"
                        >
                          Grade Report PDF
                        </button>
                        <button
                          onClick={() => handleDownloadProgressReport(row)}
                          disabled={downloadingId === `progress-${row.student_id}`}
                          className="text-xs font-medium text-blue-600 underline hover:text-blue-800 disabled:opacity-50"
                        >
                          Progress Report PDF
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirmingRelease && (
        <ConfirmDialog
          title="Release Grades"
          message={`Release all grades for ${selectedClass?.name} — ${selectedTerm?.name}? This makes them final for the term.`}
          confirmLabel={releaseMutation.isPending ? 'Releasing...' : 'Release'}
          danger={false}
          onCancel={() => setConfirmingRelease(false)}
          onConfirm={() => releaseMutation.mutate()}
        />
      )}
    </div>
  )
}
