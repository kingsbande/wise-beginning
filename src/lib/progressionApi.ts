import { supabase } from './supabaseClient'

export interface ProgressionTerm {
  id: string
  academic_year: string
  name: string
}

export interface PromotionRun {
  id: string
  source_academic_year: string
  target_academic_year: string
  final_term_id: string
  minimum_average: number
  status: 'review' | 'approved' | 'cancelled'
  created_at: string
}

export type PromotionOutcome = 'promote' | 'retain' | 'manual_review' | 'graduate' | 'exclude'

export interface PromotionDecision {
  id: string
  student_id: string
  student_name: string
  admission_number: string
  source_class_name: string
  destination_class_name: string | null
  average_score: number | null
  missing_subject_count: number
  outcome: PromotionOutcome
  reason: string
}

export async function fetchProgressionTerms(): Promise<ProgressionTerm[]> {
  const { data, error } = await supabase
    .from('terms')
    .select('id, academic_year, name')
    .order('academic_year', { ascending: false })
    .order('name')

  if (error) throw error
  return (data ?? []) as ProgressionTerm[]
}

export async function fetchPromotionRuns(): Promise<PromotionRun[]> {
  const { data, error } = await supabase
    .from('promotion_runs')
    .select('id, source_academic_year, target_academic_year, final_term_id, minimum_average, status, created_at')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as PromotionRun[]
}

export async function createPromotionRun(params: {
  sourceAcademicYear: string
  targetAcademicYear: string
  finalTermId: string
  minimumAverage: number
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_promotion_run', {
    p_source_academic_year: params.sourceAcademicYear,
    p_target_academic_year: params.targetAcademicYear,
    p_final_term_id: params.finalTermId,
    p_minimum_average: params.minimumAverage,
  })

  if (error) throw error
  return data as string
}

export async function fetchPromotionDecisions(runId: string): Promise<PromotionDecision[]> {
  const { data: decisions, error: decisionsError } = await supabase
    .from('promotion_decisions')
    .select(
      'id, student_id, source_class_id, destination_class_id, average_score, missing_subject_count, outcome, reason',
    )
    .eq('promotion_run_id', runId)
    .order('outcome')

  if (decisionsError) throw decisionsError

  const rows = (decisions ?? []) as Array<{
    id: string
    student_id: string
    source_class_id: string
    destination_class_id: string | null
    average_score: number | null
    missing_subject_count: number
    outcome: PromotionOutcome
    reason: string
  }>
  const studentIds = [...new Set(rows.map((row) => row.student_id))]
  const classIds = [
    ...new Set(rows.flatMap((row) => [row.source_class_id, row.destination_class_id].filter(Boolean) as string[])),
  ]

  const [{ data: students, error: studentsError }, { data: classes, error: classesError }] = await Promise.all([
    supabase.from('students').select('id, full_name, admission_number').in('id', studentIds),
    supabase.from('classes').select('id, name').in('id', classIds),
  ])

  if (studentsError) throw studentsError
  if (classesError) throw classesError

  const studentById = new Map((students ?? []).map((student) => [student.id, student]))
  const classById = new Map((classes ?? []).map((classRow) => [classRow.id, classRow.name]))

  return rows.map((row) => ({
    ...row,
    student_name: studentById.get(row.student_id)?.full_name ?? 'Unknown student',
    admission_number: studentById.get(row.student_id)?.admission_number ?? '-',
    source_class_name: classById.get(row.source_class_id) ?? 'Unknown class',
    destination_class_name: row.destination_class_id ? classById.get(row.destination_class_id) ?? null : null,
  }))
}