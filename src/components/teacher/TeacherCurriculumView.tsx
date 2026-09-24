import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Check, Loader2, Plus, Trash2 } from 'lucide-react'
import { ConfirmDialog } from '../ConfirmDialog'
import { fetchTerms, createCurriculumTopic, deleteCurriculumTopic, fetchCurriculumTopics, submitCurriculumTopic, updateCurriculumTopic } from '../../lib/topicsApi'
import { CurriculumTopic, TeacherAssignment } from '../../types'

interface TeacherCurriculumViewProps {
  assignments: TeacherAssignment[]
  teacherId: string
  schoolId: string
}

export function TeacherCurriculumView({ assignments, teacherId, schoolId }: TeacherCurriculumViewProps) {
  const queryClient = useQueryClient()
  const [termId, setTermId] = useState('')
  const [assignmentId, setAssignmentId] = useState(assignments[0]?.id ?? '')
  const [newTitle, setNewTitle] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [topicToDelete, setTopicToDelete] = useState<CurriculumTopic | null>(null)

  const handleDeleteConfirmed = () => {
    if (!topicToDelete) return
    deleteMutation.mutate(topicToDelete.id)
    setTopicToDelete(null)
  }

  const { data: terms = [], isLoading: isTermsLoading } = useQuery({
    queryKey: ['terms'],
    queryFn: fetchTerms,
  })

  useEffect(() => {
    if (!termId && terms.length > 0) setTermId(terms[0].id)
  }, [termId, terms])

  useEffect(() => {
    if (!assignments.some((assignment) => assignment.id === assignmentId)) {
      setAssignmentId(assignments[0]?.id ?? '')
    }
  }, [assignmentId, assignments])

  const assignment = assignments.find((item) => item.id === assignmentId)
  const topicQueryKey = ['curriculum-topics', teacherId, assignment?.class_id, assignment?.subject_id, termId]
  const { data: topics = [], isLoading: isTopicsLoading, isError } = useQuery({
    queryKey: topicQueryKey,
    queryFn: () => fetchCurriculumTopics({
      teacherId,
      classId: assignment!.class_id,
      subjectId: assignment!.subject_id,
      termId,
    }),
    enabled: !!assignment && !!termId,
  })

  const completedCount = topics.filter((topic) => topic.approval_status === 'approved').length
  const completionRate = topics.length ? Math.round((completedCount / topics.length) * 100) : 0

  const invalidateTopics = () => queryClient.invalidateQueries({ queryKey: topicQueryKey })
  const addMutation = useMutation({
    mutationFn: () => createCurriculumTopic({
      schoolId,
      teacherId,
      classId: assignment!.class_id,
      subjectId: assignment!.subject_id,
      termId,
      title: newTitle,
    }),
    onSuccess: () => {
      setNewTitle('')
      invalidateTopics()
    },
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: Partial<Pick<CurriculumTopic, 'title' | 'note' | 'taught_on'>> }) => updateCurriculumTopic(id, changes),
    onSuccess: () => {
      setEditingId(null)
      invalidateTopics()
    },
  })
  const submitMutation = useMutation({
    mutationFn: ({ id, taughtOn }: { id: string; taughtOn: string }) => submitCurriculumTopic(id, taughtOn),
    onSuccess: invalidateTopics,
  })
  const deleteMutation = useMutation({
    mutationFn: deleteCurriculumTopic,
    onSuccess: () => {
      invalidateTopics()
      setTopicToDelete(null)
    },
  })

  const selectedTerm = terms.find((term) => term.id === termId)
  const termLabel = selectedTerm ? `${selectedTerm.name} · ${selectedTerm.academic_year}` : 'Select a term'

  if (isTermsLoading) return <LoadingState label="Loading academic terms..." />

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-600">Curriculum progress</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-900">Topics taught</h2>
            <p className="mt-1 max-w-xl text-sm text-slate-500">Add the topics you plan to teach, then tick them off as each one is completed.</p>
          </div>
          <div className="rounded-xl bg-rose-50 px-4 py-3 text-right">
            <p className="text-xs font-medium text-rose-700">Current progress</p>
            <p className="mt-1 text-2xl font-bold text-rose-700">{completionRate}%</p>
            <p className="text-xs text-rose-600">{completedCount} of {topics.length} topics</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Academic term
            <select value={termId} onChange={(event) => setTermId(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100">
              {terms.map((term) => <option key={term.id} value={term.id}>{term.name} · {term.academic_year}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Class and subject
            <select value={assignmentId} onChange={(event) => setAssignmentId(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100">
              {assignments.map((item) => <option key={item.id} value={item.id}>{item.class_name} · {item.subject_name}</option>)}
            </select>
          </label>
        </div>
      </div>

      {!assignments.length ? (
        <EmptyState title="No teaching assignments" message="Your administrator needs to assign a class and subject before you can record topics." />
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-rose-600" />
              <div>
                <h3 className="font-semibold text-slate-900">{assignment?.class_name} · {assignment?.subject_name}</h3>
                <p className="text-xs text-slate-500">{termLabel}</p>
              </div>
            </div>
            <form onSubmit={(event) => { event.preventDefault(); if (newTitle.trim()) addMutation.mutate() }} className="mt-4 flex gap-2">
              <input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="Add a topic, for example: Fractions" maxLength={200} className="h-11 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100" />
              <button type="submit" disabled={!newTitle.trim() || addMutation.isPending} className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50">
                {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add topic
              </button>
            </form>
            {addMutation.isError && <p className="mt-2 text-xs text-rose-600">Could not add the topic. It may already exist for this class, subject, and term.</p>}
          </div>

          {isTopicsLoading ? <LoadingState label="Loading topics..." /> : isError ? <EmptyState title="Topics could not load" message="Refresh the page and try again." /> : topics.length === 0 ? <EmptyState title="No topics yet" message="Add your first topic above to start tracking this subject." /> : (
            <div className="divide-y divide-slate-100">
              {topics.map((topic) => <TopicRow key={topic.id} topic={topic} editingId={editingId} setEditingId={setEditingId} isSubmitting={submitMutation.isPending} onUpdate={(changes) => updateMutation.mutate({ id: topic.id, changes })} onSubmit={() => submitMutation.mutate({ id: topic.id, taughtOn: topic.taught_on ?? new Date().toISOString().slice(0, 10) })} onDelete={() => setTopicToDelete(topic)} />)}
            </div>
          )}
        </div>
      )}

      {topicToDelete && (
        <ConfirmDialog
          title="Delete topic?"
          message={`This will permanently remove "${topicToDelete.title}" from ${assignment?.class_name ?? 'this class'} for ${assignment?.subject_name ?? 'this subject'}. This action cannot be undone.`}
          confirmLabel="Delete topic"
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setTopicToDelete(null)}
        />
      )}
    </div>
  )
}

function TopicRow({ topic, editingId, setEditingId, isSubmitting, onUpdate, onSubmit, onDelete }: { topic: CurriculumTopic; editingId: string | null; setEditingId: (id: string | null) => void; isSubmitting: boolean; onUpdate: (changes: Partial<Pick<CurriculumTopic, 'title' | 'note' | 'taught_on'>>) => void; onSubmit: () => void; onDelete: () => void }) {
  const [title, setTitle] = useState(topic.title)
  const [note, setNote] = useState(topic.note ?? '')
  const isEditing = editingId === topic.id

  useEffect(() => { setTitle(topic.title); setNote(topic.note ?? '') }, [topic.title, topic.note])

  return (
    <div className={`p-4 sm:p-5 ${topic.completed ? 'bg-emerald-50/30' : ''}`}>
      <div className="flex items-start gap-3">
        <button type="button" onClick={onSubmit} disabled={topic.approval_status === 'pending_approval' || topic.approval_status === 'approved' || isSubmitting} aria-label="Submit topic for approval" className={`mt-1 flex h-6 w-6 flex-none items-center justify-center rounded-md border ${topic.approval_status === 'approved' ? 'border-emerald-500 bg-emerald-500 text-white' : topic.approval_status === 'pending_approval' ? 'border-amber-400 bg-amber-100 text-amber-700' : 'border-slate-300 bg-white text-transparent hover:border-rose-400'}`}><Check className="h-4 w-4" /></button>
        <div className="min-w-0 flex-1">
          {isEditing ? <input value={title} onChange={(event) => setTitle(event.target.value)} onBlur={() => { if (title.trim()) onUpdate({ title: title.trim() }) }} maxLength={200} className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-sm font-semibold text-slate-900 focus:border-rose-400 focus:outline-none" /> : <button type="button" onClick={() => setEditingId(topic.id)} className={`text-left text-sm font-semibold ${topic.completed ? 'text-slate-500 line-through' : 'text-slate-900'}`}>{topic.title}</button>}
          <div className="mt-2 grid gap-2 sm:grid-cols-[150px_1fr]">
            <input type="date" value={topic.taught_on ?? ''} onChange={(event) => onUpdate({ taught_on: event.target.value || null })} aria-label={`Date taught for ${topic.title}`} className="h-9 rounded-lg border border-slate-200 px-2 text-xs text-slate-600 focus:border-rose-400 focus:outline-none" />
            <input value={isEditing ? note : topic.note ?? ''} onFocus={() => setEditingId(topic.id)} onChange={(event) => setNote(event.target.value)} onBlur={() => { if (isEditing) onUpdate({ note: note.trim() || null }) }} placeholder="Add a short note" maxLength={2000} className="h-9 rounded-lg border border-slate-200 px-2.5 text-xs text-slate-600 focus:border-rose-400 focus:outline-none" />
          </div>
          <p className={`mt-2 text-xs ${topic.approval_status === 'pending_approval' ? 'font-semibold text-amber-700' : topic.approval_status === 'approved' ? 'text-emerald-700' : topic.approval_status === 'disapproved' ? 'text-red-600' : 'text-slate-500'}`}>{topic.approval_status === 'approved' ? 'Approved and counted as taught.' : topic.approval_status === 'pending_approval' ? 'Waiting for admin approval.' : topic.approval_status === 'disapproved' ? `Disapproved${topic.approval_comment ? `: ${topic.approval_comment}` : ''}. Update and resubmit.` : 'Not submitted for approval.'}</p>
        </div>
        <button type="button" onClick={onDelete} aria-label={`Delete ${topic.title}`} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
      </div>
    </div>
  )
}

function LoadingState({ label }: { label: string }) { return <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />{label}</div> }
function EmptyState({ title, message }: { title: string; message: string }) { return <div className="p-10 text-center"><p className="text-sm font-semibold text-slate-700">{title}</p><p className="mt-1 text-xs text-slate-500">{message}</p></div> }
