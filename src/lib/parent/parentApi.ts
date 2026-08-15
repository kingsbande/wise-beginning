import { supabase } from '../supabaseClient'
import { AssessmentType, ProgressReportField, Subject } from '../../types'

export interface MyStudent {
  id: string
  full_name: string
  admission_number: string
  class_id: string
  class_name: string
  photo_url: string | null
}

export async function fetchMyStudent(studentId: string): Promise<MyStudent | null> {
  const { data, error } = await supabase
    .from('students')
    .select('id, full_name, admission_number, class_id, photo_url, classes ( name )')
    .eq('id', studentId)
    .single()

  if (error) throw error
  if (!data) return null

  const row = data as unknown as {
    id: string
    full_name: string
    admission_number: string
    class_id: string
    photo_url: string | null
    classes: { name: string } | null
  }

  return {
    id: row.id,
    full_name: row.full_name,
    admission_number: row.admission_number,
    class_id: row.class_id,
    class_name: row.classes?.name ?? 'Unassigned',
    photo_url: row.photo_url,
  }
}

export interface ReleasedTerm {
  term_id: string
  term_name: string
  academic_year: string
  released_at: string
}

// A term only shows up here once it has actually been released for
// this child's class — nothing pending is ever fetchable at all,
// enforced by the grade_releases RLS policy, not just hidden in the UI.
export async function fetchMyReleasedTerms(classId: string): Promise<ReleasedTerm[]> {
  const { data, error } = await supabase
    .from('grade_releases')
    .select('term_id, released_at, terms ( name, academic_year )')
    .eq('class_id', classId)
    .order('released_at', { ascending: false })

  if (error) throw error

  const rows = data as unknown as Array<{
    term_id: string
    released_at: string
    terms: { name: string; academic_year: string } | null
  }>

  return rows.map((r) => ({
    term_id: r.term_id,
    term_name: r.terms?.name ?? 'Term',
    academic_year: r.terms?.academic_year ?? '',
    released_at: r.released_at,
  }))
}

export async function fetchMySubjectsForClass(classId: string): Promise<Subject[]> {
  const { data, error } = await supabase
    .from('class_subjects')
    .select('subjects ( id, name )')
    .eq('class_id', classId)

  if (error) throw error

  const rows = data as unknown as Array<{ subjects: Subject | null }>
  return rows
    .map((r) => r.subjects)
    .filter((s): s is Subject => s !== null)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export interface MyGradeRow {
  subject_id: string
  subject_name: string
  score: number | null
}

export async function fetchMyGrades(params: {
  studentId: string
  termId: string
  assessmentType: AssessmentType
  subjects: Subject[]
}): Promise<MyGradeRow[]> {
  const { data, error } = await supabase
    .from('grades')
    .select('subject_id, score')
    .eq('student_id', params.studentId)
    .eq('term_id', params.termId)
    .eq('assessment_type', params.assessmentType)

  if (error) throw error

  const scoreBySubject = new Map<string, number>((data ?? []).map((g) => [g.subject_id, g.score]))

  return params.subjects.map((s) => ({
    subject_id: s.id,
    subject_name: s.name,
    score: scoreBySubject.get(s.id) ?? null,
  }))
}

export interface FullGradeRow {
  subject_id: string
  subject_name: string
  midterm: number | null
  end_of_term: number | null
}

// Used for the PDF download, which needs both assessment types at once.
export async function fetchMyFullGradeReport(params: {
  studentId: string
  termId: string
  subjects: Subject[]
}): Promise<FullGradeRow[]> {
  const { data, error } = await supabase
    .from('grades')
    .select('subject_id, assessment_type, score')
    .eq('student_id', params.studentId)
    .eq('term_id', params.termId)

  if (error) throw error

  const map = new Map<string, { midterm: number | null; end_of_term: number | null }>()
  for (const s of params.subjects) map.set(s.id, { midterm: null, end_of_term: null })

  for (const g of data ?? []) {
    const entry = map.get(g.subject_id)
    if (!entry) continue
    if (g.assessment_type === 'midterm') entry.midterm = g.score
    else entry.end_of_term = g.score
  }

  return params.subjects.map((s) => ({
    subject_id: s.id,
    subject_name: s.name,
    ...map.get(s.id)!,
  }))
}

export async function fetchMyProgressReportFields(): Promise<ProgressReportField[]> {
  const { data, error } = await supabase
    .from('progress_report_fields')
    .select('id, label, sort_order')
    .order('sort_order')
  if (error) throw error
  return (data ?? []) as ProgressReportField[]
}

export async function fetchMyProgressEntries(
  studentId: string,
  termId: string,
): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('progress_report_entries')
    .select('field_id, value')
    .eq('student_id', studentId)
    .eq('term_id', termId)

  if (error) throw error

  const values: Record<string, string> = {}
  for (const row of data ?? []) {
    values[row.field_id] = row.value ?? ''
  }
  return values
}
