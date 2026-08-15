import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  fetchMyProgressEntries,
  fetchMyProgressReportFields,
  fetchMyReleasedTerms,
  MyStudent,
} from '../../lib/parent/parentApi'
import { generateProgressReportPdf } from '../../lib/pdf'
import { useParentAuth } from '../../context/ParentAuthContext'

export function ProgressReportTab({ student }: { student: MyStudent }) {
  const { parentProfile } = useParentAuth()
  const [termId, setTermId] = useState('')
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

  const { data: fields = [] } = useQuery({
    queryKey: ['my-progress-fields'],
    queryFn: fetchMyProgressReportFields,
  })

  const { data: values = {}, isLoading } = useQuery({
    queryKey: ['my-progress-entries', student.id, termId],
    queryFn: () => fetchMyProgressEntries(student.id, termId),
    enabled: termId !== '',
  })

  const selectedTerm = releasedTerms.find((t) => t.term_id === termId)

  async function handleDownload() {
    if (!parentProfile || !selectedTerm) return
    setDownloading(true)
    try {
      await generateProgressReportPdf({
        schoolName: parentProfile.school_name,
        logoUrl: parentProfile.school_logo_url,
        studentName: student.full_name,
        admissionNumber: student.admission_number,
        className: student.class_name,
        termName: selectedTerm.term_name,
        academicYear: selectedTerm.academic_year,
        fields: fields.map((f) => ({ label: f.label, value: values[f.id] ?? '' })),
      })
    } finally {
      setDownloading(false)
    }
  }

  if (releasedTerms.length === 0) {
    return <p className="text-sm text-gray-500">No progress reports have been released yet.</p>
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

      <div className="mt-4 space-y-4">
        {isLoading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : (
          fields.map((f) => (
            <div key={f.id}>
              <p className="text-xs font-medium text-gray-500">{f.label}</p>
              <p className="mt-1 text-sm text-gray-800">{values[f.id] || '—'}</p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
