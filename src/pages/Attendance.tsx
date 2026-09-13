import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchClasses } from '../lib/queries'
import { useAuth } from '../context/AuthContext'
import { AttendanceMarkingGrid } from '../components/attendance/AttendanceMarkingGrid'
import { AttendanceReports } from '../components/attendance/AttendanceReports'

type Tab = 'mark' | 'reports'

export function Attendance() {
  const { profile } = useAuth()
  const [tab, setTab] = useState<Tab>('mark')
  const [classId, setClassId] = useState('')

  const { data: classes = [] } = useQuery({ queryKey: ['classes'], queryFn: fetchClasses })
  const selectedClass = classes.find((c) => c.id === classId)

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="mb-4 text-lg font-semibold text-gray-900">Attendance</h1>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <div className="flex gap-2 border-b border-gray-200">
          <button
            onClick={() => setTab('mark')}
            className={
              tab === 'mark'
                ? 'border-b-2 border-gray-900 px-3 py-2 text-sm font-medium text-gray-900'
                : 'px-3 py-2 text-sm text-gray-500 hover:text-gray-900'
            }
          >
            Mark Attendance
          </button>
          <button
            onClick={() => setTab('reports')}
            className={
              tab === 'reports'
                ? 'border-b-2 border-gray-900 px-3 py-2 text-sm font-medium text-gray-900'
                : 'px-3 py-2 text-sm text-gray-500 hover:text-gray-900'
            }
          >
            Reports
          </button>
        </div>

        <select
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          className="ml-auto rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
        >
          <option value="">Select class</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {classId === '' || !selectedClass || !profile ? (
        <p className="text-sm text-gray-500">Choose a class to continue.</p>
      ) : tab === 'mark' ? (
        <AttendanceMarkingGrid
          schoolId={profile.school_id}
          classId={selectedClass.id}
          className={selectedClass.name}
          markedBy={profile.id}
        />
      ) : (
        <AttendanceReports
          schoolName={profile.school_name}
          logoUrl={profile.school_logo_url}
          classId={selectedClass.id}
          className={selectedClass.name}
        />
      )}
    </div>
  )
}
