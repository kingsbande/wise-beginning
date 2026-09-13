import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  AlertTriangle,
  BarChart3,
  BookOpen,
  CalendarCheck,
  ChevronDown,
  Clock,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Phone,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Users,
  X,
  ClipboardList,
  LibraryBig,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { fetchTeacherAssignments } from '../lib/staff/staffApi'
import { fetchMyClassTeacherClasses, normalizeClassId } from '../lib/attendanceApi'
import { fetchStudentsPage, PAGE_SIZE } from '../lib/queries'
import { AttendanceMarkingGrid } from '../components/attendance/AttendanceMarkingGrid'
import { AttendanceReports } from '../components/attendance/AttendanceReports'
import { TeacherGrades } from '../components/teacher/TeacherGrades'
import { TeacherReviewsView } from '../components/teacher/TeacherReviewsView'
import { TeacherCurriculumView } from '../components/teacher/TeacherCurriculumView'
import { ProfilePictureForm } from '../components/settings/ProfilePictureForm'
import { ChangePasswordForm } from '../components/settings/ChangePasswordForm'
import { useDebouncedValue } from '../lib/useDebouncedValue'
import { Pagination } from '../components/Pagination'
import logo from '../assets/logo.png'

type View = 'overview' | 'attendance' | 'grades' | 'students' | 'curriculum' | 'reviews' | 'settings'

const NAV_ITEMS: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'attendance', label: 'Attendance', icon: CalendarCheck },
  { id: 'grades', label: 'Grades & Reports', icon: BarChart3 },
  { id: 'students', label: 'Classes & Students', icon: BookOpen },
  { id: 'curriculum', label: 'Topics Taught', icon: LibraryBig },
  { id: 'reviews', label: 'Weekly Reviews', icon: ClipboardList },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
]

function getInitials(name?: string | null) {
  if (!name) return 'T'
  const parts = name.trim().split(/\s+/)
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '')
  return initials.join('') || 'T'
}

