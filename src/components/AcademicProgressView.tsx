import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownRight, ArrowUpRight, BarChart3, BookOpen, CalendarRange, TrendingUp, Users } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { fetchAcademicProgressData } from '../lib/academicProgressApi'
import type { AcademicProgressAssessmentType } from '../lib/academicProgressApi'

function className(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export function AcademicProgressView({ allowedClassIds }: { allowedClassIds?: string[] }) {
  const { profile } = useAuth()
  const [selectedClassId, setSelectedClassId] = useState('')
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [selectedTermId, setSelectedTermId] = useState('')
  const [assessmentType, setAssessmentType] = useState<AcademicProgressAssessmentType>('end_of_term')
  const classScopeKey = allowedClassIds?.slice().sort().join(',') ?? 'all-school-classes'

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['academic-progress', profile?.school_id, classScopeKey, selectedClassId, selectedStudentId, selectedTermId, assessmentType],
    queryFn: () =>
      fetchAcademicProgressData({
        schoolId: profile!.school_id,
        allowedClassIds,
        classId: selectedClassId || undefined,
        studentId: selectedStudentId || undefined,
        termId: selectedTermId || undefined,
        assessmentType,
        weeks: 5,
      }),
    enabled: !!profile?.school_id,
  })

  useEffect(() => {
    if (!data) return
    if (!data.classOptions.some((item) => item.id === selectedClassId)) {
      setSelectedClassId(data.defaultClassId)
      setSelectedStudentId('')
    }
    if (selectedStudentId && !data.studentOptions.some((item) => item.id === selectedStudentId)) {
      setSelectedStudentId('')
    }
    if (!data.termOptions.some((item) => item.id === selectedTermId)) setSelectedTermId(data.defaultTermId)
  }, [data, selectedClassId, selectedStudentId, selectedTermId])

  const trendMax = useMemo(() => {
    if (!data?.weeklyTrend.length) return 100
    return Math.max(...data.weeklyTrend.map((point) => point.averageScore), 100)
  }, [data])

  const positiveTrend = (data?.weekOverWeekChange ?? 0) >= 0
  const currentTermResult = data?.termComparison.find((term) => term.termId === selectedTermId)
  const selectedTerm = data?.termOptions.find((term) => term.id === selectedTermId)
  const previousTermResult = data?.termComparison[data.termComparison.length - 2]
  const hasTermComparison =
    !!currentTermResult &&
    !!previousTermResult &&
    currentTermResult.gradedCount > 0 &&
    previousTermResult.gradedCount > 0

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-500">Academic progress</p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">Performance trends</h2>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
            <TrendingUp className="h-3.5 w-3.5" />
            Weekly and term analysis
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm text-slate-600">
            <span className="mb-1.5 block font-medium text-slate-700">Class</span>
            <select
              value={selectedClassId}
              onChange={(event) => {
                setSelectedClassId(event.target.value)
                setSelectedStudentId('')
              }}
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-400/20"
              disabled={isLoading || !data?.classOptions.length}
            >
              {data?.classOptions.map((classOption) => (
                <option key={classOption.id} value={classOption.id}>
                  {classOption.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-slate-600">
            <span className="mb-1.5 block font-medium text-slate-700">Student</span>
            <select
              value={selectedStudentId}
              onChange={(event) => setSelectedStudentId(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-400/20"
              disabled={isLoading || !(data && data.studentOptions.length > 0)}
            >
              <option value="">All students</option>
              {data?.studentOptions.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.full_name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-slate-600">
            <span className="mb-1.5 block font-medium text-slate-700">Term</span>
            <select
              value={selectedTermId}
              onChange={(event) => setSelectedTermId(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-400/20"
              disabled={isLoading || !data?.termOptions.length}
            >
              {data?.termOptions.map((term) => (
                <option key={term.id} value={term.id}>
                  {term.yearLabel} · {term.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-slate-600">
            <span className="mb-1.5 block font-medium text-slate-700">Term assessment</span>
            <select
              value={assessmentType}
              onChange={(event) => setAssessmentType(event.target.value as AcademicProgressAssessmentType)}
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-400/20"
            >
              <option value="midterm">Midterm</option>
              <option value="end_of_term">End of term</option>
            </select>
          </label>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Comparisons across terms use only terms explicitly ordered in the school calendar. Unmapped legacy terms are shown on their own rather than being assigned an assumed chronology.
        </p>
      </div>

      {isError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800 shadow-sm" role="alert">
          <p className="font-semibold">Academic performance could not be loaded.</p>
          <p className="mt-1">{error instanceof Error ? error.message : 'Please try again.'}</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-3 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100"
          >
            Retry
          </button>
        </div>
      ) : isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
          Loading academic performance…
        </div>
      ) : !data || data.classOptions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
          No class data is available yet for this school. Add a class and assessment records to start tracking performance.
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-semibold uppercase tracking-[0.18em]">Selected term · {assessmentType === 'midterm' ? 'Midterm' : 'End of term'}</span>
                <BarChart3 className="h-4 w-4" />
              </div>
              <p className="mt-3 text-3xl font-bold text-slate-900">
                {currentTermResult?.gradedCount ? data.currentTermAverage.toFixed(1) : '—'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {currentTermResult?.gradedCount
                  ? `Average of ${currentTermResult.gradedCount} ${currentTermResult.gradedCount === 1 ? 'score' : 'scores'}`
                  : 'No scores for this assessment'}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-semibold uppercase tracking-[0.18em]">Latest week</span>
                <CalendarRange className="h-4 w-4" />
              </div>
              <p className="mt-3 text-3xl font-bold text-slate-900">{data.currentWeekAverage.toFixed(1)}</p>
              <p className={`mt-1 text-xs ${data.weeklyTrend.length > 1 ? (positiveTrend ? 'text-emerald-600' : 'text-orange-600') : 'text-slate-500'}`}>
                {data.weeklyTrend.length > 1
                  ? `${data.weekOverWeekChange >= 0 ? '+' : ''}${data.weekOverWeekChange.toFixed(1)} vs ${data.weeklyTrend[data.weeklyTrend.length - 2].label}`
                  : data.weeklyTrend.length === 1
                    ? 'No earlier assessment week to compare'
                    : 'No approved weekly scores yet'}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-semibold uppercase tracking-[0.18em]">Term change</span>
                <TrendingUp className="h-4 w-4" />
              </div>
              <p className="mt-3 text-3xl font-bold text-slate-900">
                {hasTermComparison ? `${data.changeFromPreviousTerm >= 0 ? '+' : ''}${data.changeFromPreviousTerm.toFixed(1)}` : '—'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {hasTermComparison
                  ? 'Compared with previous term'
                  : selectedTerm?.academic_year_id
                    ? 'Need scores in two terms'
                    : 'Map this term in the academic calendar to compare'}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-semibold uppercase tracking-[0.18em]">Learners</span>
                <Users className="h-4 w-4" />
              </div>
              <p className="mt-3 text-3xl font-bold text-slate-900">{data.totalStudents}</p>
              <p className="mt-1 text-xs text-slate-500">Students in selected class</p>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Five-week trend</h3>
                  <p className="text-sm text-slate-500">Trend for all scores in the selected class and term</p>
                </div>
                {data.weeklyTrend.length > 1 ? (
                  <div className={className(
                    'inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold',
                    positiveTrend ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
                  )}>
                    {positiveTrend ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                    {data.weekOverWeekChange >= 0 ? '+' : ''}{data.weekOverWeekChange.toFixed(1)}
                  </div>
                ) : (
                  <span className="text-xs text-slate-400">Not enough weeks</span>
                )}
              </div>

              {data.weeklyTrend.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                  No weekly assessment scores have been entered for this selection yet.
                </div>
              ) : (
                <div className="mt-4 flex h-56 items-end gap-3 overflow-x-auto pb-2">
                  {data.weeklyTrend.map((point) => (
                    <div key={point.label} className="flex min-w-[68px] flex-1 flex-col items-center justify-end gap-2">
                      <div className="flex w-full items-end justify-center rounded-t-xl bg-gradient-to-t from-rose-500 to-amber-400 shadow-sm" style={{ height: `${Math.max((point.averageScore / trendMax) * 100, 8)}%` }}>
                        <span className="mb-2 text-[10px] font-semibold text-white">{point.averageScore.toFixed(0)}</span>
                      </div>
                      <span className="text-[11px] font-medium text-slate-500">{point.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <h3 className="text-lg font-semibold text-slate-900">{assessmentType === 'midterm' ? 'Midterm' : 'End-of-term'} comparison</h3>
              <div className="mt-4 space-y-3">
                {data.termComparison.length === 0 ? (
                  <p className="text-sm text-slate-500">No term averages available for this class yet.</p>
                ) : (
                  data.termComparison.map((term) => (
                    <div key={term.termId} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-800">{term.termName}</p>
                        <span className="text-sm font-bold text-slate-900">
                          {term.gradedCount > 0 ? term.averageScore.toFixed(1) : 'No scores'}
                        </span>
                      </div>
                      {term.gradedCount > 0 && (
                        <p className="mt-1 text-xs text-slate-500">
                          Based on {term.gradedCount} {term.gradedCount === 1 ? 'score' : 'scores'}
                        </p>
                      )}
                      <div className="mt-2 h-2 rounded-full bg-slate-200">
                        <div className="h-2 rounded-full bg-rose-500" style={{ width: `${term.gradedCount ? Math.min(term.averageScore, 100) : 0}%` }} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-center gap-2 text-slate-700">
              <BookOpen className="h-4 w-4 text-rose-500" />
              <h3 className="text-lg font-semibold text-slate-900">Performance insight</h3>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Selected learner</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {selectedStudentId ? (data.studentOptions.find((student) => student.id === selectedStudentId)?.full_name ?? 'Selected learner') : 'Whole class'}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {currentTermResult?.gradedCount ? `${data.studentAverage.toFixed(1)} average` : 'No term scores recorded'}
                </p>
              </div>

              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Class average</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {currentTermResult?.gradedCount ? data.classAverage.toFixed(1) : '—'}
                </p>
                <p className="mt-1 text-sm text-slate-500">Across this term</p>
              </div>

              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Progress signal</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {!hasTermComparison
                    ? selectedTerm?.academic_year_id
                      ? 'Not enough history'
                      : 'Map this term to compare'
                    : data.changeFromPreviousTerm > 0
                      ? 'Improving'
                      : data.changeFromPreviousTerm < 0
                        ? 'Needs support'
                        : 'Holding steady'}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {!hasTermComparison
                    ? 'A previous term is needed for comparison'
                    : `${data.changeFromPreviousTerm >= 0 ? '+' : ''}${data.changeFromPreviousTerm.toFixed(1)} from previous term`}
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
