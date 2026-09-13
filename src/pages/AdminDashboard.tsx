import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  CalendarCheck,
  ChevronDown,
  ClipboardList,
  LibraryBig,
  Clock,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings as SettingsIcon,
  UserCog,
  UserPlus,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { ParentAccounts } from '../pages/ParentAccounts'
import { StudentRegistrationForm } from '../components/StudentRegistrationForm'
import { StudentList } from '../components/StudentList'
import { Grades } from '../pages/Grades'
import { SettingsPage } from '../pages/Settings'
import { Staff } from '../pages/Staff'
import { Attendance } from '../pages/Attendance'
import { Fees } from '../pages/Fees'
import { Analytics } from '../pages/Analytics'
import { AdminReviewsView } from '../components/admin/AdminReviewsView'
import { CurriculumProgressView } from '../components/admin/CurriculumProgressView'
import { GlobalSearch } from '../components/GlobalSearch'
import { supabase } from '../lib/supabaseClient'
import logo from '../assets/logo.png'

interface DashboardStats {
  totalStudents: number
  maleStudents: number
  femaleStudents: number
  totalStaff: number
}

type View = 'overview' | 'register' | 'students' | 'parents' | 'grades' | 'staff' | 'attendance' | 'curriculum' | 'fees' | 'analytics' | 'reviews' | 'settings'

const NAV_ITEMS: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'register', label: 'New Registration', icon: UserPlus },
  { id: 'students', label: 'Student Records', icon: BookOpen },
  { id: 'parents', label: 'Parent Accounts', icon: Users },
  { id: 'grades', label: 'Grades', icon: BarChart3 },
  { id: 'staff', label: 'Staff', icon: UserCog },
  { id: 'attendance', label: 'Attendance', icon: CalendarCheck },
  { id: 'reviews', label: 'Weekly Reviews', icon: ClipboardList },
  { id: 'curriculum', label: 'Curriculum Progress', icon: LibraryBig },
  { id: 'fees', label: 'Fees', icon: Wallet },
  { id: 'analytics', label: 'Analytics', icon: Activity },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
]

// Views that live only in the drawer/sidebar on mobile. When one of these is
// active, the "More" tab in the bottom bar highlights so users can tell where
// they are.
const MOBILE_MORE_VIEWS: View[] = ['parents', 'staff', 'attendance', 'reviews', 'curriculum', 'fees', 'analytics', 'settings']

function getInitials(name?: string | null) {
  if (!name) return 'A'
  const parts = name.trim().split(/\s+/)
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '')
  return initials.join('') || 'A'
}

