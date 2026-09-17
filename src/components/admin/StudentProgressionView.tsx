import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Clock3, GraduationCap, Play, RefreshCw } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import {
  createPromotionRun,
  fetchProgressionTerms,
  fetchPromotionDecisions,
  fetchPromotionRuns,
  PromotionOutcome,
} from '../../lib/progressionApi'

const outcomeLabels: Record<PromotionOutcome, string> = {
  promote: 'Promote',
  retain: 'Retain',
  manual_review: 'Manual review',
  graduate: 'Graduate',
  exclude: 'Exclude',
}

const outcomeStyles: Record<PromotionOutcome, string> = {
  promote: 'bg-emerald-50 text-emerald-700',
  retain: 'bg-amber-50 text-amber-700',
  manual_review: 'bg-rose-50 text-rose-700',
  graduate: 'bg-sky-50 text-sky-700',
  exclude: 'bg-slate-100 text-slate-600',
}

export function StudentProgressionView() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [sourceYear, setSourceYear] = useState('')
  const [finalTermId, setFinalTermId] = useState('')
  const [targetYear, setTargetYear] = useState('')
  const [minimumAverage, setMinimumAverage] = useState('50')

  const termsQuery = useQuery({ queryKey: ['progression-terms'], queryFn: fetchProgressionTerms })
  const runsQuery = useQuery({ queryKey: ['promotion-runs'], queryFn: fetchPromotionRuns })
  const decisionsQuery = useQuery({
    queryKey: ['promotion-decisions', selectedRunId],
    queryFn: () => fetchPromotionDecisions(selectedRunId!),
    enabled: !!selectedRunId,
  })

  const runMutation = useMutation({
    mutationFn: () => {
      if (!sourceYear || !finalTermId || !targetYear) throw new Error('Complete the academic-year and final-term fields.')
      const threshold = Number(minimumAverage)
      if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
        throw new Error('The minimum average must be between 0 and 100.')
      }
      return createPromotionRun({
        sourceAcademicYear: sourceYear,
        targetAcademicYear: targetYear,
        finalTermId,
        minimumAverage: threshold,
      })
    },
    onSuccess: (runId) => {
      setSelectedRunId(runId)
      void queryClient.invalidateQueries({ queryKey: ['promotion-runs'] })
      void queryClient.invalidateQueries({ queryKey: ['promotion-decisions', runId] })
    },
  })

  const terms = termsQuery.data ?? []
  const sourceYears = [...new Set(terms.map((term) => term.academic_year))]
  const sourceTerms = terms.filter((term) => term.academic_year === sourceYear)
  const decisions = decisionsQuery.data ?? []
  const counts = decisions.reduce<Record<PromotionOutcome, number>>(
    (result, decision) => ({ ...result, [decision.outcome]: result[decision.outcome] + 1 }),
    { promote: 0, retain: 0, manual_review: 0, graduate: 0, exclude: 0 },
  )

  function selectSourceYear(year: string) {
    setSourceYear(year)
    setFinalTermId('')
    if (!targetYear && /^\d{4}$/.test(year)) setTargetYear(String(Number(year) + 1))
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-600">Academic operations</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">Student progression</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Generate a school-wide recommendation from released end-of-term grades. Staff review the exceptions before any future enrollment changes are applied.
            </p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
            <GraduationCap className="h-5 w-5" />
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-medium text-slate-700">
            Source academic year
            <select
              value={sourceYear}
              onChange={(event) => selectSourceYear(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
            >
              <option value="">Select year</option>
              {sourceYears.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Final term
            <select
              value={finalTermId}
              onChange={(event) => setFinalTermId(event.target.value)}
              disabled={!sourceYear}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm disabled:bg-slate-50"
            >
              <option value="">Select term</option>
              {sourceTerms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Target academic year
            <input value={targetYear} onChange={(event) => setTargetYear(event.target.value)} placeholder="2027" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Minimum average (%)
            <input type="number" min="0" max="100" value={minimumAverage} onChange={(event) => setMinimumAverage(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => runMutation.mutate()} disabled={runMutation.isPending || !profile} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50">
            <Play className="h-4 w-4" />
            {runMutation.isPending ? 'Calculating...' : 'Calculate progression'}
          </button>
          <p className="text-xs text-slate-500">Uses end-of-term grades only. Missing required grades are sent to manual review.</p>
        </div>
        {runMutation.error && <p className="mt-3 text-sm text-rose-600">{(runMutation.error as Error).message}</p>}
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
          <span>Calculation creates a review run only. It does not change student classes or academic records.</span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Previous runs</h3>
            <button type="button" title="Refresh runs" onClick={() => void runsQuery.refetch()} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><RefreshCw className="h-4 w-4" /></button>
          </div>
          <div className="mt-3 space-y-2">
            {(runsQuery.data ?? []).map((run) => (
              <button key={run.id} type="button" onClick={() => setSelectedRunId(run.id)} className={`w-full rounded-lg border p-3 text-left ${selectedRunId === run.id ? 'border-rose-300 bg-rose-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                <p className="text-sm font-semibold text-slate-900">{run.source_academic_year} → {run.target_academic_year}</p>
                <p className="mt-1 text-xs text-slate-500">Average threshold: {run.minimum_average}%</p>
                <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700"><Clock3 className="h-3 w-3" /> {run.status}</span>
              </button>
            ))}
            {!runsQuery.isLoading && !(runsQuery.data ?? []).length && <p className="text-sm text-slate-500">No progression runs yet.</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          {!selectedRunId ? (
            <div className="flex min-h-48 items-center justify-center text-center text-sm text-slate-500">Select a run to review student recommendations.</div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-4">
                <Summary label="Promote" value={counts.promote} tone="emerald" />
                <Summary label="Retain" value={counts.retain} tone="amber" />
                <Summary label="Manual review" value={counts.manual_review} tone="rose" />
                <Summary label="Graduate" value={counts.graduate} tone="sky" />
              </div>
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[42rem] text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Student</th><th className="px-3 py-3">Current class</th><th className="px-3 py-3">Average</th><th className="px-3 py-3">Recommendation</th><th className="px-3 py-3">Reason</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {decisions.map((decision) => <tr key={decision.id}><td className="px-3 py-3"><p className="font-medium text-slate-900">{decision.student_name}</p><p className="text-xs text-slate-500">{decision.admission_number}</p></td><td className="px-3 py-3 text-slate-600">{decision.source_class_name}</td><td className="px-3 py-3 text-slate-600">{decision.average_score === null ? '-' : `${decision.average_score}%`}</td><td className="px-3 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${outcomeStyles[decision.outcome]}`}>{outcomeLabels[decision.outcome]}</span>{decision.destination_class_name && <p className="mt-1 text-xs text-slate-500">→ {decision.destination_class_name}</p>}</td><td className="px-3 py-3 text-xs text-slate-500">{decision.reason}</td></tr>)}
                  </tbody>
                </table>
                {!decisionsQuery.isLoading && !decisions.length && <p className="py-10 text-center text-sm text-slate-500">No student decisions were generated.</p>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Summary({ label, value, tone }: { label: string; value: number; tone: 'emerald' | 'amber' | 'rose' | 'sky' }) {
  const styles = { emerald: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-700', rose: 'bg-rose-50 text-rose-700', sky: 'bg-sky-50 text-sky-700' }
  return <div className={`rounded-xl p-3 ${styles[tone]}`}><p className="text-xs font-medium">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>
}