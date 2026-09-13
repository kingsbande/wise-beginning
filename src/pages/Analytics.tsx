import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Award,
  BarChart3,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Coins,
  Download,
  Filter,
  Info,
  Medal,
  RefreshCw,
  Sparkles,
  Target,
  Trophy,
  Users,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { fetchAdminAnalyticsKpis, fetchAdminAttendanceTrend } from '../lib/analyticsApi'
import { fetchAdminAcademicAnalytics } from '../lib/academicAnalyticsApi'
import { fetchTerms } from '../lib/gradesApi'
import { downloadCsv } from '../lib/csv'

function formatAmount(value: number): string {
  return `MWK ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)}`
}

function formatDateInput(date: Date): string {
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 10)
}

// Grade band color mapping for simple visual interpretation
const GRADE_BAND_COLORS: Record<string, { bar: string; text: string; bg: string }> = {
  '80-100': { bar: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  '70-79': { bar: 'bg-blue-500', text: 'text-blue-700', bg: 'bg-blue-50' },
  '60-69': { bar: 'bg-indigo-500', text: 'text-indigo-700', bg: 'bg-indigo-50' },
  '50-59': { bar: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50' },
  '0-49': { bar: 'bg-rose-500', text: 'text-rose-700', bg: 'bg-rose-50' },
}

export function Analytics() {
  const { profile } = useAuth()
  const [selectedTermId, setSelectedTermId] = useState('')
  const [activeSection, setActiveSection] = useState<'today' | 'fees' | 'academic' | 'trends'>('today')
  const [selectedClassDrill, setSelectedClassDrill] = useState<string | null>(null)
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('all')

  // Class & Subject Drill-Down Filter States
  const [selectedDrillClassId, setSelectedDrillClassId] = useState<string>('all')
  const [selectedDrillSubjectId, setSelectedDrillSubjectId] = useState<string>('all')

  const [dateTo, setDateTo] = useState(() => formatDateInput(new Date()))
  const [dateFrom, setDateFrom] = useState(() => {
    const date = new Date()
    date.setDate(date.getDate() - 6)
    return formatDateInput(date)
  })

  // Queries
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin-analytics-kpis', profile?.school_id],
    queryFn: () => fetchAdminAnalyticsKpis(profile!.school_id),
    enabled: !!profile?.school_id,
  })

  const { data: terms = [], isLoading: isTermsLoading } = useQuery({
    queryKey: ['analytics-terms', profile?.school_id],
    queryFn: fetchTerms,
    enabled: !!profile?.school_id,
  })

  const { data: academicData, isLoading: isAcademicLoading, isError: isAcademicError } = useQuery({
    queryKey: ['admin-academic-analytics', profile?.school_id, selectedTermId],
    queryFn: () => fetchAdminAcademicAnalytics(profile!.school_id, selectedTermId),
    enabled: !!profile?.school_id && selectedTermId !== '',
  })

  const { data: attendanceTrend, isLoading: isAttendanceTrendLoading, isError: isAttendanceTrendError } = useQuery({
    queryKey: ['admin-attendance-trend', profile?.school_id, dateFrom, dateTo],
    queryFn: () => fetchAdminAttendanceTrend(profile!.school_id, dateFrom, dateTo),
    enabled: !!profile?.school_id && dateFrom !== '' && dateTo !== '' && dateFrom <= dateTo,
  })

  useEffect(() => {
    if (selectedTermId === '' && terms.length > 0) setSelectedTermId(terms[0].id)
  }, [selectedTermId, terms])

  const kpis = data ?? {
    activeStudents: 0,
    markedToday: 0,
    presentToday: 0,
    absentToday: 0,
    lateToday: 0,
    otherToday: 0,
    totalDue: 0,
    totalCollected: 0,
  }

  // Calculated metrics
  const attendanceCoverage = kpis.activeStudents
    ? Math.round((kpis.markedToday / kpis.activeStudents) * 100)
    : 0
  const presentPct = kpis.markedToday ? Math.round((kpis.presentToday / kpis.markedToday) * 100) : 0
  const absentPct = kpis.markedToday ? Math.round((kpis.absentToday / kpis.markedToday) * 100) : 0
  const latePct = kpis.markedToday ? Math.round(((kpis.lateToday + kpis.otherToday) / kpis.markedToday) * 100) : 0
  const unmarkedStudents = Math.max(kpis.activeStudents - kpis.markedToday, 0)
  const outstandingBalance = Math.max(kpis.totalDue - kpis.totalCollected, 0)
  const collectionRate = kpis.totalDue
    ? Math.min(Math.round((kpis.totalCollected / kpis.totalDue) * 100), 100)
    : 0

  // Filtered Top & Lowest Performing Students based on selectedClassFilter
  const filteredStudents = useMemo(() => {
    if (!academicData?.allStudentPerformances) return { top: [], lowest: [] }
    const pool = selectedClassFilter === 'all'
      ? academicData.allStudentPerformances
      : academicData.allStudentPerformances.filter((s) => s.classId === selectedClassFilter)

    const top = pool.slice(0, 5)
    const lowest = [...pool]
      .filter((s) => s.gradedCount > 0)
      .sort((a, b) => a.averageScore - b.averageScore)
      .slice(0, 5)

    return { top, lowest }
  }, [academicData, selectedClassFilter])

  // Filtered Individual Subject Grades for Class + Subject Drill-Down (Ranked Highest to Lowest)
  const filteredSubjectGrades = useMemo(() => {
    if (!academicData?.allSubjectGrades) return []
    return academicData.allSubjectGrades.filter((g) => {
      const matchClass = selectedDrillClassId === 'all' || g.classId === selectedDrillClassId
      const matchSubject = selectedDrillSubjectId === 'all' || g.subjectId === selectedDrillSubjectId
      return matchClass && matchSubject
    })
  }, [academicData, selectedDrillClassId, selectedDrillSubjectId])

  // Drill-Down Summary Statistics
  const subjectDrillStats = useMemo(() => {
    if (filteredSubjectGrades.length === 0) {
      return { avg: 0, highest: null, lowest: null, count: 0 }
    }
    const scores = filteredSubjectGrades.map((g) => g.score)
    const sum = scores.reduce((a, b) => a + b, 0)
    const avg = Math.round((sum / scores.length) * 10) / 10
    const highest = filteredSubjectGrades[0] // Sorted descending!
    const lowest = filteredSubjectGrades[filteredSubjectGrades.length - 1]
    return { avg, highest, lowest, count: filteredSubjectGrades.length }
  }, [filteredSubjectGrades])

  // Date range presets helper
  const applyDatePreset = (preset: 'today' | 'week' | '30days' | 'month') => {
    const today = new Date()
    const toStr = formatDateInput(today)
    setDateTo(toStr)

    const from = new Date()
    if (preset === 'today') {
      setDateFrom(toStr)
    } else if (preset === 'week') {
      from.setDate(today.getDate() - 6)
      setDateFrom(formatDateInput(from))
    } else if (preset === '30days') {
      from.setDate(today.getDate() - 29)
      setDateFrom(formatDateInput(from))
    } else if (preset === 'month') {
      from.setDate(1)
      setDateFrom(formatDateInput(from))
    }
  }

  // Smart Plain-English Executive Alerts
  const alerts = useMemo(() => {
    const list: { id: string; type: 'warning' | 'info' | 'success'; message: string; subtext: string }[] = []

    // Attendance coverage alert
    if (attendanceCoverage < 50) {
      list.push({
        id: 'cov-low',
        type: 'warning',
        message: `Low attendance reporting today (${attendanceCoverage}% coverage)`,
        subtext: `${unmarkedStudents} students have not had attendance taken yet today.`,
      })
    } else if (attendanceCoverage >= 90) {
      list.push({
        id: 'cov-high',
        type: 'success',
        message: `Excellent attendance tracking (${attendanceCoverage}% marked today)`,
        subtext: `Almost all class rolls have been submitted for today.`,
      })
    }

    // Absences alert
    if (kpis.absentToday > 0) {
      list.push({
        id: 'absent-alert',
        type: kpis.absentToday > 10 ? 'warning' : 'info',
        message: `${kpis.absentToday} student${kpis.absentToday > 1 ? 's' : ''} absent today`,
        subtext: `${presentPct}% of marked students are in attendance.`,
      })
    }

    // Fee collection alert
    if (collectionRate < 50 && kpis.totalDue > 0) {
      list.push({
        id: 'fees-low',
        type: 'warning',
        message: `Fee collection is below target (${collectionRate}% collected)`,
        subtext: `Outstanding balance stands at ${formatAmount(outstandingBalance)}.`,
      })
    } else if (collectionRate >= 80) {
      list.push({
        id: 'fees-good',
        type: 'success',
        message: `Strong fee collection rate (${collectionRate}%)`,
        subtext: `${formatAmount(kpis.totalCollected)} collected out of ${formatAmount(kpis.totalDue)} total due.`,
      })
    }

    return list
  }, [attendanceCoverage, unmarkedStudents, kpis, presentPct, collectionRate, outstandingBalance])

  // CSV Export of Analytics Summary
  const handleExportSummary = () => {
    const selectedTerm = terms.find((t) => t.id === selectedTermId)?.name ?? 'Current Term'
    const headers = ['Metric Category', 'Indicator', 'Value / Summary', 'Details']
    const rows = [
      ['Enrollment', 'Active Students Enrolled', kpis.activeStudents, 'Total active roll'],
      ['Attendance Today', 'Marked Today', kpis.markedToday, `${attendanceCoverage}% coverage`],
      ['Attendance Today', 'Present Today', kpis.presentToday, `${presentPct}% of marked`],
      ['Attendance Today', 'Absent Today', kpis.absentToday, `${absentPct}% of marked`],
      ['Attendance Today', 'Late / Other Today', kpis.lateToday + kpis.otherToday, `${latePct}% of marked`],
      ['Attendance Today', 'Unmarked Students', unmarkedStudents, 'Roll not submitted yet'],
      ['Financials', 'Total Fees Billed', formatAmount(kpis.totalDue), 'School total'],
      ['Financials', 'Total Collected', formatAmount(kpis.totalCollected), `${collectionRate}% collection rate`],
      ['Financials', 'Outstanding Balance', formatAmount(outstandingBalance), 'Pending collection'],
      ['Academics', 'Selected Term', selectedTerm, 'Academic cycle'],
      ['Academics', 'School Mean Average', `${academicData?.averageScore ?? 0}%`, 'Across all graded subjects'],
      ['Academics', 'Total Grade Records', academicData?.gradedCount ?? 0, 'Entries recorded'],
    ]
    downloadCsv(`School_Analytics_Summary_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows)
  }

  const scrollToSection = (id: 'today' | 'fees' | 'academic' | 'trends') => {
    setActiveSection(id)
    const el = document.getElementById(`section-${id}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="space-y-6">
      {/* Header & Quick Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-rose-700">
              <Sparkles className="h-3.5 w-3.5" /> Intelligence Center
            </span>
            <span className="text-xs text-slate-400">• Live School Insights</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">School Analytics & Health</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Clear, easy-to-understand breakdown of attendance, fees, and student performance.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportSummary}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
          >
            <Download className="h-4 w-4 text-slate-500" />
            Export Report
          </button>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-sm font-medium text-rose-700 shadow-sm transition hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-500/20 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            {isFetching ? 'Refreshing...' : 'Refresh Data'}
          </button>
        </div>
      </div>

      {/* Sticky Quick-Jump Section Navigation */}
      <div className="sticky top-2 z-20 flex overflow-x-auto rounded-xl border border-slate-200 bg-white/95 p-1.5 shadow-md backdrop-blur-md">
        <button
          onClick={() => scrollToSection('today')}
          className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-xs font-semibold transition ${
            activeSection === 'today'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Activity className="h-4 w-4" /> Today&apos;s Attendance Pulse
        </button>
        <button
          onClick={() => scrollToSection('fees')}
          className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-xs font-semibold transition ${
            activeSection === 'fees'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Coins className="h-4 w-4" /> Fee Collection Health
        </button>
        <button
          onClick={() => scrollToSection('academic')}
          className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-xs font-semibold transition ${
            activeSection === 'academic'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <BarChart3 className="h-4 w-4" /> Academic Overview & Ranks
        </button>
        <button
          onClick={() => scrollToSection('trends')}
          className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-xs font-semibold transition ${
            activeSection === 'trends'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <CalendarDays className="h-4 w-4" /> Attendance Trends & Class Ranks
        </button>
      </div>

      {/* Main Error Banner if Query Fails */}
      {isError && (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 shadow-sm">
          <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600" />
          <div className="flex-1">
            <p className="font-semibold">Unable to load primary school analytics</p>
            <p className="text-xs text-rose-600">Please check your internet connection or try refreshing.</p>
          </div>
          <button
            onClick={() => refetch()}
            className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700"
          >
            Retry
          </button>
        </div>
      )}

      {/* Executive Summary & Smart Alerts Card */}
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-800 to-rose-950 p-5 text-white shadow-md sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/20 text-rose-300 backdrop-blur-sm">
              <Info className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">At-a-Glance Executive Summary</h2>
              <p className="text-xs text-slate-300">Simplified status for quick admin decision making</p>
            </div>
          </div>
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-slate-200 backdrop-blur-sm">
            {new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
          </span>
        </div>

        {/* Dynamic Summary Sentence */}
        <p className="mt-4 text-sm font-medium leading-relaxed text-slate-200 sm:text-base">
          {isLoading ? (
            <span className="inline-block h-5 w-64 animate-pulse rounded bg-white/10" />
          ) : (
            <>
              Currently, <strong className="text-white">{kpis.activeStudents} active students</strong> are registered.{' '}
              Today&apos;s roll has <strong className="text-emerald-400">{attendanceCoverage}% coverage</strong> with{' '}
              <strong className="text-white">{kpis.presentToday} present</strong> and{' '}
              <strong className="text-amber-400">{kpis.absentToday} absent</strong>. Total fee collection stands at{' '}
              <strong className="text-rose-300">{collectionRate}%</strong> ({formatAmount(kpis.totalCollected)} collected of {formatAmount(kpis.totalDue)} billed).
            </>
          )}
        </p>

        {/* Smart Alerts Grid */}
        {alerts.length > 0 && (
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {alerts.map((item) => (
              <div
                key={item.id}
                className={`flex items-start gap-2.5 rounded-xl border p-3 text-xs backdrop-blur-md transition ${
                  item.type === 'warning'
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                    : item.type === 'success'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                    : 'border-blue-500/30 bg-blue-500/10 text-blue-200'
                }`}
              >
                {item.type === 'warning' ? (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                ) : item.type === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                ) : (
                  <Info className="h-4 w-4 shrink-0 text-blue-400 mt-0.5" />
                )}
                <div>
                  <p className="font-semibold text-white">{item.message}</p>
                  <p className="mt-0.5 opacity-80">{item.subtext}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 1: TODAY'S ATTENDANCE PULSE */}
      <div id="section-today" className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Today&apos;s Attendance Pulse</h2>
        </div>

        {/* KPI Cards with Dynamic Health Signal Colors */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Active Students */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Active Students</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                <Users className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-3 text-3xl font-extrabold text-slate-900">
              {isLoading ? <span className="inline-block h-8 w-16 animate-pulse rounded bg-slate-200" /> : kpis.activeStudents}
            </p>
            <p className="mt-1 text-xs text-slate-500">Total active enrolled roll</p>
          </div>

          {/* Marked Today */}
          <div
            className={`rounded-2xl border p-5 shadow-sm transition hover:shadow-md ${
              attendanceCoverage >= 85
                ? 'border-emerald-200 bg-emerald-50/30'
                : attendanceCoverage >= 50
                ? 'border-amber-200 bg-amber-50/30'
                : 'border-rose-200 bg-rose-50/30'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">Roll Marked Today</span>
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                  attendanceCoverage >= 85
                    ? 'bg-emerald-100 text-emerald-700'
                    : attendanceCoverage >= 50
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-rose-100 text-rose-700'
                }`}
              >
                <Activity className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <p className="text-3xl font-extrabold text-slate-900">
                {isLoading ? <span className="inline-block h-8 w-16 animate-pulse rounded bg-slate-200" /> : kpis.markedToday}
              </p>
              <span className="text-xs font-bold text-slate-600">({attendanceCoverage}% roll)</span>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              {unmarkedStudents > 0 ? `${unmarkedStudents} students remaining unmarked` : '100% attendance recorded'}
            </p>
          </div>

          {/* Present Today */}
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/20 p-5 shadow-sm transition hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-800">Present Today</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <p className="text-3xl font-extrabold text-emerald-900">
                {isLoading ? <span className="inline-block h-8 w-16 animate-pulse rounded bg-slate-200" /> : kpis.presentToday}
              </p>
              {kpis.markedToday > 0 && <span className="text-xs font-bold text-emerald-700">({presentPct}%)</span>}
            </div>
            <p className="mt-1 text-xs text-emerald-700">Marked in class & ready</p>
          </div>

          {/* Absent Today */}
          <div
            className={`rounded-2xl border p-5 shadow-sm transition hover:shadow-md ${
              kpis.absentToday > 5
                ? 'border-rose-300 bg-rose-50/50'
                : kpis.absentToday > 0
                ? 'border-amber-200 bg-amber-50/30'
                : 'border-slate-200 bg-white'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">Absent Today</span>
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                  kpis.absentToday > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                }`}
              >
                <AlertTriangle className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <p className={`text-3xl font-extrabold ${kpis.absentToday > 0 ? 'text-amber-900' : 'text-slate-900'}`}>
                {isLoading ? <span className="inline-block h-8 w-16 animate-pulse rounded bg-slate-200" /> : kpis.absentToday}
              </p>
              {kpis.markedToday > 0 && <span className="text-xs font-bold text-amber-700">({absentPct}%)</span>}
            </div>
            <p className="mt-1 text-xs text-slate-600">
              {kpis.absentToday > 0 ? 'Action: follow up with parents' : 'No absences reported today'}
            </p>
          </div>
        </div>

        {/* Stacked Segmented Progress Bar Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-slate-900">Today&apos;s Attendance Breakdown & Coverage</h3>
              <p className="text-xs text-slate-500">
                Segmented visual representation of today&apos;s student attendance roll status
              </p>
            </div>
            <span className="text-sm font-bold text-rose-600">{attendanceCoverage}% Marked Total</span>
          </div>

          {/* Segmented Bar */}
          <div className="mt-4 h-4 overflow-hidden rounded-full bg-slate-100 flex">
            <div
              style={{ width: `${(kpis.presentToday / (kpis.activeStudents || 1)) * 100}%` }}
              className="h-full bg-emerald-500 transition-all duration-500"
              title={`Present: ${kpis.presentToday}`}
            />
            <div
              style={{ width: `${(kpis.absentToday / (kpis.activeStudents || 1)) * 100}%` }}
              className="h-full bg-rose-500 transition-all duration-500"
              title={`Absent: ${kpis.absentToday}`}
            />
            <div
              style={{ width: `${((kpis.lateToday + kpis.otherToday) / (kpis.activeStudents || 1)) * 100}%` }}
              className="h-full bg-amber-400 transition-all duration-500"
              title={`Late/Other: ${kpis.lateToday + kpis.otherToday}`}
            />
            <div
              style={{ width: `${(unmarkedStudents / (kpis.activeStudents || 1)) * 100}%` }}
              className="h-full bg-slate-200 transition-all duration-500"
              title={`Unmarked: ${unmarkedStudents}`}
            />
          </div>

          {/* Legend Badges */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-2.5">
              <span className="h-3 w-3 rounded-full bg-emerald-500" />
              <div>
                <p className="text-xs font-bold text-emerald-900">{kpis.presentToday} Present</p>
                <p className="text-[11px] text-emerald-700">{presentPct}% of marked</p>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-2.5">
              <span className="h-3 w-3 rounded-full bg-rose-500" />
              <div>
                <p className="text-xs font-bold text-rose-900">{kpis.absentToday} Absent</p>
                <p className="text-[11px] text-rose-700">{absentPct}% of marked</p>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-xl bg-amber-50 p-2.5">
              <span className="h-3 w-3 rounded-full bg-amber-400" />
              <div>
                <p className="text-xs font-bold text-amber-900">{kpis.lateToday + kpis.otherToday} Late / Other</p>
                <p className="text-[11px] text-amber-700">{latePct}% of marked</p>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-xl bg-slate-100 p-2.5">
              <span className="h-3 w-3 rounded-full bg-slate-300" />
              <div>
                <p className="text-xs font-bold text-slate-800">{unmarkedStudents} Unmarked</p>
                <p className="text-[11px] text-slate-500">{100 - attendanceCoverage}% remaining</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: FEE COLLECTION HEALTH */}
      <div id="section-fees" className="space-y-4 pt-4 border-t border-slate-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-rose-600" />
            <h2 className="text-lg font-bold text-slate-900">Fee Collection Health</h2>
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-rose-600">Financial Summary</span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-4 border border-slate-100">
              <p className="text-xs font-medium text-slate-500">Total Billed Fees</p>
              <p className="mt-1 text-2xl font-extrabold text-slate-900">
                {isLoading ? <span className="inline-block h-6 w-20 animate-pulse rounded bg-slate-200" /> : formatAmount(kpis.totalDue)}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400">Total charges registered</p>
            </div>

            <div className="rounded-xl bg-emerald-50/50 p-4 border border-emerald-100">
              <p className="text-xs font-medium text-emerald-800">Total Payments Collected</p>
              <p className="mt-1 text-2xl font-extrabold text-emerald-700">
                {isLoading ? <span className="inline-block h-6 w-20 animate-pulse rounded bg-slate-200" /> : formatAmount(kpis.totalCollected)}
              </p>
              <p className="mt-0.5 text-[11px] text-emerald-600">{collectionRate}% of target collected</p>
            </div>

            <div className="rounded-xl bg-amber-50/50 p-4 border border-amber-100">
              <p className="text-xs font-medium text-amber-800">Outstanding Balance</p>
              <p className="mt-1 text-2xl font-extrabold text-amber-700">
                {isLoading ? <span className="inline-block h-6 w-20 animate-pulse rounded bg-slate-200" /> : formatAmount(outstandingBalance)}
              </p>
              <p className="mt-0.5 text-[11px] text-amber-600">Pending collection from parents</p>
            </div>
          </div>

          {/* Fee Collection Segmented Bar */}
          <div className="mt-5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700">Overall Collection Progress</span>
              <span
                className={`font-bold ${
                  collectionRate >= 80
                    ? 'text-emerald-600'
                    : collectionRate >= 50
                    ? 'text-amber-600'
                    : 'text-rose-600'
                }`}
              >
                {collectionRate}% Collected
              </span>
            </div>

            <div className="h-3.5 overflow-hidden rounded-full bg-slate-100 flex">
              <div
                style={{ width: `${collectionRate}%` }}
                className="h-full bg-emerald-500 transition-all duration-500"
                title={`Collected: ${formatAmount(kpis.totalCollected)}`}
              />
              <div
                style={{ width: `${100 - collectionRate}%` }}
                className="h-full bg-amber-300 transition-all duration-500"
                title={`Outstanding: ${formatAmount(outstandingBalance)}`}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>MWK 0</span>
              <span>Target: {formatAmount(kpis.totalDue)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 3: ACADEMIC PERFORMANCE & STUDENT LEADERBOARDS */}
      <div id="section-academic" className="space-y-4 pt-4 border-t border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Award className="h-5 w-5 text-rose-600" />
            <h2 className="text-lg font-bold text-slate-900">Academic Performance & Student Leaderboards</h2>
          </div>

          {/* Term Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Select Academic Term:</span>
            <select
              value={selectedTermId}
              onChange={(e) => setSelectedTermId(e.target.value)}
              disabled={isTermsLoading || terms.length === 0}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20 disabled:opacity-50"
            >
              {terms.length === 0 && <option value="">No terms defined</option>}
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.academic_year})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {isAcademicError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700">
              Could not load academic analytics for the selected term.
            </div>
          ) : isAcademicLoading || !academicData ? (
            <div className="space-y-3 py-6">
              <div className="h-6 w-48 animate-pulse rounded bg-slate-200" />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
                <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Academic Highlights */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl bg-slate-900 p-4 text-white">
                  <span className="text-xs font-medium text-slate-400">School Mean Average</span>
                  <div className="mt-1 flex items-baseline gap-2">
                    <p className="text-3xl font-extrabold text-emerald-400">{academicData.averageScore}%</p>
                    <span className="text-xs text-slate-300">across all graded subjects</span>
                  </div>
                </div>

                <div className="rounded-xl bg-rose-50 p-4 border border-rose-100">
                  <span className="text-xs font-semibold text-rose-800">Total Recorded Grades</span>
                  <div className="mt-1 flex items-baseline gap-2">
                    <p className="text-3xl font-extrabold text-rose-700">{academicData.gradedCount}</p>
                    <span className="text-xs text-rose-600">individual grade entries</span>
                  </div>
                </div>
              </div>

              {/* STUDENT OVERALL PERFORMANCE RANKINGS (HIGHEST VS LOWEST OVERALL) */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Trophy className="h-4 w-4 text-amber-500" /> Overall Class & School Leaderboards
                    </h3>
                    <p className="text-xs text-slate-500">
                      Overall student mean performance across all subjects
                    </p>
                  </div>

                  {/* Class Filter Dropdown */}
                  <div className="flex items-center gap-2">
                    <Filter className="h-3.5 w-3.5 text-slate-400" />
                    <span className="text-xs font-semibold text-slate-600">Filter Class:</span>
                    <select
                      value={selectedClassFilter}
                      onChange={(e) => setSelectedClassFilter(e.target.value)}
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 focus:border-rose-500 focus:outline-none"
                    >
                      <option value="all">Entire School (All Classes)</option>
                      {academicData.classSummaries.map((cls) => (
                        <option key={cls.classId} value={cls.classId}>
                          {cls.className}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Top & Lowest Performers Side-by-Side */}
                <div className="mt-4 grid gap-5 lg:grid-cols-2">
                  {/* Top Performers (Honor Roll) */}
                  <div className="rounded-xl border border-emerald-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between border-b border-emerald-100 pb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                        <Medal className="h-4 w-4 text-amber-500" /> Top Performers (Honor Roll)
                      </span>
                      <span className="text-[11px] font-semibold text-emerald-600">Highest Mean %</span>
                    </div>

                    {filteredStudents.top.length === 0 ? (
                      <p className="mt-3 text-xs text-slate-500 italic">No grades recorded for this class selection.</p>
                    ) : (
                      <div className="mt-3 space-y-2.5">
                        {filteredStudents.top.map((st, index) => (
                          <div key={st.studentId} className="flex items-center justify-between rounded-lg bg-emerald-50/50 p-2.5 border border-emerald-100/60">
                            <div className="flex items-center gap-2.5">
                              <span
                                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-extrabold ${
                                  index === 0
                                    ? 'bg-amber-400 text-amber-950 shadow-sm'
                                    : index === 1
                                    ? 'bg-slate-300 text-slate-800'
                                    : index === 2
                                    ? 'bg-amber-700 text-white'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                {index + 1}
                              </span>
                              <div>
                                <p className="text-xs font-bold text-slate-900">{st.studentName}</p>
                                <p className="text-[11px] text-slate-500">
                                  {st.className} • Adm: {st.admissionNumber}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="inline-block rounded-md bg-emerald-600 px-2 py-0.5 text-xs font-extrabold text-white">
                                {st.averageScore}%
                              </span>
                              <p className="text-[10px] text-slate-400 mt-0.5">{st.gradedCount} subjects</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Lowest Performers (Needs Academic Intervention) */}
                  <div className="rounded-xl border border-rose-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between border-b border-rose-100 pb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-rose-800 flex items-center gap-1.5">
                        <AlertCircle className="h-4 w-4 text-rose-600" /> Needs Academic Support
                      </span>
                      <span className="text-[11px] font-semibold text-rose-600">Needs Follow-Up</span>
                    </div>

                    {filteredStudents.lowest.length === 0 ? (
                      <p className="mt-3 text-xs text-slate-500 italic">No low performance flags for this selection.</p>
                    ) : (
                      <div className="mt-3 space-y-2.5">
                        {filteredStudents.lowest.map((st) => (
                          <div key={st.studentId} className="flex items-center justify-between rounded-lg bg-rose-50/50 p-2.5 border border-rose-100/60">
                            <div>
                              <p className="text-xs font-bold text-slate-900">{st.studentName}</p>
                              <p className="text-[11px] text-slate-500">
                                {st.className} • Adm: {st.admissionNumber}
                              </p>
                            </div>
                            <div className="text-right">
                              <span className="inline-block rounded-md bg-rose-100 px-2 py-0.5 text-xs font-extrabold text-rose-800 border border-rose-200">
                                {st.averageScore}%
                              </span>
                              <p className="text-[10px] text-rose-600 mt-0.5">Action: Tutoring needed</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* CLASS & SUBJECT DEEP-DIVE DRILL-DOWN ANALYZER */}
              <div className="rounded-xl border border-rose-200 bg-gradient-to-br from-rose-50/40 via-white to-white p-4 sm:p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rose-100 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Target className="h-4 w-4 text-rose-600" /> Class & Subject Performance Deep-Dive
                    </h3>
                    <p className="text-xs text-slate-500">
                      Select a specific class and subject to view student scores ranked from highest to lowest
                    </p>
                  </div>

                  {/* Dual Selectors: Class & Subject */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-slate-600">Class:</span>
                      <select
                        value={selectedDrillClassId}
                        onChange={(e) => setSelectedDrillClassId(e.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 focus:border-rose-500 focus:outline-none"
                      >
                        <option value="all">All Classes</option>
                        {academicData.classSummaries.map((cls) => (
                          <option key={cls.classId} value={cls.classId}>
                            {cls.className}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-slate-600">Subject:</span>
                      <select
                        value={selectedDrillSubjectId}
                        onChange={(e) => setSelectedDrillSubjectId(e.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 focus:border-rose-500 focus:outline-none"
                      >
                        <option value="all">All Subjects</option>
                        {academicData.subjectSummaries.map((subj) => (
                          <option key={subj.subjectId} value={subj.subjectId}>
                            {subj.subjectName}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Drill-Down Summary KPIs */}
                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
                    <span className="text-[11px] font-medium text-slate-500">Subject Mean Average</span>
                    <p className="mt-1 text-xl font-extrabold text-slate-900">{subjectDrillStats.avg}%</p>
                    <p className="text-[10px] text-slate-400">Class subject mean score</p>
                  </div>

                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 shadow-2xs">
                    <span className="text-[11px] font-medium text-emerald-800">Highest Score Scored</span>
                    <p className="mt-1 text-xl font-extrabold text-emerald-700">
                      {subjectDrillStats.highest ? `${subjectDrillStats.highest.score}%` : 'N/A'}
                    </p>
                    <p className="text-[10px] text-emerald-600 truncate">
                      {subjectDrillStats.highest ? subjectDrillStats.highest.studentName : 'No records'}
                    </p>
                  </div>

                  <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-3 shadow-2xs">
                    <span className="text-[11px] font-medium text-rose-800">Lowest Score Scored</span>
                    <p className="mt-1 text-xl font-extrabold text-rose-700">
                      {subjectDrillStats.lowest ? `${subjectDrillStats.lowest.score}%` : 'N/A'}
                    </p>
                    <p className="text-[10px] text-rose-600 truncate">
                      {subjectDrillStats.lowest ? subjectDrillStats.lowest.studentName : 'No records'}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
                    <span className="text-[11px] font-medium text-slate-500">Students Graded</span>
                    <p className="mt-1 text-xl font-extrabold text-slate-900">{subjectDrillStats.count}</p>
                    <p className="text-[10px] text-slate-400">Recorded student scores</p>
                  </div>
                </div>

                {/* Ranked Student List (Highest to Lowest Score) */}
                <div className="mt-4 border-t border-slate-200 pt-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Student Rank List (Highest to Lowest)
                    </h4>
                    <span className="text-[11px] font-semibold text-slate-500">
                      Showing {filteredSubjectGrades.length} graded students
                    </span>
                  </div>

                  {filteredSubjectGrades.length === 0 ? (
                    <div className="mt-3 rounded-xl border border-dashed border-slate-200 p-6 text-center">
                      <BookOpen className="mx-auto h-6 w-6 text-slate-300" />
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        No grade records found for the selected Class and Subject.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-3 space-y-2 max-h-96 overflow-y-auto pr-1">
                      {filteredSubjectGrades.map((record, index) => {
                        const bandColor =
                          record.score >= 80
                            ? { bg: 'bg-emerald-50 text-emerald-800 border-emerald-200', bar: 'bg-emerald-500', label: 'Distinction' }
                            : record.score >= 70
                            ? { bg: 'bg-blue-50 text-blue-800 border-blue-200', bar: 'bg-blue-500', label: 'Credit' }
                            : record.score >= 60
                            ? { bg: 'bg-indigo-50 text-indigo-800 border-indigo-200', bar: 'bg-indigo-500', label: 'Good' }
                            : record.score >= 50
                            ? { bg: 'bg-amber-50 text-amber-800 border-amber-200', bar: 'bg-amber-500', label: 'Pass' }
                            : { bg: 'bg-rose-50 text-rose-800 border-rose-200', bar: 'bg-rose-500', label: 'Needs Support' }

                        return (
                          <div
                            key={`${record.studentId}-${record.subjectId}-${index}`}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs hover:border-rose-200 transition"
                          >
                            <div className="flex items-center gap-3">
                              <span
                                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-extrabold ${
                                  index === 0
                                    ? 'bg-amber-400 text-amber-950 shadow-sm'
                                    : index === 1
                                    ? 'bg-slate-300 text-slate-800'
                                    : index === 2
                                    ? 'bg-amber-700 text-white'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                #{index + 1}
                              </span>
                              <div>
                                <p className="text-xs font-bold text-slate-900">{record.studentName}</p>
                                <p className="text-[11px] text-slate-500">
                                  {record.className} • {record.subjectName} • Adm: {record.admissionNumber}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              {/* Progress bar visual */}
                              <div className="hidden w-24 sm:block">
                                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${bandColor.bar}`}
                                    style={{ width: `${Math.min(record.score, 100)}%` }}
                                  />
                                </div>
                              </div>

                              <span className={`rounded-lg border px-2.5 py-1 text-xs font-extrabold ${bandColor.bg}`}>
                                {record.score}% ({bandColor.label})
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Class & Subject Performance Breakdown Side-by-Side */}
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Performance by Class */}
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900">Performance by Class</h3>
                    <span className="text-[11px] font-semibold text-slate-400">Ranked highest to lowest</span>
                  </div>

                  {academicData.classSummaries.length === 0 ? (
                    <p className="mt-3 text-xs text-slate-500 italic">No class grades recorded for this term yet.</p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {academicData.classSummaries.map((item) => (
                        <div key={item.classId} className="rounded-lg bg-slate-50 p-2.5 border border-slate-100">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-800">{item.className}</span>
                            <span className="font-bold text-slate-900">
                              {item.averageScore}% <span className="font-normal text-slate-500">({item.gradedCount} grades)</span>
                            </span>
                          </div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                            <div
                              className={`h-full rounded-full transition-all ${
                                item.averageScore >= 70
                                  ? 'bg-emerald-500'
                                  : item.averageScore >= 50
                                  ? 'bg-blue-500'
                                  : 'bg-amber-500'
                              }`}
                              style={{ width: `${Math.min(item.averageScore, 100)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Performance by Subject */}
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900">Performance by Subject</h3>
                    <span className="text-[11px] font-semibold text-slate-400">Subject performance</span>
                  </div>

                  {academicData.subjectSummaries.length === 0 ? (
                    <p className="mt-3 text-xs text-slate-500 italic">No subject grades recorded for this term yet.</p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {academicData.subjectSummaries.map((subj) => (
                        <div key={subj.subjectId} className="rounded-lg bg-rose-50/40 p-2.5 border border-rose-100/60">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-800">{subj.subjectName}</span>
                            <span className="font-bold text-slate-900">
                              {subj.averageScore}% <span className="font-normal text-slate-500">({subj.gradedCount} grades)</span>
                            </span>
                          </div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                            <div
                              className={`h-full rounded-full transition-all ${
                                subj.averageScore >= 70
                                  ? 'bg-emerald-500'
                                  : subj.averageScore >= 50
                                  ? 'bg-rose-500'
                                  : 'bg-amber-500'
                              }`}
                              style={{ width: `${Math.min(subj.averageScore, 100)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Color-Coded Grade Distribution Histogram */}
              <div className="border-t border-slate-100 pt-5">
                <h3 className="text-sm font-bold text-slate-900">Grade Distribution Breakdown</h3>
                <p className="text-xs text-slate-500">Distribution of student marks across standard score bands</p>

                <div className="mt-4 grid grid-cols-5 gap-2 sm:gap-4">
                  {academicData.gradeBands.map((band) => {
                    const style = GRADE_BAND_COLORS[band.label] || { bar: 'bg-slate-400', text: 'text-slate-700', bg: 'bg-slate-50' }
                    const heightPct = academicData.gradedCount
                      ? Math.max((band.count / academicData.gradedCount) * 100, band.count ? 12 : 0)
                      : 0

                    return (
                      <div key={band.label} className="text-center">
                        <div className={`flex h-28 items-end justify-center rounded-xl p-1.5 ${style.bg} border border-slate-200/60`}>
                          <div
                            className={`w-full rounded-t-lg transition-all duration-500 ${style.bar}`}
                            style={{ height: `${heightPct}%` }}
                          />
                        </div>
                        <p className={`mt-2 text-xs font-bold ${style.text}`}>{band.label}%</p>
                        <p className="text-xs font-semibold text-slate-900">{band.count} students</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SECTION 4: ATTENDANCE TRENDS & DATE PRESETS */}
      <div id="section-trends" className="space-y-4 pt-4 border-t border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-rose-600" />
            <h2 className="text-lg font-bold text-slate-900">Attendance Trends & Class Rankings</h2>
          </div>

          {/* Quick Date Presets */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Presets:</span>
            <button
              onClick={() => applyDatePreset('today')}
              className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-rose-100 hover:text-rose-700"
            >
              Today
            </button>
            <button
              onClick={() => applyDatePreset('week')}
              className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-rose-100 hover:text-rose-700"
            >
              7 Days
            </button>
            <button
              onClick={() => applyDatePreset('30days')}
              className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-rose-100 hover:text-rose-700"
            >
              30 Days
            </button>
            <button
              onClick={() => applyDatePreset('month')}
              className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-rose-100 hover:text-rose-700"
            >
              This Month
            </button>

            {/* Custom Date Pickers */}
            <div className="flex items-center gap-1.5 ml-2">
              <input
                type="date"
                value={dateFrom}
                max={dateTo}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-800 focus:border-rose-500 focus:outline-none"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom}
                max={formatDateInput(new Date())}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-800 focus:border-rose-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {dateFrom > dateTo ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-800">
              Please choose a start date that is before or equal to the end date.
            </p>
          ) : isAttendanceTrendError ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800">
              Could not load attendance trend data for this date range.
            </p>
          ) : isAttendanceTrendLoading || !attendanceTrend ? (
            <div className="space-y-3 py-6">
              <div className="h-6 w-48 animate-pulse rounded bg-slate-200" />
              <div className="h-32 animate-pulse rounded-xl bg-slate-100" />
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
              {/* Daily History */}
              <div>
                <h3 className="text-sm font-bold text-slate-900">Daily Attendance Breakdown</h3>
                <p className="text-xs text-slate-500">Record history for selected date window</p>

                {attendanceTrend.days.length === 0 ? (
                  <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-8 text-center">
                    <CalendarDays className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-2 text-xs font-semibold text-slate-500">No attendance records found for these dates</p>
                  </div>
                ) : (
                  <div className="mt-4 space-y-3 max-h-96 overflow-y-auto pr-1">
                    {attendanceTrend.days.map((day) => {
                      const presentRate = day.marked ? Math.round((day.present / day.marked) * 100) : 0
                      return (
                        <div key={day.date} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-800">
                              {new Date(`${day.date}T00:00:00`).toLocaleDateString('en-GB', {
                                weekday: 'short',
                                day: 'numeric',
                                month: 'short',
                              })}
                            </span>
                            <span className="font-semibold text-emerald-700">
                              {day.present} present / {day.marked} marked ({presentRate}%)
                            </span>
                          </div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 flex">
                            <div className="h-full bg-emerald-500" style={{ width: `${presentRate}%` }} />
                            <div
                              className="h-full bg-rose-500"
                              style={{ width: `${day.marked ? Math.round((day.absent / day.marked) * 100) : 0}%` }}
                            />
                          </div>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {day.absent} absent • {day.late + day.other} late/other
                          </p>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Class Attendance Rankings */}
              <div>
                <h3 className="text-sm font-bold text-slate-900">Attendance by Class</h3>
                <p className="text-xs text-slate-500">Ranked by attendance performance percentage</p>

                {attendanceTrend.classes.length === 0 ? (
                  <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-8 text-center">
                    <Users className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-2 text-xs font-semibold text-slate-500">No class records for this period</p>
                  </div>
                ) : (
                  <div className="mt-4 space-y-2.5">
                    {attendanceTrend.classes.map((cls) => (
                      <div
                        key={cls.classId}
                        onClick={() => setSelectedClassDrill(selectedClassDrill === cls.classId ? null : cls.classId)}
                        className={`cursor-pointer rounded-xl border p-3 transition ${
                          selectedClassDrill === cls.classId
                            ? 'border-rose-400 bg-rose-50/50 shadow-sm'
                            : 'border-slate-100 bg-white hover:border-rose-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-800">{cls.className}</span>
                          <span
                            className={`font-extrabold ${
                              cls.attendanceRate >= 85
                                ? 'text-emerald-700'
                                : cls.attendanceRate >= 70
                                ? 'text-blue-700'
                                : 'text-rose-700'
                            }`}
                          >
                            {cls.attendanceRate}%
                          </span>
                        </div>

                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full transition-all ${
                              cls.attendanceRate >= 85
                                ? 'bg-emerald-500'
                                : cls.attendanceRate >= 70
                                ? 'bg-blue-500'
                                : 'bg-rose-500'
                            }`}
                            style={{ width: `${cls.attendanceRate}%` }}
                          />
                        </div>

                        <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                          <span>{cls.absent} absent of {cls.marked} marked</span>
                          <span className="text-rose-600 font-semibold flex items-center gap-0.5">
                            {selectedClassDrill === cls.classId ? 'Hide summary' : 'Details'} <ChevronRight className="h-3 w-3" />
                          </span>
                        </div>

                        {/* Class Drilldown Expandable Details */}
                        {selectedClassDrill === cls.classId && (
                          <div className="mt-3 border-t border-rose-200/60 pt-2.5 text-xs text-slate-700">
                            <p className="font-semibold text-rose-800">Quick Class Attendance Summary:</p>
                            <ul className="mt-1 space-y-1 text-[11px] text-slate-600">
                              <li>• Total roll entries logged: <strong>{cls.marked}</strong></li>
                              <li>• Total absent instances: <strong className="text-rose-600">{cls.absent}</strong></li>
                              <li>• Attendance percentage rate: <strong>{cls.attendanceRate}%</strong></li>
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
