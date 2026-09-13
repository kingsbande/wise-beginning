import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchAttendanceRegister, fetchAttendanceSummary } from '../../lib/attendanceApi'
import { generateAttendanceReportPdf } from '../../lib/pdf'
import { downloadCsv } from '../../lib/csv'

interface AttendanceReportsProps {
  schoolName: string
  logoUrl: string | null
  classId: string
  className: string
}

type Preset = 'daily' | 'weekly' | 'monthly'

function presetRange(preset: Preset): { from: string; to: string } {
  const today = new Date()
  const to = today.toISOString().slice(0, 10)

  const from = new Date(today)
  if (preset === 'daily') {
    // from === to, just today
  } else if (preset === 'weekly') {
    from.setDate(from.getDate() - 6)
  } else {
    from.setDate(from.getDate() - 29)
  }

  return { from: from.toISOString().slice(0, 10), to }
}

export function AttendanceReports({ schoolName, logoUrl, classId, className }: AttendanceReportsProps) {
  const [preset, setPreset] = useState<Preset>('weekly')
  const [range, setRange] = useState(() => presetRange('weekly'))
  const [downloading, setDownloading] = useState<'pdf' | 'csv' | null>(null)

  const { data: summary = [], isLoading } = useQuery({
    queryKey: ['attendance-summary', classId, range.from, range.to],
    queryFn: () => fetchAttendanceSummary({ classId, dateFrom: range.from, dateTo: range.to }),
  })

  function selectPreset(p: Preset) {
    setPreset(p)
    setRange(presetRange(p))
  }

  async function handleDownloadPdf() {
    setDownloading('pdf')
    try {
      await generateAttendanceReportPdf({
        schoolName,
        logoUrl,
        className,
        dateFrom: range.from,
        dateTo: range.to,
        rows: summary.map((r) => ({
          studentName: r.full_name,
          present: r.present,
          absent: r.absent,
          late: r.late,
          halfDay: r.half_day,
          excused: r.excused,
        })),
      })
    } finally {
      setDownloading(null)
    }
  }

  async function handleDownloadCsv() {
    setDownloading('csv')
    try {
      const register = await fetchAttendanceRegister({
        classId,
        dateFrom: range.from,
        dateTo: range.to,
      })
      downloadCsv(
        `${className.replace(/\s+/g, '_')}_attendance_${range.from}_to_${range.to}.csv`,
        ['Student', 'Date', 'Status'],
        register.map((r) => [r.student_name, r.date, r.status]),
      )
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        {(['daily', 'weekly', 'monthly'] as Preset[]).map((p) => (
          <button
            key={p}
            onClick={() => selectPreset(p)}
            className={
              preset === p
                ? 'rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white capitalize'
                : 'rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 capitalize'
            }
          >
            {p}
          </button>
        ))}

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <input
            type="date"
            value={range.from}
            onChange={(e) => setRange((prev) => ({ ...prev, from: e.target.value }))}
            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none sm:flex-none"
          />
          <span className="text-sm text-gray-400">to</span>
          <input
            type="date"
            value={range.to}
            onChange={(e) => setRange((prev) => ({ ...prev, to: e.target.value }))}
            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none sm:flex-none"
          />
        </div>

        <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
          <button
            onClick={handleDownloadPdf}
            disabled={downloading !== null}
            className="flex-1 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50 sm:flex-none"
          >
            {downloading === 'pdf' ? 'Preparing...' : 'Download PDF'}
          </button>
          <button
            onClick={handleDownloadCsv}
            disabled={downloading !== null}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 sm:flex-none"
          >
            {downloading === 'csv' ? 'Preparing...' : 'Download CSV'}
          </button>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        {isLoading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : summary.length === 0 ? (
          <p className="text-sm text-gray-500">No students in this class.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="py-2 pr-4">Student</th>
                <th className="py-2 pr-4">Present</th>
                <th className="py-2 pr-4">Absent</th>
                <th className="py-2 pr-4">Late</th>
                <th className="py-2 pr-4">Half-Day</th>
                <th className="py-2 pr-4">Excused</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((row) => (
                <tr key={row.student_id} className="border-b border-gray-100">
                  <td className="py-2 pr-4">{row.full_name}</td>
                  <td className="py-2 pr-4">{row.present}</td>
                  <td className="py-2 pr-4">{row.absent}</td>
                  <td className="py-2 pr-4">{row.late}</td>
                  <td className="py-2 pr-4">{row.half_day}</td>
                  <td className="py-2 pr-4">{row.excused}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
