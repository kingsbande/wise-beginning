import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { fetchCurriculumProgress, fetchCurriculumTopicsForAdmin, fetchTerms } from '../../lib/topicsApi'
import { CurriculumTopic, CurriculumTopicProgress } from '../../types'

export function CurriculumProgressView() {
  const [termId, setTermId] = useState('')
  const [teacherId, setTeacherId] = useState('')
  const [classId, setClassId] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const { data: terms = [], isLoading: isTermsLoading } = useQuery({ queryKey: ['terms'], queryFn: fetchTerms })

  useEffect(() => {
    if (!termId && terms.length > 0) setTermId(terms[0].id)
  }, [termId, terms])

  const { data: rows = [], isLoading, isError } = useQuery({
    queryKey: ['curriculum-progress', termId],
    queryFn: () => fetchCurriculumProgress(termId),
    enabled: !!termId,
  })
  const { data: topics = [], isLoading: isTopicsLoading, isError: isTopicsError } = useQuery({
    queryKey: ['curriculum-topics-admin', termId],
    queryFn: () => fetchCurriculumTopicsForAdmin(termId),
    enabled: !!termId,
  })

  const teachers = uniqueBy(rows, 'teacher_id', 'teacher_name')
  const classes = uniqueBy(rows, 'class_id', 'class_name')
  const subjects = uniqueBy(rows, 'subject_id', 'subject_name')
  const filteredRows = rows.filter((row) => (!teacherId || row.teacher_id === teacherId) && (!classId || row.class_id === classId) && (!subjectId || row.subject_id === subjectId))
  const totals = filteredRows.reduce((summary, row) => ({ total: summary.total + row.total_topics, completed: summary.completed + row.completed_topics }), { total: 0, completed: 0 })
  const rate = totals.total ? Math.round((totals.completed / totals.total) * 100) : 0

  if (isTermsLoading) return <Loading />

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-600">Academic oversight</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-900">Curriculum progress</h2>
            <p className="mt-1 text-sm text-slate-500">See how much of each assigned subject has been covered.</p>
          </div>
          <div className="rounded-xl bg-emerald-50 px-5 py-3 text-right">
            <p className="text-xs font-medium text-emerald-700">Overall completion</p>
            <p className="mt-1 text-2xl font-bold text-emerald-700">{rate}%</p>
            <p className="text-xs text-emerald-600">{totals.completed} of {totals.total} topics</p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Filter label="Term" value={termId} onChange={setTermId} options={terms.map((term) => ({ value: term.id, label: `${term.name} · ${term.academic_year}` }))} />
          <Filter label="Teacher" value={teacherId} onChange={setTeacherId} options={teachers.map((item) => ({ value: item.id, label: item.label }))} allLabel="All teachers" />
          <Filter label="Class" value={classId} onChange={setClassId} options={classes.map((item) => ({ value: item.id, label: item.label }))} allLabel="All classes" />
          <Filter label="Subject" value={subjectId} onChange={setSubjectId} options={subjects.map((item) => ({ value: item.id, label: item.label }))} allLabel="All subjects" />
        </div>
      </div>

      {isLoading || isTopicsLoading ? <Loading /> : isError || isTopicsError ? <Empty title="Progress could not load" message="Refresh the page and try again." /> : filteredRows.length === 0 ? <Empty title="No topic progress yet" message="Teachers will appear here after they add topics for the selected term." /> : (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 p-4 sm:p-5"><BarChart3 className="h-5 w-5 text-rose-600" /><h3 className="font-semibold text-slate-900">Progress by class and subject</h3></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3 font-semibold">Teacher</th><th className="px-5 py-3 font-semibold">Class</th><th className="px-5 py-3 font-semibold">Subject</th><th className="px-5 py-3 font-semibold">Topics</th><th className="px-5 py-3 font-semibold">Progress</th><th className="px-5 py-3 font-semibold">Details</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredRows.map((row) => <ProgressRow key={`${row.teacher_id}-${row.class_id}-${row.subject_id}`} row={row} topics={topics.filter((topic) => topic.teacher_id === row.teacher_id && topic.class_id === row.class_id && topic.subject_id === row.subject_id)} />)}</tbody></table></div>
        </div>
      )}
    </div>
  )
}

function ProgressRow({ row, topics }: { row: CurriculumTopicProgress; topics: CurriculumTopic[] }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const completedTopics = topics.filter((topic) => topic.completed)
  const remainingTopics = topics.filter((topic) => !topic.completed)

  return (
    <>
      <tr>
        <td className="px-5 py-4 font-medium text-slate-800">{row.teacher_name}</td>
        <td className="px-5 py-4 text-slate-600">{row.class_name}</td>
        <td className="px-5 py-4 text-slate-600">{row.subject_name}</td>
        <td className="px-5 py-4 text-slate-600">{row.completed_topics} / {row.total_topics}</td>
        <td className="px-5 py-4"><div className="flex items-center gap-3"><div className="h-2 w-28 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${row.completion_rate}%` }} /></div><span className="font-semibold text-slate-700">{row.completion_rate}%</span></div></td>
        <td className="px-5 py-4"><button type="button" onClick={() => setIsExpanded((expanded) => !expanded)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50" aria-expanded={isExpanded}>{isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />} {isExpanded ? 'Hide' : 'View topics'}</button></td>
      </tr>
      {isExpanded && <tr><td colSpan={6} className="bg-slate-50 px-5 py-5"><div className="grid gap-5 lg:grid-cols-2"><TopicGroup title="Marked topics" topics={completedTopics} completed /><TopicGroup title="Remaining topics" topics={remainingTopics} /></div></td></tr>}
    </>
  )
}

function TopicGroup({ title, topics, completed = false }: { title: string; topics: CurriculumTopic[]; completed?: boolean }) {
  return <div><h4 className={`text-xs font-semibold uppercase tracking-wide ${completed ? 'text-emerald-700' : 'text-amber-700'}`}>{title} <span className="font-normal">({topics.length})</span></h4>{topics.length === 0 ? <p className="mt-2 text-sm text-slate-500">{completed ? 'No topics marked yet.' : 'All topics are marked complete.'}</p> : <div className="mt-2 space-y-2">{topics.map((topic) => <div key={topic.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5"><p className="text-sm font-medium text-slate-800">{topic.title}</p>{completed && topic.note && <p className="mt-1 text-xs text-slate-500">Note: {topic.note}</p>}{completed && topic.taught_on && <p className="mt-1 text-[11px] text-slate-400">Taught on {topic.taught_on}</p>}</div>)}</div>}</div>
}

function uniqueBy<T extends object>(rows: T[], idKey: keyof T, labelKey: keyof T) {
  const seen = new Map<string, string>()

  rows.forEach((row) => {
    const id = row[idKey]
    const label = row[labelKey]

    if (typeof id === 'string' || typeof id === 'number') {
      if (typeof label === 'string' || typeof label === 'number') {
        seen.set(String(id), String(label))
      }
    }
  })

  return Array.from(seen, ([id, label]) => ({ id, label }))
}

function Filter({ label, value, onChange, options, allLabel }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; allLabel?: string }) {
  return <label className="text-sm font-medium text-slate-700">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100">{allLabel && <option value="">{allLabel}</option>}{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
}

function Loading() { return <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-12 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading curriculum progress...</div> }
function Empty({ title, message }: { title: string; message: string }) { return <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center"><p className="text-sm font-semibold text-slate-700">{title}</p><p className="mt-1 text-xs text-slate-500">{message}</p></div> }
