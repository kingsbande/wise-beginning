import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchClasses } from '../../lib/queries'
import { fetchAllReviewsForClass } from '../../lib/reviewsApi'
import { CalendarClock, ChevronDown, MessageSquare } from 'lucide-react'

function getMonday(d: Date) {
    const date = new Date(d)
    const day = date.getDay()
    const diff = date.getDate() - day + (day === 0 ? -6 : 1)
    return new Date(date.setDate(diff)).toISOString().split('T')[0]
}

function formatDate(dateStr: string) {
    return new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    }).format(new Date(dateStr))
}

export function AdminReviewsView() {
    const [classId, setClassId] = useState('all')
    const [weekStart, setWeekStart] = useState(getMonday(new Date()))
    const [expandedId, setExpandedId] = useState<string | null>(null)

    const { data: classes = [], isLoading: isClassesLoading } = useQuery({
        queryKey: ['classes'],
        queryFn: fetchClasses,
    })

    const { data: reviews = [], isLoading: isReviewsLoading, isError, error } = useQuery({
        queryKey: ['admin-reviews', classId, weekStart],
        queryFn: () => fetchAllReviewsForClass(classId, weekStart),
        enabled: classId !== 'all',
    })

    return (
        <div className="space-y-4 sm:space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                {/* Header */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between border-b border-slate-100 pb-4 mb-6">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900 sm:text-xl">Weekly Performance Reviews</h2>
                        <p className="text-xs text-slate-500 sm:text-sm mt-0.5">
                            Browse teacher-submitted weekly reviews for any class and week.
                        </p>
                    </div>

                    {/* Filters */}
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2">
                            <label htmlFor="admin-review-class" className="text-xs font-semibold text-slate-600 whitespace-nowrap">
                                Class:
                            </label>
                            <div className="relative">
                                <select
                                    id="admin-review-class"
                                    value={classId}
                                    onChange={(e) => setClassId(e.target.value)}
                                    className="appearance-none rounded-lg border border-slate-300 bg-slate-50 pl-3 pr-8 py-1.5 text-sm text-slate-700 outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-400"
                                >
                                    <option value="all">— Select a class —</option>
                                    {classes.map((c) => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <label htmlFor="admin-review-week" className="text-xs font-semibold text-slate-600 whitespace-nowrap">
                                Week (Mon):
                            </label>
                            <input
                                id="admin-review-week"
                                type="date"
                                value={weekStart}
                                onChange={(e) => setWeekStart(e.target.value)}
                                className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm text-slate-700 outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-400"
                            />
                        </div>
                    </div>
                </div>

                {/* Content */}
                {classId === 'all' ? (
                    <div className="py-12 text-center">
                        <CalendarClock className="mx-auto h-10 w-10 text-slate-300" />
                        <p className="mt-2 text-sm font-medium text-slate-700">Select a class to view reviews</p>
                        <p className="mt-1 text-xs text-slate-400">Choose a class and a week above to browse performance reviews.</p>
                    </div>
                ) : isReviewsLoading || isClassesLoading ? (
                    <p className="py-8 text-center text-sm text-slate-500">Loading reviews...</p>
                ) : isError ? (
                    <p className="py-8 text-center text-sm text-red-500">Error: {(error as Error).message}</p>
                ) : reviews.length === 0 ? (
                    <div className="py-12 text-center">
                        <MessageSquare className="mx-auto h-10 w-10 text-slate-300" />
                        <p className="mt-2 text-sm font-medium text-slate-700">No reviews this week</p>
                        <p className="mt-1 text-xs text-slate-400">
                            No teacher has submitted reviews for this class for the week of {formatDate(weekStart)}.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                            {reviews.length} review{reviews.length !== 1 ? 's' : ''} — Week of {formatDate(weekStart)}
                        </p>
                        {reviews.map((r) => {
                            const isExpanded = expandedId === r.id
                            return (
                                <button
                                    key={r.id}
                                    type="button"
                                    onClick={() => setExpandedId(isExpanded ? null : r.id)}
                                    className="w-full text-left rounded-xl border border-slate-200 bg-slate-50/60 p-4 shadow-sm transition hover:bg-slate-50 hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                                >
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-semibold text-slate-900 text-sm">{r.student?.full_name}</p>
                                            <p className="text-xs text-slate-500 mt-0.5">
                                                Reviewed by{' '}
                                                <span className="font-medium text-rose-600">{r.teacher?.full_name}</span>
                                            </p>
                                        </div>
                                        <ChevronDown
                                            className={`h-4 w-4 text-slate-400 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                        />
                                    </div>
                                    {isExpanded && (
                                        <p className="mt-3 pt-3 border-t border-slate-200 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                                            {r.review_text}
                                        </p>
                                    )}
                                </button>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}
