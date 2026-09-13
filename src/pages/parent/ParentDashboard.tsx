import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  CalendarClock,
  Clock,
  ClipboardList,
  GraduationCap,
  LayoutGrid,
  RefreshCw,
  Wallet,
  X,
} from 'lucide-react'
import { useParentAuth } from '../../context/ParentAuthContext'
import { fetchStudentFeeSummary } from '../../lib/feesApi'
import { fetchMyStudent } from '../../lib/parent/parentApi'
import { LoadingScreen } from '../../components/LoadingScreen'
import { ParentHeader } from '../../components/parent/ParentHeader'
import { GradesTab } from '../../components/parent/GradesTab'
import { ProgressReportTab } from '../../components/parent/ProgressReportTab'
import { FeesTab } from '../../components/parent/parent-FeesTab'
import { WeeklyReviewsTab } from '../../components/parent/WeeklyReviewsTab'

type Tab = 'grades' | 'progress' | 'fees' | 'reviews'

const TABS: { id: Tab; label: string; icon: typeof GraduationCap }[] = [
  { id: 'grades', label: 'Grades', icon: GraduationCap },
  { id: 'progress', label: 'Progress Report', icon: ClipboardList },
  { id: 'reviews', label: 'Weekly Reviews', icon: CalendarClock },
  { id: 'fees', label: 'Fees', icon: Wallet },
]