export function AdminDashboard() {
  const { profile, signOut } = useAuth()
  const [refreshKey, setRefreshKey] = useState(0)
  const [activeView, setActiveView] = useState<View>(() => {
    const saved = sessionStorage.getItem('adminDashboardView') as View | null
    return saved && NAV_ITEMS.some((item) => item.id === saved) ? saved : 'overview'
  })
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement>(null)
  const [stats, setStats] = useState<DashboardStats>({
    totalStudents: 0,
    maleStudents: 0,
    femaleStudents: 0,
    totalStaff: 0,
  })
  const [studentSearchSeed, setStudentSearchSeed] = useState('')
  const [parentSearchSeed, setParentSearchSeed] = useState('')
  const [staffSearchSeed, setStaffSearchSeed] = useState('')

  useEffect(() => {
    sessionStorage.setItem('adminDashboardView', activeView)
  }, [activeView])

  // Close the profile dropdown when clicking outside of it
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

  // Count-only queries: zero student rows ever cross the network for
  // this widget, just two numbers (head: true), fetched in parallel
  // rather than pulling every student's { id, gender } to count
  // client-side. Scales the same whether there are 20 students or
  // 20,000.
  useEffect(() => {
    async function loadStats() {
      const [totalResult, maleResult, staffResult] = await Promise.all([
        supabase.from('students').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase
          .from('students')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'active')
          .eq('gender', 'male'),
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
      ])

      const total = totalResult.count ?? 0
      const male = maleResult.count ?? 0
      const totalStaff = staffResult.count ?? 0

      setStats({
        totalStudents: total,
        maleStudents: male,
        femaleStudents: total - male,
        totalStaff,
      })
    }

    loadStats()
  }, [refreshKey])

  // Lock body scroll while the off-canvas menu is open on mobile
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

  // Close the mobile drawer automatically if the viewport grows into the
  // desktop breakpoint while it's open (e.g. rotating a tablet)
  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1024px)')
    const handleChange = (event: MediaQueryListEvent) => {
      if (event.matches) setIsMobileMenuOpen(false)
    }
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  const { malePct, femalePct } = useMemo(() => {
    const total = stats.totalStudents
    if (!total) return { malePct: 0, femalePct: 0 }
    return {
      malePct: Math.round((stats.maleStudents / total) * 100),
      femalePct: Math.round((stats.femaleStudents / total) * 100),
    }
  }, [stats])

  const initials = getInitials(profile?.full_name)
  const isMoreMenuActive = MOBILE_MORE_VIEWS.includes(activeView)

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

  function handleNavSelect(id: View) {
    setActiveView(id)
    setIsMobileMenuOpen(false)
  }

  function handleSelectStudent(name: string) {
    setStudentSearchSeed(name)
    setActiveView('students')
  }
  function handleSelectParent(name: string) {
    setParentSearchSeed(name)
    setActiveView('parents')
  }
  function handleSelectStaff(name: string) {
    setStaffSearchSeed(name)
    setActiveView('staff')
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Top bar */}
      <header className="border-b border-slate-800 bg-slate-900">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-3 sm:px-6 lg:px-8">
          {/* Left cluster: nav triggers + logo. min-w-0 lets the text truncate instead of wrapping. */}
          <div className="flex min-w-0 items-center gap-3">
            {/* Mobile: opens the off-canvas drawer */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={isMobileMenuOpen}
              aria-controls="admin-sidebar"
              className="flex h-10 w-10 flex-none items-center justify-center rounded-full border border-white/10 text-slate-200 transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Desktop: collapses the static sidebar to icon-only */}
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed((value) => !value)}
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
              <p className="truncate text-[11px] font-medium uppercase tracking-[0.2em] text-rose-400">
                Admin Portal
              </p>
            </div>
          </div>

          {/* NEW — hidden on the smallest screens, shown from sm up so it
              doesn't fight for space with the mobile menu button */}
          <div className="hidden flex-1 justify-center sm:flex">
            <GlobalSearch
              onSelectStudent={handleSelectStudent}
              onSelectParent={handleSelectParent}
              onSelectStaff={handleSelectStaff}
            />
          </div>

          {/* Right cluster stays on one line; below `sm` it collapses down to just the avatar */}
          <div className="flex flex-none items-center gap-2 sm:gap-3">
            {/* Full inline actions - shown when there's room */}
            <button
              type="button"
              aria-label="Notifications"
              className="hidden rounded-full p-2 text-slate-300 transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 sm:flex"
            >
              <Bell className="h-5 w-5" />
            </button>

            <div className="hidden h-6 w-px bg-white/10 sm:block" />

            <span className="hidden text-sm text-slate-200 md:inline">{profile?.full_name}</span>

            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.full_name}
                className="hidden h-9 w-9 rounded-full object-cover sm:flex"
              />
            ) : (
              <div
                aria-hidden="true"
                className="hidden h-9 w-9 items-center justify-center rounded-full bg-rose-600 text-sm font-semibold text-white sm:flex"
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

            {/* Collapsed state: avatar becomes the trigger for notifications + sign out */}
            <div className="relative sm:hidden" ref={profileMenuRef}>
              <button
                type="button"
                onClick={() => setIsProfileMenuOpen((value) => !value)}
                aria-label="Open account menu"
                aria-expanded={isProfileMenuOpen}
                className="flex items-center gap-1 rounded-full p-1 transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
              >
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile.full_name}
                    className="h-9 w-9 rounded-full object-cover"
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
                    <p className="truncate text-sm font-medium text-slate-900">
                      {profile?.full_name ?? 'Admin'}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {profile?.school_name ?? 'School Portal'}
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
                    Settings
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsProfileMenuOpen(false)}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                  >
                    <Bell className="h-4 w-4 text-slate-400" />
                    Notifications
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

      <main className="mx-auto flex max-w-7xl flex-col items-start gap-4 px-3 py-4 pb-20 sm:gap-6 sm:px-4 lg:flex-row lg:px-8">
        {/* Backdrop, mobile only */}
        {isMobileMenuOpen && (
          <div
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
            className="fixed inset-0 z-30 bg-slate-900/50 backdrop-blur-sm lg:hidden"
          />
        )}

        {/* Sidebar: fixed off-canvas drawer on mobile, static sticky + collapsible on desktop */}
        <aside
          id="admin-sidebar"
          className={`fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] overflow-y-auto rounded-none border-r border-slate-200 bg-white p-3 shadow-2xl transition-transform duration-300 ease-in-out sm:p-4 lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:z-auto lg:max-w-none lg:translate-x-0 lg:rounded-2xl lg:border lg:shadow-sm ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
            } ${isSidebarCollapsed ? 'lg:w-24' : 'lg:w-72'}`}
        >
          <div className="flex items-center justify-between lg:justify-start lg:gap-3 px-2 pb-3 sm:pb-4">
            <div className="flex items-center gap-3">
              <p
                className={`text-xs font-semibold uppercase tracking-[0.15em] text-slate-400 ${isSidebarCollapsed ? 'lg:hidden' : ''
                  }`}
              >
                Menu
              </p>
              <span
                className={`text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 ${isSidebarCollapsed ? 'lg:hidden' : ''
                  }`}
              >
                Quick links
              </span>
            </div>

            {/* Close button, mobile only */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(false)}
              aria-label="Close navigation menu"
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 lg:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Global search lives in the drawer on phones (the header version is
              hidden below `sm`), so jumping to any record is one tap away from
              every mobile view instead of impossible. */}
          <div className="mb-2 px-1 lg:hidden">
            <GlobalSearch
              theme="light"
              onSelectStudent={handleSelectStudent}
              onSelectParent={handleSelectParent}
              onSelectStaff={handleSelectStaff}
            />
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
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center self-center">
                    <Icon
                      className={`h-4 w-4 ${isActive ? 'text-rose-600' : 'text-slate-400 group-hover:text-slate-500'}`}
                    />
                  </span>
                  <span
                    className={`flex items-center leading-none ${isSidebarCollapsed ? 'lg:hidden' : 'lg:block'}`}
                  >
                    {label}
                  </span>
                </button>
              )
            })}
          </nav>
        </aside>

        <section className="w-full flex-1 space-y-4 sm:space-y-6">
          {activeView === 'overview' && (
            <>
              {/* Hero */}
              <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-900 to-rose-900 p-4 text-white shadow-sm sm:p-6">
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
                <h2 className="mt-2 text-xl font-semibold sm:text-2xl">{profile?.full_name ?? 'Admin'}</h2>
                <p className="relative mt-2 max-w-xl text-sm text-slate-300 sm:text-base">
                  Manage registrations, review student records, and keep your school data up to
                  date in one place.
                </p>
              </div>

              {/* Mobile: compact enrollment card (single column) */}
              <div className="sm:hidden">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500">Enrollment</p>
                      <p className="mt-1 text-3xl font-semibold text-slate-900">{stats.totalStudents}</p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 flex-none rounded-md bg-rose-50 text-rose-600 flex items-center justify-center">
                            <Users className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Male</p>
                          </div>
                        </div>
                        <p className="text-sm font-semibold text-slate-900">{stats.maleStudents}</p>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 flex-none rounded-md bg-slate-100 text-slate-600 flex items-center justify-center">
                            <Users className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Female</p>
                          </div>
                        </div>
                        <p className="text-sm font-semibold text-slate-900">{stats.femaleStudents}</p>
                      </div>
                    </div>
                  </div>

                  {stats.totalStudents > 0 && (
                    <div className="mt-4">
                      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full bg-rose-500"
                          style={{ width: `${malePct}%` }}
                          aria-hidden="true"
                        />
                        <div
                          className="h-full bg-slate-400"
                          style={{ width: `${femalePct}%` }}
                          aria-hidden="true"
                        />
                      </div>
                      <p className="mt-2 text-xs text-slate-400">{malePct}% male · {femalePct}% female</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Desktop / tablet: four separate stat cards */}
              <div className="hidden sm:grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                      <Users className="h-5 w-5" />
                    </div>
                    <p className="text-sm text-slate-500">Total Students</p>
                  </div>
                  <p className="mt-3 text-3xl font-semibold text-slate-900">
                    {stats.totalStudents}
                  </p>

                  {stats.totalStudents > 0 && (
                    <div className="mt-4">
                      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full bg-rose-500"
                          style={{ width: `${malePct}%` }}
                          aria-hidden="true"
                        />
                        <div
                          className="h-full bg-slate-400"
                          style={{ width: `${femalePct}%` }}
                          aria-hidden="true"
                        />
                      </div>
                      <p className="mt-2 text-xs text-slate-400">
                        {malePct}% male · {femalePct}% female
                      </p>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                      <Users className="h-5 w-5" />
                    </div>
                    <p className="text-sm text-slate-500">Male Students</p>
                  </div>
                  <p className="mt-3 text-3xl font-semibold text-slate-900">
                    {stats.maleStudents}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {stats.totalStudents > 0 ? `${malePct}% of enrollment` : 'No students yet'}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                      <Users className="h-5 w-5" />
                    </div>
                    <p className="text-sm text-slate-500">Female Students</p>
                  </div>
                  <p className="mt-3 text-3xl font-semibold text-slate-900">
                    {stats.femaleStudents}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {stats.totalStudents > 0 ? `${femalePct}% of enrollment` : 'No students yet'}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                      <UserCog className="h-5 w-5" />
                    </div>
                    <p className="text-sm text-slate-500">Total Staff</p>
                  </div>
                  <p className="mt-3 text-3xl font-semibold text-slate-900">
                    {stats.totalStaff}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Active staff accounts
                  </p>
                </div>
              </div>

              {/* Quick actions */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-3.5 sm:mb-4">
                  <h3 className="text-base font-semibold text-slate-900 sm:text-lg">Quick actions</h3>
                  <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
                    Jump directly into daily school workflows.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6 sm:gap-3">
                  {/* 1. Register Student */}
                  <button
                    onClick={() => setActiveView('register')}
                    className="group flex flex-col items-start justify-between rounded-xl border border-rose-100 bg-rose-50/60 p-3.5 text-left transition-all hover:border-rose-200 hover:bg-rose-50 hover:shadow-sm active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-100 text-rose-700 transition-transform group-hover:scale-105">
                      <UserPlus className="h-4 w-4 flex-shrink-0" />
                    </div>
                    <div className="mt-3">
                      <p className="text-xs font-semibold text-slate-900 sm:text-sm">Register</p>
                      <p className="text-[11px] text-slate-500">New student</p>
                    </div>
                  </button>

                  {/* 2. Student Records */}
                  <button
                    onClick={() => setActiveView('students')}
                    className="group flex flex-col items-start justify-between rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 text-left transition-all hover:border-slate-300 hover:bg-white hover:shadow-sm active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-700 transition-transform group-hover:scale-105">
                      <BookOpen className="h-4 w-4 flex-shrink-0" />
                    </div>
                    <div className="mt-3">
                      <p className="text-xs font-semibold text-slate-900 sm:text-sm">Records</p>
                      <p className="text-[11px] text-slate-500">All students</p>
                    </div>
                  </button>

                  {/* 3. Parent Accounts */}
                  <button
                    onClick={() => setActiveView('parents')}
                    className="group flex flex-col items-start justify-between rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 text-left transition-all hover:border-slate-300 hover:bg-white hover:shadow-sm active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700 transition-transform group-hover:scale-105">
                      <Users className="h-4 w-4 flex-shrink-0" />
                    </div>
                    <div className="mt-3">
                      <p className="text-xs font-semibold text-slate-900 sm:text-sm">Parents</p>
                      <p className="text-[11px] text-slate-500">Accounts</p>
                    </div>
                  </button>

                  {/* 4. Grades */}
                  <button
                    onClick={() => setActiveView('grades')}
                    className="group flex flex-col items-start justify-between rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 text-left transition-all hover:border-slate-300 hover:bg-white hover:shadow-sm active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 transition-transform group-hover:scale-105">
                      <BarChart3 className="h-4 w-4 flex-shrink-0" />
                    </div>
                    <div className="mt-3">
                      <p className="text-xs font-semibold text-slate-900 sm:text-sm">Grades</p>
                      <p className="text-[11px] text-slate-500">Reports</p>
                    </div>
                  </button>

                  {/* 5. Staff */}
                  <button
                    onClick={() => setActiveView('staff')}
                    className="group flex flex-col items-start justify-between rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 text-left transition-all hover:border-slate-300 hover:bg-white hover:shadow-sm active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-100 text-purple-700 transition-transform group-hover:scale-105">
                      <UserCog className="h-4 w-4 flex-shrink-0" />
                    </div>
                    <div className="mt-3">
                      <p className="text-xs font-semibold text-slate-900 sm:text-sm">Staff</p>
                      <p className="text-[11px] text-slate-500">Directory</p>
                    </div>
                  </button>

                  {/* 6. Attendance */}
                  <button
                    onClick={() => setActiveView('attendance')}
                    className="group flex flex-col items-start justify-between rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 text-left transition-all hover:border-slate-300 hover:bg-white hover:shadow-sm active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-100 text-sky-700 transition-transform group-hover:scale-105">
                      <CalendarCheck className="h-4 w-4 flex-shrink-0" />
                    </div>
                    <div className="mt-3">
                      <p className="text-xs font-semibold text-slate-900 sm:text-sm">Attendance</p>
                      <p className="text-[11px] text-slate-500">Daily records</p>
                    </div>
                  </button>

                  {/* 7. Manage Fees */}
                  <button
                    onClick={() => setActiveView('fees')}
                    className="group flex flex-col items-start justify-between rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 text-left transition-all hover:border-slate-300 hover:bg-white hover:shadow-sm active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-100 text-teal-700 transition-transform group-hover:scale-105">
                      <Wallet className="h-4 w-4 flex-shrink-0" />
                    </div>
                    <div className="mt-3">
                      <p className="text-xs font-semibold text-slate-900 sm:text-sm">Manage fees</p>
                      <p className="text-[11px] text-slate-500">Payment setup</p>
                    </div>
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Mobile bottom tab bar — 4 primary views + "More" so every one of
              the 12 admin views is reachable from the thumb zone. "More" opens
              the drawer, which now also contains global search. */}
          <nav className="fixed bottom-3 left-1/2 z-50 flex w-[min(640px,96%)] -translate-x-1/2 items-center justify-between rounded-2xl border border-slate-200/80 bg-white/95 px-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] pt-1.5 shadow-xl backdrop-blur-md lg:hidden">
            {(
              [
                { id: 'overview', label: 'Home', icon: LayoutDashboard },
                { id: 'register', label: 'Register', icon: UserPlus },
                { id: 'students', label: 'Students', icon: BookOpen },
                { id: 'grades', label: 'Grades', icon: BarChart3 },
              ] as const
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => handleNavSelect(id)}
                aria-current={activeView === id ? 'page' : undefined}
                className={`flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[11px] font-medium transition active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 ${
                  activeView === id ? 'text-rose-600' : 'text-slate-600'
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              aria-haspopup="menu"
              aria-label="More menu options"
              aria-current={isMoreMenuActive ? 'page' : undefined}
              className={`flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[11px] font-medium transition active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 ${
                isMoreMenuActive ? 'text-rose-600' : 'text-slate-600'
              }`}
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
              <span>More</span>
            </button>
          </nav>

          {activeView === 'register' && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <StudentRegistrationForm onRegistered={() => setRefreshKey((k) => k + 1)} />
            </div>
          )}

          {activeView === 'students' && <StudentList initialSearch={studentSearchSeed} />}

          {activeView === 'parents' && <ParentAccounts initialSearch={parentSearchSeed} />}

          {activeView === 'grades' && <Grades />}

          {activeView === 'staff' && <Staff initialSearch={staffSearchSeed} />}

          {activeView === 'attendance' && <Attendance />}

          {activeView === 'reviews' && <AdminReviewsView />}

          {activeView === 'curriculum' && <CurriculumProgressView />}

          {activeView === 'fees' && <Fees />}

          {activeView === 'analytics' && <Analytics />}

          {activeView === 'settings' && <SettingsPage />}
        </section>
      </main>
    </div>
  )
}
