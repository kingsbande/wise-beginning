import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { fetchTeacherAssignments } from '../lib/staff/staffApi'
import logo from '../assets/logo.png'

export function TeacherDashboard() {
  const { profile, signOut } = useAuth()

  const timeGreeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour >= 5 && hour < 12) return 'Good morning'
    if (hour >= 12 && hour < 17) return 'Good afternoon'
    return 'Good evening'
  }, [])

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ['teacher-assignments', profile?.id],
    queryFn: () => fetchTeacherAssignments(profile!.id),
    enabled: !!profile?.id,
  })

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="border-b border-slate-800 bg-slate-900">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src={logo}
              alt="School logo"
              className="h-9 w-9 flex-none rounded-full border border-white/10 object-cover"
            />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold text-white">
                {profile?.school_name ?? 'School Portal'}
              </p>
              <p className="truncate text-[11px] font-medium uppercase tracking-[0.2em] text-rose-400">
                Teacher Portal
              </p>
            </div>
          </div>

          <div className="flex flex-none items-center gap-3">
            <span className="hidden text-sm text-slate-200 sm:inline">{profile?.full_name}</span>
            <button
              onClick={signOut}
              className="flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:border-rose-400 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-900 to-rose-900 p-4 text-white shadow-sm sm:p-6">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-rose-300">
            {timeGreeting}
          </p>
          <h2 className="mt-2 text-xl font-semibold sm:text-2xl">{profile?.full_name ?? 'Teacher'}</h2>
          <p className="relative mt-2 max-w-xl text-sm text-slate-300 sm:text-base">
            Your class and subject assignments are listed below. Grade entry is coming to this
            dashboard next.
          </p>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <h3 className="text-lg font-semibold text-slate-900">My Assignments</h3>
          {isLoading ? (
            <p className="mt-2 text-sm text-slate-500">Loading...</p>
          ) : assignments.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              No class or subject assignments yet — ask your admin to assign you.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {assignments.map((a) => (
                <li key={a.id} className="py-2 text-sm text-slate-700">
                  <span className="font-medium text-slate-900">{a.subject_name}</span> —{' '}
                  {a.class_name}
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  )
}