export function TeacherDashboard() {
  const { profile, signOut } = useAuth()
  const [activeView, setActiveView] = useState<View>(() => {
    const saved = sessionStorage.getItem('teacherDashboardView') as View | null
    return saved && NAV_ITEMS.some((item) => item.id === saved) ? saved : 'overview'
  })
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement>(null)

  // Attendance View state
  const [attendanceClassId, setAttendanceClassId] = useState<string>('')
  const [attendanceTab, setAttendanceTab] = useState<'mark' | 'reports'>('mark')

  // Students / Roster View state
  const [rosterClassId, setRosterClassId] = useState<string>('')
  const [rosterSearch, setRosterSearch] = useState('')
  const [rosterPage, setRosterPage] = useState(0)
  const debouncedRosterSearch = useDebouncedValue(rosterSearch)

  useEffect(() => {
    sessionStorage.setItem('teacherDashboardView', activeView)
  }, [activeView])

  // Close profile dropdown when clicking outside
  useEffect(() => {
    if (!isProfileMenuOpen) return
    function handleClickOutside(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isProfileMenuOpen])

  // Lock body scroll on mobile when menu drawer is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isMobileMenuOpen])

  // Auto-close mobile drawer if viewport grows to desktop
  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1024px)')
    const handleChange = (event: MediaQueryListEvent) => {
      if (event.matches) setIsMobileMenuOpen(false)
    }
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  const timeGreeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour >= 5 && hour < 12) return 'Good morning'
    if (hour >= 12 && hour < 17) return 'Good afternoon'
    return 'Good evening'
  }, [])

  const formattedDate = useMemo(() => {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date())
  }, [])

  const {
    data: assignments = [],
    isLoading: isAssignmentsLoading,
    isError: isAssignmentsError,
    refetch: refetchAssignments,
  } = useQuery({
    queryKey: ['teacher-assignments', profile?.id],
    queryFn: () => fetchTeacherAssignments(profile!.id),
    enabled: !!profile?.id,
  })

  const { data: classTeacherClasses = [] } = useQuery({
    queryKey: ['my-class-teacher-classes', profile?.id],
    queryFn: () => fetchMyClassTeacherClasses(profile!.id),
    enabled: !!profile?.id,
  })

  // List of all distinct classes taught or managed by this teacher
  const distinctClasses = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of classTeacherClasses) {
      map.set(c.id, c.name)
    }
    for (const a of assignments) {
      if (!map.has(a.class_id)) {
        map.set(a.class_id, a.class_name)
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [classTeacherClasses, assignments])

  // Sync attendance selection only with classes where this teacher is the class teacher.
  useEffect(() => {
    if (classTeacherClasses.length === 0) {
      setAttendanceClassId('')
      return
    }

    if (!classTeacherClasses.some((c) => c.id === attendanceClassId)) {
      setAttendanceClassId(classTeacherClasses[0].id)
    }
  }, [classTeacherClasses, attendanceClassId])

  // Sync initial class selection for Roster
  useEffect(() => {
    if (!rosterClassId && distinctClasses.length > 0) {
      setRosterClassId(distinctClasses[0].id)
    }
  }, [distinctClasses, rosterClassId])

  // Fetch student roster for the selected class in "Students" view
  const { data: rosterData, isLoading: isRosterLoading } = useQuery({
    queryKey: ['teacher-class-roster', rosterClassId, rosterPage, debouncedRosterSearch],
    queryFn: () =>
      fetchStudentsPage({
        page: rosterPage,
        search: debouncedRosterSearch,
        classId: rosterClassId,
        dateJoinedFrom: '',
        status: 'active',
      }),
    enabled: !!rosterClassId && (activeView === 'students' || activeView === 'overview'),
  })

  const studentsList = rosterData?.students ?? []
  const totalStudentsInClass = rosterData?.total ?? 0

  const initials = getInitials(profile?.full_name)
  const isClassTeacher = classTeacherClasses.length > 0
  const selectedAttendanceClass = classTeacherClasses.find((c) => c.id === attendanceClassId)
  const selectedRosterClass = distinctClasses.find((c) => c.id === rosterClassId)

  function handleNavSelect(id: View) {
    setActiveView(id)
    setIsMobileMenuOpen(false)
  }

  function handleJumpToAttendance(classId?: string) {
    if (classId) setAttendanceClassId(classId)
    setActiveView('attendance')
  }

  function handleJumpToGrades() {
    setActiveView('grades')
  }

  function handleJumpToRoster(classId?: string) {
    if (classId) {
      const safeId = normalizeClassId(classId)
      setRosterClassId(safeId)
      setRosterPage(0)
    }
    setActiveView('students')
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Top Header Bar */}
      <header className="border-b border-slate-800 bg-slate-900 sticky top-0 z-30">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-3 sm:px-6 lg:px-8">
          {/* Left cluster: Mobile drawer trigger + Desktop collapse + Logo + Portal badge */}
          <div className="flex min-w-0 items-center gap-3">
            {/* Mobile trigger */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={isMobileMenuOpen}
              className="flex h-10 w-10 flex-none items-center justify-center rounded-full border border-white/10 text-slate-200 transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Desktop collapse trigger */}
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed((v) => !v)}
              aria-label={isSidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
              className="hidden h-10 w-10 flex-none items-center justify-center rounded-full border border-white/10 text-slate-200 transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 lg:flex"
            >
              {isSidebarCollapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>

            <img
              src={logo}
              alt="School logo"
              className="h-9 w-9 flex-none rounded-full border border-white/10 object-cover"
            />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold text-white">
                {profile?.school_name ?? 'School Portal'}
              </p>
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[11px] font-medium uppercase tracking-[0.2em] text-rose-400">
                  Teacher Portal
                </span>
                {isClassTeacher && (
                  <span className="hidden sm:inline-flex items-center rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-medium text-rose-300 border border-rose-500/30">
                    Class Teacher
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right cluster: Profile & Sign Out */}
          <div className="flex flex-none items-center gap-2 sm:gap-3">
            <span className="hidden text-sm text-slate-200 md:inline font-medium">
              {profile?.full_name}
            </span>

            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.full_name}
                className="hidden h-9 w-9 rounded-full object-cover sm:flex border border-white/20"
              />
            ) : (
              <div
                aria-hidden="true"
                className="hidden h-9 w-9 items-center justify-center rounded-full bg-rose-600 text-sm font-semibold text-white sm:flex shadow-sm"
              >
                {initials}
              </div>
            )}

            <button
              onClick={signOut}
              className="hidden min-h-10 items-center justify-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:border-rose-400 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 sm:flex"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden lg:inline">Sign out</span>
            </button>

            {/* Mobile / Dropdown Account Trigger */}
            <div className="relative sm:hidden" ref={profileMenuRef}>
              <button
                type="button"
                onClick={() => setIsProfileMenuOpen((v) => !v)}
                aria-label="Open account menu"
                aria-expanded={isProfileMenuOpen}
                className="flex items-center gap-1 rounded-full p-1 transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
              >
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile.full_name}
                    className="h-9 w-9 rounded-full object-cover border border-white/20"
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-600 text-sm font-semibold text-white">
                    {initials}
                  </div>
                )}
                <ChevronDown
                  className={`h-4 w-4 text-slate-300 transition-transform ${isProfileMenuOpen ? 'rotate-180' : ''
                    }`}
                />
              </button>

              {isProfileMenuOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl">
                  <div className="border-b border-slate-100 px-4 py-2.5">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {profile?.full_name ?? 'Teacher'}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {isClassTeacher
                        ? `Class Teacher (${classTeacherClasses.map((c) => c.name).join(', ')})`
                        : 'Teacher'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileMenuOpen(false)
                      handleNavSelect('settings')
                    }}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                  >
                    <SettingsIcon className="h-4 w-4 text-slate-400" />
                    Account Settings
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileMenuOpen(false)
                      signOut()
                    }}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-rose-600 transition hover:bg-rose-50"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col items-start gap-4 px-3 py-4 pb-24 sm:gap-6 sm:px-4 lg:flex-row lg:px-8">
        {/* Backdrop for Mobile Drawer */}
        {isMobileMenuOpen && (
          <div
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
            className="fixed inset-0 z-30 bg-slate-900/50 backdrop-blur-sm lg:hidden"
          />
        )}

        {/* Sidebar */}
        <aside
          id="teacher-sidebar"
          className={`fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] overflow-y-auto rounded-none border-r border-slate-200 bg-white p-3 shadow-2xl transition-transform duration-300 ease-in-out sm:p-4 lg:sticky lg:top-18 lg:h-[calc(100vh-5.5rem)] lg:z-auto lg:max-w-none lg:translate-x-0 lg:rounded-2xl lg:border lg:shadow-sm ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
            } ${isSidebarCollapsed ? 'lg:w-20' : 'lg:w-64'}`}
        >
          <div className="flex items-center justify-between lg:justify-start lg:gap-3 px-2 pb-3 sm:pb-4 border-b border-slate-100 mb-3">
            <div className="flex items-center gap-2">
              <span
                className={`text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 ${isSidebarCollapsed ? 'lg:hidden' : ''
                  }`}
              >
                Teacher Menu
              </span>
            </div>

            {/* Mobile close button */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(false)}
              aria-label="Close navigation menu"
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 lg:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <nav className="flex flex-col gap-1">
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
              const isActive = activeView === id
              return (
                <button
                  key={id}
                  onClick={() => handleNavSelect(id)}
                  aria-current={isActive ? 'page' : undefined}
                  title={label}
                  className={`group relative flex min-h-11 items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2.5 text-left text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 ${isSidebarCollapsed ? 'lg:justify-center lg:px-2 lg:py-3' : 'lg:justify-start'
                    } ${isActive
                      ? 'bg-rose-50 text-rose-700'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                >
                  <span
                    className={`absolute bottom-1.5 left-0 top-1.5 w-1 rounded-full transition ${isActive ? 'bg-rose-600' : 'bg-transparent'
                      }`}
                  />
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center self-center">
                    <Icon
                      className={`h-5 w-5 ${isActive ? 'text-rose-600' : 'text-slate-400 group-hover:text-slate-600'
                        }`}
                    />
                  </span>
                  <span
                    className={`flex items-center leading-none ${isSidebarCollapsed ? 'lg:hidden' : 'lg:block'
                      }`}
                  >
                    {label}
                  </span>
                </button>
              )
            })}
          </nav>

          {/* Quick Help Card at bottom of sidebar on desktop */}
          {!isSidebarCollapsed && (
            <div className="mt-8 hidden lg:block rounded-xl bg-slate-50 p-3.5 border border-slate-200/80">
              <div className="flex items-center gap-2 text-rose-600 mb-1">
                <Sparkles className="h-4 w-4 flex-shrink-0" />
                <span className="text-xs font-semibold">Teacher Tip</span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Submit attendance daily to keep parent portals updated in real time.
              </p>
            </div>
          )}
        </aside>

        {/* Content Section */}
        <section className="w-full flex-1 space-y-4 sm:space-y-6">
          {/* ========================================================= */}
          {/* 1. OVERVIEW VIEW                                          */}
          {/* ========================================================= */}
          {activeView === 'overview' && (
            <>
              {/* Hero Banner */}
              <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-900 to-rose-950 p-5 text-white shadow-sm sm:p-7">
                <svg
                  className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 text-white/10"
                  viewBox="0 0 200 200"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M10 100 C 50 40, 150 40, 190 100 C 150 160, 50 160, 10 100 Z"
                    stroke="currentColor"
                    strokeWidth="1"
                  />
                  <path
                    d="M30 100 C 60 60, 140 60, 170 100 C 140 140, 60 140, 30 100 Z"
                    stroke="currentColor"
                    strokeWidth="1"
                  />
                  <path
                    d="M50 100 C 70 80, 130 80, 150 100 C 130 120, 70 120, 50 100 Z"
                    stroke="currentColor"
                    strokeWidth="1"
                  />
                </svg>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-300">
                    {timeGreeting}
                  </p>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200 backdrop-blur-sm border border-white/10">
                    <Clock className="h-3.5 w-3.5 text-rose-300" />
                    {formattedDate}
                  </span>
                </div>

                <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                  {profile?.full_name ?? 'Teacher'}
                </h2>
                <p className="relative mt-2 max-w-2xl text-sm text-slate-300 sm:text-base leading-relaxed">
                  Welcome to your teaching hub. Manage attendance rolls, enter and review academic
                  grades, and access class student rosters seamlessly.
                </p>

                {isClassTeacher && (
                  <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-rose-500/20 border border-rose-400/30 px-3 py-1.5 text-xs text-rose-200">
                    <ShieldCheck className="h-4 w-4 text-rose-300" />
                    <span>
                      Designated Class Teacher for:{' '}
                      <strong className="text-white font-semibold">
                        {classTeacherClasses.map((c) => c.name).join(', ')}
                      </strong>
                    </span>
                  </div>
                )}
              </div>

              {/* Stats Overview Grid */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4 sm:gap-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500">Teaching Load</p>
                      <p className="text-xl font-bold text-slate-900 sm:text-2xl">
                        {isAssignmentsLoading || isAssignmentsError ? '—' : assignments.length}
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">Subject assignments</p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                      <GraduationCap className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500">Classes</p>
                      <p className="text-xl font-bold text-slate-900 sm:text-2xl">
                        {distinctClasses.length}
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">Distinct classes taught</p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                      <CalendarCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500">Homeroom</p>
                      <p className="text-xl font-bold text-slate-900 sm:text-2xl">
                        {isClassTeacher ? classTeacherClasses.length : 0}
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">
                    {isClassTeacher ? 'Assigned class teacher' : 'Subject teacher only'}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                      <BarChart3 className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500">Grading Portal</p>
                      <p className="text-xl font-bold text-slate-900 sm:text-2xl">Active</p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">Midterm & End of Term</p>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-3.5 sm:mb-4">
                  <h3 className="text-base font-semibold text-slate-900 sm:text-lg">Quick Actions</h3>
                  <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
                    Jump directly to your daily academic tools.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
                  <button
                    onClick={() => handleJumpToAttendance()}
                    className="group flex flex-col items-start justify-between rounded-xl border border-rose-100 bg-rose-50/50 p-3.5 text-left transition-all hover:border-rose-300 hover:bg-rose-50 hover:shadow-sm active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-100 text-rose-700 transition-transform group-hover:scale-105">
                      <CalendarCheck className="h-4 w-4 flex-shrink-0" />
                    </div>
                    <div className="mt-3">
                      <p className="text-xs font-semibold text-slate-900 sm:text-sm">Attendance</p>
                      <p className="text-[11px] text-slate-500">Mark daily roll</p>
                    </div>
                  </button>

                  <button
                    onClick={handleJumpToGrades}
                    className="group flex flex-col items-start justify-between rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 text-left transition-all hover:border-slate-300 hover:bg-white hover:shadow-sm active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 transition-transform group-hover:scale-105">
                      <BarChart3 className="h-4 w-4 flex-shrink-0" />
                    </div>
                    <div className="mt-3">
                      <p className="text-xs font-semibold text-slate-900 sm:text-sm">Grades</p>
                      <p className="text-[11px] text-slate-500">Enter scores</p>
                    </div>
                  </button>

                  <button
                    onClick={() => handleJumpToRoster()}
                    className="group flex flex-col items-start justify-between rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 text-left transition-all hover:border-slate-300 hover:bg-white hover:shadow-sm active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-700 transition-transform group-hover:scale-105">
                      <Users className="h-4 w-4 flex-shrink-0" />
                    </div>
                    <div className="mt-3">
                      <p className="text-xs font-semibold text-slate-900 sm:text-sm">Class Rosters</p>
                      <p className="text-[11px] text-slate-500">Student lists</p>
                    </div>
                  </button>

                  <button
                    onClick={() => handleNavSelect('settings')}
                    className="group flex flex-col items-start justify-between rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 text-left transition-all hover:border-slate-300 hover:bg-white hover:shadow-sm active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-200 text-slate-700 transition-transform group-hover:scale-105">
                      <SettingsIcon className="h-4 w-4 flex-shrink-0" />
                    </div>
                    <div className="mt-3">
                      <p className="text-xs font-semibold text-slate-900 sm:text-sm">Settings</p>
                      <p className="text-[11px] text-slate-500">Photo & password</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Class Teacher Section (if designated) */}
              {isClassTeacher && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-4 sm:p-5 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-600 text-white">
                        <ShieldCheck className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">
                          Class Teacher Dashboard
                        </h3>
                        <p className="text-xs text-slate-500">
                          You are the designated homeroom teacher for{' '}
                          {classTeacherClasses.map((c) => c.name).join(', ')}.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleJumpToAttendance(classTeacherClasses[0]?.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-rose-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                      >
                        <CalendarCheck className="h-3.5 w-3.5" />
                        Mark Attendance Now
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {classTeacherClasses.map((c) => (
                      <div
                        key={c.id}
                        className="rounded-xl border border-rose-100 bg-white p-3.5 flex items-center justify-between"
                      >
                        <div>
                          <p className="font-semibold text-sm text-slate-900">{c.name}</p>
                          <p className="text-xs text-slate-500">Homeroom Class</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleJumpToRoster(c.id)}
                            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                          >
                            Roster
                          </button>
                          <button
                            onClick={() => handleJumpToAttendance(c.id)}
                            className="rounded-lg bg-rose-50 border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
                          >
                            Roll Call
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* My Teaching Assignments */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900 sm:text-lg">
                      My Teaching Schedule & Subjects
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
                      Classes and subjects assigned to you by the administration.
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                    {isAssignmentsError
                      ? 'Unavailable'
                      : `${assignments.length} ${assignments.length === 1 ? 'Subject' : 'Subjects'}`}
                  </span>
                </div>

                {isAssignmentsLoading ? (
                  <div className="py-8 text-center text-sm text-slate-500">
                    Loading your teaching assignments...
                  </div>
                ) : isAssignmentsError ? (
                  <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-6 py-8 text-center">
                    <AlertTriangle className="h-8 w-8 text-rose-600" />
                    <div>
                      <p className="text-sm font-semibold text-rose-900">We couldn&apos;t load your teaching schedule.</p>
                      <p className="mt-1 text-xs text-rose-700">Your other dashboard tools are still available.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void refetchAssignments()}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Try again
                    </button>
                  </div>
                ) : assignments.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center">
                    <BookOpen className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-2 text-sm font-medium text-slate-700">No Assignments Yet</p>
                    <p className="mt-1 text-xs text-slate-400 max-w-sm mx-auto">
                      You haven't been assigned to any classes or subjects yet. Contact your school
                      administrator to set up your teaching schedule.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {assignments.map((a) => (
                      <div
                        key={a.id}
                        className="group relative flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition-all hover:border-slate-300 hover:shadow-sm"
                      >
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="inline-flex items-center rounded-md bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">
                              {a.class_name}
                            </span>
                            <span className="text-[11px] text-slate-400 font-medium">Active</span>
                          </div>
                          <h4 className="text-base font-bold text-slate-900 group-hover:text-rose-600 transition-colors">
                            {a.subject_name}
                          </h4>
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                          <button
                            onClick={() => handleJumpToRoster(a.class_id)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
                          >
                            <Users className="h-3.5 w-3.5 text-slate-400" />
                            Class Roster
                          </button>
                          <button
                            onClick={handleJumpToGrades}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-700"
                          >
                            Enter Grades
                            <ArrowRight className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ========================================================= */}
          {/* 2. ATTENDANCE VIEW                                        */}
          {/* ========================================================= */}
          {activeView === 'attendance' && classTeacherClasses.length > 0 && (
            <div className="space-y-4 sm:space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 sm:text-xl">
                      Attendance Management
                    </h2>
                    <p className="text-xs text-slate-500 sm:text-sm">
                      Take daily attendance or review historical attendance reports for your classes.
                    </p>
                  </div>

                  {classTeacherClasses.length > 1 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <label htmlFor="teacher-attendance-class" className="text-xs font-semibold text-slate-600">
                        Class:
                      </label>
                      <select
                        id="teacher-attendance-class"
                        value={attendanceClassId}
                        onChange={(e) => setAttendanceClassId(e.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-xs focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-400/20"
                      >
                        <option value="">Select class</option>
                        {classTeacherClasses.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Sub tabs: Mark vs Reports */}
                <div className="mt-4 flex gap-2 border-b border-slate-200">
                  <button
                    onClick={() => setAttendanceTab('mark')}
                    className={`pb-2.5 px-3 text-sm font-medium transition-colors relative ${attendanceTab === 'mark'
                      ? 'text-rose-600 font-semibold'
                      : 'text-slate-500 hover:text-slate-800'
                      }`}
                  >
                    Mark Attendance
                    {attendanceTab === 'mark' && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-rose-600 rounded-full" />
                    )}
                  </button>
                  <button
                    onClick={() => setAttendanceTab('reports')}
                    className={`pb-2.5 px-3 text-sm font-medium transition-colors relative ${attendanceTab === 'reports'
                      ? 'text-rose-600 font-semibold'
                      : 'text-slate-500 hover:text-slate-800'
                      }`}
                  >
                    Attendance Reports
                    {attendanceTab === 'reports' && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-rose-600 rounded-full" />
                    )}
                  </button>
                </div>

                {classTeacherClasses.length > 0 && (
                  <div className="mt-5">
                    {!selectedAttendanceClass || !profile ? null : attendanceTab === 'mark' ? (
                      <AttendanceMarkingGrid
                        schoolId={profile.school_id}
                        classId={selectedAttendanceClass.id}
                        className={selectedAttendanceClass.name}
                        markedBy={profile.id}
                      />
                    ) : (
                      <AttendanceReports
                        schoolName={profile.school_name}
                        logoUrl={profile.school_logo_url}
                        classId={selectedAttendanceClass.id}
                        className={selectedAttendanceClass.name}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* 3. GRADES VIEW                                            */}
          {/* ========================================================= */}
          {activeView === 'grades' && (
            <div className="space-y-4 sm:space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                <div className="border-b border-slate-100 pb-4 mb-4">
                  <h2 className="text-lg font-bold text-slate-900 sm:text-xl">
                    Academic Grades & Progress
                  </h2>
                  <p className="text-xs text-slate-500 sm:text-sm">
                    Enter test and exam scores, fill out student progress reports, and view grade sheets.
                  </p>

                </div>

                <TeacherGrades />
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* 4. CLASSES & STUDENTS ROSTER VIEW                         */}
          {/* ========================================================= */}
          {activeView === 'students' && (
            <div className="space-y-4 sm:space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 sm:text-xl">
                      My Classes & Student Rosters
                    </h2>
                    <p className="text-xs text-slate-500 sm:text-sm">
                      View enrolled students and guardian contact details for your classes.
                    </p>
                  </div>

                  {/* Class Switcher */}
                  <div className="flex items-center gap-2">
                    <label htmlFor="teacher-roster-class" className="text-xs font-semibold text-slate-600">
                      Select Class:
                    </label>
                    <select
                      id="teacher-roster-class"
                      value={rosterClassId}
                      onChange={(e) => {
                        setRosterClassId(e.target.value)
                        setRosterPage(0)
                      }}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-xs focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-400/20"
                    >
                      {distinctClasses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Search Bar & Count */}
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="relative w-full max-w-sm">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={rosterSearch}
                      onChange={(e) => {
                        setRosterSearch(e.target.value)
                        setRosterPage(0)
                      }}
                      placeholder="Search student name or admission #..."
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-800 placeholder-slate-400 transition focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-400/20"
                    />
                  </div>

                  <span className="text-xs text-slate-500 font-medium">
                    Showing <strong className="text-slate-800">{studentsList.length}</strong> of{' '}
                    <strong className="text-slate-800">{totalStudentsInClass}</strong> students in{' '}
                    <span className="text-rose-600 font-semibold">{selectedRosterClass?.name}</span>
                  </span>
                </div>

                {/* Table */}
                <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        <th className="py-3 px-4">Student</th>
                        <th className="py-3 px-4">Admission #</th>
                        <th className="py-3 px-4">Gender</th>
                        <th className="py-3 px-4">Parent / Guardian</th>
                        <th className="py-3 px-4">Contact Phone</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {isRosterLoading ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-sm text-slate-500">
                            Loading class roster...
                          </td>
                        </tr>
                      ) : studentsList.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-sm text-slate-500">
                            No students found in this class.
                          </td>
                        </tr>
                      ) : (
                        studentsList.map((s) => (
                          <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                {s.photo_url ? (
                                  <img
                                    src={s.photo_url}
                                    alt={s.full_name}
                                    className="h-8 w-8 rounded-full object-cover border border-slate-200"
                                  />
                                ) : (
                                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                                    {getInitials(s.full_name)}
                                  </div>
                                )}
                                <div>
                                  <p className="font-semibold text-slate-900">{s.full_name}</p>
                                  {s.health_notes && (
                                    <p className="text-[11px] text-amber-600 truncate max-w-xs">
                                      Note: {s.health_notes}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4 font-mono text-xs text-slate-600">
                              {s.admission_number}
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium capitalize ${s.gender === 'male'
                                  ? 'bg-blue-50 text-blue-700'
                                  : 'bg-rose-50 text-rose-700'
                                  }`}
                              >
                                {s.gender}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-medium text-slate-700">
                              {s.parent_name || '—'}
                            </td>
                            <td className="py-3 px-4">
                              {s.parent_phone ? (
                                <a
                                  href={`tel:${s.parent_phone}`}
                                  className="inline-flex items-center gap-1.5 text-slate-700 hover:text-rose-600 font-medium text-xs transition-colors"
                                >
                                  <Phone className="h-3 w-3 text-slate-400" />
                                  {s.parent_phone}
                                </a>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4">
                  <Pagination
                    page={rosterPage}
                    pageSize={PAGE_SIZE}
                    total={totalStudentsInClass}
                    onPageChange={setRosterPage}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* 5. REVIEWS VIEW                                           */}
          {/* ========================================================= */}
          {activeView === 'reviews' && (
            <TeacherReviewsView distinctClasses={distinctClasses} />
          )}

          {activeView === 'curriculum' && profile && (
            <TeacherCurriculumView assignments={assignments} teacherId={profile.id} schoolId={profile.school_id} />
          )}

          {/* ========================================================= */}
          {/* 6. SETTINGS VIEW                                          */}
          {/* ========================================================= */}
          {activeView === 'settings' && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                <h2 className="text-lg font-bold text-slate-900 sm:text-xl mb-1">
                  Account Settings
                </h2>
                <p className="text-xs text-slate-500 sm:text-sm mb-6">
                  Manage your teacher profile avatar and update your portal password.
                </p>

                <div className="space-y-6 max-w-2xl">
                  <ProfilePictureForm />
                  <ChangePasswordForm />
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="fixed bottom-3 left-1/2 z-50 w-[min(640px,96%)] -translate-x-1/2 rounded-2xl bg-white/95 backdrop-blur-md px-2 py-1.5 shadow-xl border border-slate-200/80 lg:hidden">
        <div className="flex items-center justify-around">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const isActive = activeView === id
            return (
              <button
                key={id}
                onClick={() => handleNavSelect(id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1 text-[11px] font-medium transition-colors ${isActive ? 'text-rose-600 font-semibold' : 'text-slate-500 hover:text-slate-800'
                  }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? 'text-rose-600' : 'text-slate-400'}`} />
                <span className="truncate max-w-[64px]">{label.split(' ')[0]}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