export function ParentDashboard() {
  const { parentProfile } = useParentAuth()
  const [tab, setTab] = useState<Tab>('reviews')
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  useEffect(() => {
    document.body.style.overflow = isMobileMenuOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [isMobileMenuOpen])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1024px)')
    const handleChange = (event: MediaQueryListEvent) => {
      if (event.matches) setIsMobileMenuOpen(false)
    }
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  const {
    data: student,
    isLoading,
    isError: isStudentError,
    refetch: refetchStudent,
  } = useQuery({
    queryKey: ['my-student', parentProfile?.student_id],
    queryFn: () => fetchMyStudent(parentProfile!.student_id),
    enabled: !!parentProfile?.student_id,
  })

  const { data: feeSummary = [], isError: isFeeError } = useQuery({
    queryKey: ['my-fee-summary-dashboard', student?.id],
    queryFn: () => fetchStudentFeeSummary(student!.id),
    enabled: !!student?.id,
  })

  const outstandingBalance = feeSummary.reduce((total, item) => total + Math.max(item.balance, 0), 0)

  const formattedDate = useMemo(() => {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date())
  }, [])

  if (isLoading) {
    return <LoadingScreen />
  }

  if (isStudentError || !student) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-8">
        <section role="alert" className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
            <RefreshCw className="h-5 w-5" />
          </div>
          <h1 className="mt-4 text-lg font-semibold text-slate-900">
            We couldn&apos;t load the learner profile
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Check your connection and try again. Contact the school if this account is not linked to a learner.
          </p>
          <button
            type="button"
            onClick={() => void refetchStudent()}
            className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
        </section>
      </main>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <ParentHeader
        student={student}
        isSidebarCollapsed={isSidebarCollapsed}
        isMobileMenuOpen={isMobileMenuOpen}
        onToggleSidebar={() => setIsSidebarCollapsed((value) => !value)}
        onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
      />

      <main className="mx-auto flex max-w-7xl flex-col items-start gap-4 px-3 py-4 pb-20 sm:gap-6 sm:px-4 lg:flex-row lg:px-8">
        {isMobileMenuOpen && (
          <div
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
            className="fixed inset-0 z-30 bg-slate-900/50 backdrop-blur-sm lg:hidden"
          />
        )}

        <aside
          id="parent-sidebar"
          className={`fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] overflow-y-auto rounded-none border-r border-slate-200 bg-white p-3 shadow-2xl transition-transform duration-300 ease-in-out sm:p-4 lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:z-auto lg:max-w-none lg:translate-x-0 lg:rounded-2xl lg:border lg:shadow-sm ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} ${isSidebarCollapsed ? 'lg:w-24' : 'lg:w-72'}`}
        >
          <div className="flex items-center justify-between px-2 pb-3 sm:pb-4 lg:justify-start lg:gap-3">
            <div className="flex items-center gap-3">
              <p className={`text-xs font-semibold uppercase tracking-[0.15em] text-slate-400 ${isSidebarCollapsed ? 'lg:hidden' : ''}`}>
                Menu
              </p>
              <span className={`text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 ${isSidebarCollapsed ? 'lg:hidden' : ''}`}>
                Quick links
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(false)}
              aria-label="Close navigation menu"
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 lg:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className={`mb-4 flex items-center gap-3 rounded-2xl bg-slate-100 px-3 py-2 ${isSidebarCollapsed ? 'lg:justify-center lg:px-2' : ''}`}>
            <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-gradient-to-br from-slate-900 to-rose-700 text-white">
              <LayoutGrid className="h-4 w-4" />
            </div>
            <div className={isSidebarCollapsed ? 'lg:hidden' : ''}>
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Dashboard</p>
              <p className="text-sm font-semibold text-slate-800">Overview</p>
            </div>
          </div>

          <nav className="flex flex-col gap-1">
            {TABS.map(({ id, label, icon: Icon }) => {
              const isActive = tab === id
              return (
                <button
                  key={id}
                  onClick={() => {
                    setTab(id)
                    setIsMobileMenuOpen(false)
                  }}
                  aria-current={isActive ? 'page' : undefined}
                  title={label}
                  className={`group relative flex min-h-11 items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2.5 text-left text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 ${isSidebarCollapsed ? 'lg:justify-center lg:px-2 lg:py-3' : ''} ${isActive ? 'bg-rose-50 text-rose-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
                >
                  <span className={`absolute bottom-1.5 left-0 top-1.5 w-1 rounded-full ${isActive ? 'bg-rose-600' : 'bg-transparent'}`} />
                  <Icon className={`h-4 w-4 flex-none ${isActive ? 'text-rose-600' : 'text-slate-400 group-hover:text-slate-500'}`} />
                  <span className={isSidebarCollapsed ? 'lg:hidden' : ''}>{label}</span>
                </button>
              )
            })}
          </nav>
        </aside>

        <section className="w-full flex-1 space-y-4 sm:space-y-6">
            <section className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-rose-900 p-6 text-white shadow-[0_24px_60px_-28px_rgba(15,23,42,0.9)] sm:p-8">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(244,114,182,0.22),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(251,146,60,0.15),transparent_24%)]" />
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

              <div className="relative">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-rose-200">
                    Parent Portal
                  </p>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-slate-200 backdrop-blur-sm">
                    <Clock className="h-3.5 w-3.5 text-rose-300" />
                    {formattedDate}
                  </span>
                </div>
                <div>
                  <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                    {student.full_name}
                  </h2>
                  <p className="mt-3 max-w-xl text-sm text-slate-300 sm:text-base">
                    Keep an eye on achievement, attendance, and fees from one disciplined view.
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-slate-100">
                      {student.class_name}
                    </span>
                    <span className="rounded-full border border-rose-400/30 bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-100">
                      Active learner
                    </span>
                    {outstandingBalance > 0 && (
                      <span className="rounded-full border border-amber-300/30 bg-amber-400/15 px-3 py-1 text-xs font-semibold text-amber-100">
                        Balance: MWK {outstandingBalance.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>

              </div>
            </section>

            <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.8)] sm:p-6">
              {isFeeError && (
                <div role="status" className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <Wallet className="mt-0.5 h-4 w-4 flex-none text-amber-600" />
                  <p>Fee information is temporarily unavailable. Your academic records are still available.</p>
                </div>
              )}
              {tab === 'grades' && <GradesTab student={student} />}
              {tab === 'progress' && <ProgressReportTab student={student} />}
              {tab === 'reviews' && <WeeklyReviewsTab student={student} />}
              {tab === 'fees' && <FeesTab student={student} />}
            </section>
        </section>
      </main>
    </div>
  )
}
