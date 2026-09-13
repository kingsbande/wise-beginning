import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchStudentsPage } from '../../lib/queries'
import { fetchClassWeeklyReviews, upsertWeeklyReview, WeeklyPerformanceReview } from '../../lib/reviewsApi'
import { useAuth } from '../../context/AuthContext'
import { Save, CheckCircle2 } from 'lucide-react'

// Helper to get nearest Monday
function getMonday(d: Date) {
    const date = new Date(d)
    const day = date.getDay()
    const diff = date.getDate() - day + (day === 0 ? -6 : 1) // adjust when day is sunday
    return new Date(date.setDate(diff)).toISOString().split('T')[0]
}

export function TeacherReviewsView({ distinctClasses }: { distinctClasses: { id: string; name: string }[] }) {
    const { profile } = useAuth()
    const [classId, setClassId] = useState(distinctClasses[0]?.id || '')
    const [weekStart, setWeekStart] = useState(getMonday(new Date()))

    // Sync initial class selection
    useEffect(() => {
        if (!classId && distinctClasses.length > 0) {
            setClassId(distinctClasses[0].id)
        }
    }, [distinctClasses, classId])

    const { data: rosterData, isLoading: isRosterLoading } = useQuery({
        queryKey: ['teacher-class-roster-nopagination', classId],
        queryFn: () =>
            fetchStudentsPage({
                page: 0,
                search: '',
                classId: classId,
                dateJoinedFrom: '',
                status: 'active',
                // In a real app we'd fetch all without pagination, but for now we assume 50 students fit.
            }),
        enabled: !!classId,
    })

    const { data: weeklyReviews = [], isLoading: isReviewsLoading } = useQuery({
        queryKey: ['weekly-reviews', classId, weekStart],
        queryFn: () => fetchClassWeeklyReviews(classId, weekStart),
        enabled: !!classId,
    })

    const students = rosterData?.students || []

    return (
        <div className="space-y-4 sm:space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900 sm:text-xl">Weekly Performance Reviews</h2>
                        <p className="text-xs text-slate-500 sm:text-sm">
                            Write short performance updates for students to keep parents informed weekly.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2">
                            <label htmlFor="review-class" className="text-xs font-semibold text-slate-600">
                                Class:
                            </label>
                            <select
                                id="review-class"
                                value={classId}
                                onChange={(e) => setClassId(e.target.value)}
                                className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm text-slate-700 outline-none transition focus:border-rose-400 focus:ring-1 focus:ring-rose-400"
                            >
                                {distinctClasses.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flex items-center gap-2">
                            <label htmlFor="review-week" className="text-xs font-semibold text-slate-600">
                                Week Start (Mon):
                            </label>
                            <input
                                id="review-week"
                                type="date"
                                value={weekStart}
                                onChange={(e) => setWeekStart(e.target.value)}
                                className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm text-slate-700 outline-none transition focus:border-rose-400 focus:ring-1 focus:ring-rose-400"
                            />
                        </div>
                    </div>
                </div>

                <div className="mt-6 flex flex-col gap-4">
                    {isRosterLoading || isReviewsLoading ? (
                        <p className="text-sm text-slate-500">Loading student roster and reviews...</p>
                    ) : students.length === 0 ? (
                        <p className="text-sm text-slate-500">No students found in this class.</p>
                    ) : (
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                            {students.map((student) => {
                                const existingReview = weeklyReviews.find((r) => r.student_id === student.id)
                                return (
                                    <ReviewCard
                                        key={student.id}
                                        student={student}
                                        existingReview={existingReview}
                                        classId={classId}
                                        weekStart={weekStart}
                                        teacherId={profile!.id}
                                        schoolId={profile!.school_id}
                                    />
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

function ReviewCard({
    student,
    existingReview,
    classId,
    weekStart,
    teacherId,
    schoolId,
}: {
    student: any
    existingReview?: WeeklyPerformanceReview
    classId: string
    weekStart: string
    teacherId: string
    schoolId: string
}) {
    const queryClient = useQueryClient()
    const [text, setText] = useState(existingReview?.review_text || '')

    // Sync state if remote data changes
    useEffect(() => {
        setText(existingReview?.review_text || '')
    }, [existingReview])

    const mutation = useMutation({
        mutationFn: () =>
            upsertWeeklyReview({
                school_id: schoolId,
                student_id: student.id,
                teacher_id: teacherId,
                class_id: classId,
                week_start_date: weekStart,
                review_text: text,
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['weekly-reviews', classId, weekStart] })
        },
    })

    // Has changes if text is not empty, and doesn't exactly match the existing.
    // Or it's empty but previously there was something (though we might not want to save empty, let's just say disabled if empty)
    const isDirty = text !== (existingReview?.review_text || '')
    const canSave = isDirty && text.trim().length > 0

    return (
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 shadow-sm transition hover:bg-slate-50">
            <div className="mb-2 flex items-center justify-between">
                <p className="font-semibold text-slate-900">{student.full_name}</p>
                {existingReview && !isDirty && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" />
                        Saved
                    </span>
                )}
            </div>
            <textarea
                rows={2}
                placeholder="Write weekly review..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="w-full resize-none rounded-lg border border-slate-300 p-2 text-sm text-slate-700 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
            <div className="mt-2 flex flex-col items-end gap-2">
                <button
                    onClick={() => mutation.mutate()}
                    disabled={!canSave || mutation.isPending}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Save className="h-3.5 w-3.5" />
                    {mutation.isPending ? 'Saving...' : 'Save Review'}
                </button>
                {mutation.isError && (
                    <span className="text-xs text-red-500 max-w-sm text-right">
                        Error: {(mutation.error as Error).message}
                    </span>
                )}
            </div>
        </div>
    )
}
