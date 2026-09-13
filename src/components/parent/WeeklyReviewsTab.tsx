import { useQuery } from '@tanstack/react-query'
import { fetchStudentWeeklyReviews } from '../../lib/reviewsApi'
import { CalendarClock } from 'lucide-react'

export function WeeklyReviewsTab({ student }: { student: any }) {
    const { data: reviews = [], isLoading } = useQuery({
        queryKey: ['weekly-reviews', student.id],
        queryFn: () => fetchStudentWeeklyReviews(student.id),
        enabled: !!student?.id,
    })

    const formatDate = (dateStr: string) => {
        return new Intl.DateTimeFormat('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        }).format(new Date(dateStr))
    }

    if (isLoading) {
        return <div className="py-8 text-center text-sm text-slate-500">Loading reviews...</div>
    }

    if (reviews.length === 0) {
        return (
            <div className="py-12 text-center">
                <CalendarClock className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-2 text-sm font-medium text-slate-700">No Weekly Reviews</p>
                <p className="mt-1 text-xs text-slate-500">
                    Your child's teacher hasn't published any weekly reviews yet.
                </p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="mb-4">
                <h3 className="text-lg font-bold text-slate-900">Weekly Performance Reviews</h3>
                <p className="text-sm text-slate-500">
                    Ongoing assessments from your child's teachers.
                </p>
            </div>
            <div className="space-y-4">
                {reviews.map((r) => (
                    <div key={r.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 shadow-sm transition hover:bg-slate-50">
                        <div className="flex flex-wrap items-center justify-between mb-3 border-b border-slate-200/60 pb-2">
                            <div>
                                <p className="text-sm font-semibold text-slate-900">
                                    Week of {formatDate(r.week_start_date)}
                                </p>
                                <p className="text-xs font-medium text-rose-600 mt-0.5 flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                    {r.teacher?.full_name || 'Class Teacher'}
                                </p>
                            </div>
                            <span className="text-xs text-slate-400">
                                Posted {formatDate(r.created_at)}
                            </span>
                        </div>
                        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                            {r.review_text}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    )
}
