import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  fetchMyFullGradeReport,
  fetchMyGrades,
  fetchMyReleasedTerms,
  fetchMySubjectsForClass,
  MyStudent,
} from '../../lib/parent/parentApi'
import { fetchGradeScale, scoreToLetter } from '../../lib/gradesApi'
import { generateGradeReportPdf } from '../../lib/pdf'
import { useParentAuth } from '../../context/ParentAuthContext'
import { AssessmentType } from '../../types'

export function GradesTab({ student }: { student: MyStudent }) {
  const { parentProfile } = useParentAuth()
  const [termId, setTermId] = useState('')
  const [assessmentType, setAssessmentType] = useState<AssessmentType>('midterm')
  const [downloading, setDownloading] = useState(false)

  const { data: releasedTerms = [] } = useQuery({
    queryKey: ['my-released-terms', student.class_id],
    queryFn: () => fetchMyReleasedTerms(student.class_id),
  })

  useEffect(() => {
    if (releasedTerms.length > 0 && termId === '') {
      setTermId(releasedTerms[0].term_id)
    }
  }, [releasedTerms, termId])

  const { data: subjects = [] } = useQuery({
    queryKey: ['my-class-subjects', student.class_id],
    queryFn: () => fetchMySubjectsForClass(student.class_id),
  })

  const { data: gradeScale = [] } = useQuery({ queryKey: ['my-grade-scale'], queryFn: fetchGradeScale })

  const subjectIdsKey = subjects.map((s) => s.id).join(',')
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['my-grades', student.id, termId, assessmentType, subjectIdsKey],
    queryFn: () => fetchMyGrades({ studentId: student.id, termId, assessmentType, subjects }),
    enabled: termId !== '' && subjects.length > 0,
  })

  const selectedTerm = releasedTerms.find((t) => t.term_id === termId)

  async function handleDownload() {
    if (!parentProfile || !selectedTerm) return
    setDownloading(true)
    try {
      const fullRows = await fetchMyFullGradeReport({ studentId: student.id, termId, subjects })
      await generateGradeReportPdf({
        schoolName: parentProfile.school_name,
        logoUrl: parentProfile.school_logo_url,
        studentName: student.full_name,
        admissionNumber: student.admission_number,
        className: student.class_name,
        termName: selectedTerm.term_name,
        academicYear: selectedTerm.academic_year,
        rows: fullRows.map((r) => ({
          subject: r.subject_name,
          midterm: r.midterm,
          endOfTerm: r.end_of_term,
          letter: scoreToLetter(gradeScale, r.end_of_term ?? r.midterm),
        })),
      })
    } finally {
      setDownloading(false)
    }
  }

  if (releasedTerms.length === 0) {
    return <p className="text-sm text-gray-500">No grades have been released yet.</p>
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={termId}
          onChange={(e) => setTermId(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
        >
          {releasedTerms.map((t) => (
            <option key={t.term_id} value={t.term_id}>
              {t.term_name} — {t.academic_year}
            </option>
          ))}
        </select>

        <button
          onClick={handleDownload}
          disabled={downloading}
          className="ml-auto rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {downloading ? 'Preparing...' : 'Download PDF'}
        </button>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => setAssessmentType('midterm')}
          className={
            assessmentType === 'midterm'
              ? 'rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white'
              : 'rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100'
          }
        >
          Midterm
        </button>
        <button
          onClick={() => setAssessmentType('end_of_term')}
          className={
            assessmentType === 'end_of_term'
              ? 'rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white'
              : 'rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100'
          }
        >
          End of Term
        </button>
      </div>

      <div className="mt-4">
        {isLoading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="py-2 pr-4">Subject</th>
                <th className="py-2 pr-4">Score</th>
                <th className="py-2 pr-4">Grade</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.subject_id} className="border-b border-gray-100">
                  <td className="py-2 pr-4">{r.subject_name}</td>
                  <td className="py-2 pr-4">{r.score ?? '-'}</td>
                  <td className="py-2 pr-4">{scoreToLetter(gradeScale, r.score) ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
