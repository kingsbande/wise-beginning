import { supabase } from './supabaseClient'

export interface WeeklyPerformanceReview {
  id: string
  school_id: string
  student_id: string
  teacher_id: string
  class_id: string
  week_start_date: string
  review_text: string
  created_at: string
  updated_at: string
}

export async function fetchClassWeeklyReviews(classId: string, weekStartDate: string) {
  const { data, error } = await supabase
    .from('weekly_performance_reviews')
    .select('*')
    .eq('class_id', classId)
    .eq('week_start_date', weekStartDate)

  if (error) {
    if (error.code === 'PGRST116') return []
    throw new Error(`Failed to fetch class weekly reviews: ${error.message}`)
  }

  return (data || []) as WeeklyPerformanceReview[]
}

export async function fetchStudentWeeklyReviews(studentId: string) {
  const { data, error } = await supabase
    .from('weekly_performance_reviews')
    .select(`
      *,
      teacher:profiles ( full_name )
    `)
    .eq('student_id', studentId)
    .order('week_start_date', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch student weekly reviews: ${error.message}`)
  }

  return (data || []) as (WeeklyPerformanceReview & { teacher: { full_name: string } })[]
}

export async function upsertWeeklyReview({
  school_id,
  student_id,
  teacher_id,
  class_id,
  week_start_date,
  review_text,
}: {
  school_id: string
  student_id: string
  teacher_id: string
  class_id: string
  week_start_date: string
  review_text: string
}) {
  // First, check if one already exists
  const { data: existing } = await supabase
    .from('weekly_performance_reviews')
    .select('id')
    .eq('student_id', student_id)
    .eq('week_start_date', week_start_date)
    .maybeSingle()

  if (existing) {
    const { data, error } = await supabase
      .from('weekly_performance_reviews')
      .update({ review_text, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single()

    if (error) throw new Error(`Failed to update review: ${error.message}`)
    return data as WeeklyPerformanceReview
  } else {
    const { data, error } = await supabase
      .from('weekly_performance_reviews')
      .insert({
        school_id,
        student_id,
        teacher_id,
        class_id,
        week_start_date,
        review_text,
      })
      .select()
      .single()

    if (error) throw new Error(`Failed to insert review: ${error.message}`)
    return data as WeeklyPerformanceReview
  }
}

export async function fetchAllReviewsForClass(classId: string, weekStartDate: string) {
  const { data, error } = await supabase
    .from('weekly_performance_reviews')
    .select(`
      *,
      student:students ( full_name ),
      teacher:profiles ( full_name )
    `)
    .eq('class_id', classId)
    .eq('week_start_date', weekStartDate)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`Failed to fetch reviews: ${error.message}`)

  return (data || []) as (WeeklyPerformanceReview & {
    student: { full_name: string }
    teacher: { full_name: string }
  })[]
}
