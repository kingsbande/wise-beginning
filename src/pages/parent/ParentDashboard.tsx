import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ClipboardList, GraduationCap } from 'lucide-react'
import { useParentAuth } from '../../context/ParentAuthContext'
import { fetchMyStudent } from '../../lib/parent/parentApi'
import { LoadingScreen } from '../../components/LoadingScreen'
import { ParentHeader } from '../../components/parent/ParentHeader'
import { GradesTab } from '../../components/parent/GradesTab'
import { ProgressReportTab } from '../../components/parent/ProgressReportTab'

type Tab = 'grades' | 'progress'

const TABS: { id: Tab; label: string; icon: typeof GraduationCap }[] = [
  { id: 'grades', label: 'Grades', icon: GraduationCap },
  { id: 'progress', label: 'Progress Report', icon: ClipboardList },
]

export function ParentDashboard() {
  const { parentProfile } = useParentAuth()
  const [tab, setTab] = useState<Tab>('grades')

  const { data: student, isLoading } = useQuery({
    queryKey: ['my-student', parentProfile?.student_id],
    queryFn: () => fetchMyStudent(parentProfile!.student_id),
    enabled: !!parentProfile?.student_id,
  })

  if (isLoading || !student) {
    return <LoadingScreen />
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <ParentHeader student={student} />

      <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        {/* Hero — same gradient + wave motif as the admin dashboard */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-900 to-rose-900 p-6 text-white shadow-sm">
          <svg
            className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 text-white/10"
            viewBox="0 0 200 200"
            fill="none"
            aria-hidden="true"
          >
            <path d="M10 100 C 50 40, 150 40, 190 100 C 150 160, 50 160, 10 100 Z" stroke="currentColor" strokeWidth="1" />
            <path d="M30 100 C 60 60, 140 60, 170 100 C 140 140, 60 140, 30 100 Z" stroke="currentColor" strokeWidth="1" />
            <path d="M50 100 C 70 80, 130 80, 150 100 C 130 120, 70 120, 50 100 Z" stroke="currentColor" strokeWidth="1" />
          </svg>

          <p className="text-sm font-medium uppercase tracking-[0.2em] text-rose-300">
            Parent Portal
          </p>
          <h2 className="relative mt-2 text-2xl font-semibold">{student.full_name}</h2>
          <p className="relative mt-2 max-w-xl text-sm text-slate-300">
            Review grades and progress reports for your child in one place.
          </p>
        </div>

        {/* Tabs — same pill / left-accent language as the admin sidebar */}
        <div className="flex gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          {TABS.map(({ id, label, icon: Icon }) => {
            const isActive = tab === id
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 ${
                  isActive
                    ? 'bg-rose-50 text-rose-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-rose-600' : 'text-slate-400'}`} />
                {label}
              </button>
            )
          })}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {tab === 'grades' ? <GradesTab student={student} /> : <ProgressReportTab student={student} />}
        </div>
      </main>
    </div>
  )
}
