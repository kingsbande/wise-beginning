import { supabase } from './supabaseClient'
import {
  AssessmentType,
  GradeRelease,
  GradeScaleBand,
  ProgressReportField,
  Subject,
  Term,
} from '../types'

// ------------------------------------------------------------
// Subjects
// ------------------------------------------------------------
export async function fetchSubjects(): Promise<Subject[]> {
  const { data, error } = await supabase.from('subjects').select('id, name').order('name')
  if (error) throw error
  return (data ?? []) as Subject[]
}

export async function addSubject(schoolId: string, name: string): Promise<void> {
  const { error } = await supabase.from('subjects').insert({ school_id: schoolId, name })
  if (error) throw error
}

export async function deleteSubject(id: string): Promise<void> {
  const { error } = await supabase.from('subjects').delete().eq('id', id)
  if (error) throw error
}

// ------------------------------------------------------------
// Class <-> Subject assignment
// ------------------------------------------------------------
export interface ClassSubjectLink {
  id: string
  class_id: string
  subject_id: string
}

export async function fetchClassSubjectLinks(): Promise<ClassSubjectLink[]> {
  const { data, error } = await supabase.from('class_subjects').select('id, class_id, subject_id')
  if (error) throw error
  return (data ?? []) as ClassSubjectLink[]
}

export async function fetchSubjectsForClass(classId: string): Promise<Subject[]> {
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

export async function assignSubjectToClass(classId: string, subjectId: string): Promise<void> {
  const { error } = await supabase
    .from('class_subjects')
    .insert({ class_id: classId, subject_id: subjectId })
  if (error) throw error
}

export async function unassignSubjectFromClass(classId: string, subjectId: string): Promise<void> {
  const { error } = await supabase
    .from('class_subjects')
    .delete()
    .eq('class_id', classId)
    .eq('subject_id', subjectId)
  if (error) throw error
}

// ------------------------------------------------------------
// Terms
// ------------------------------------------------------------
export async function fetchTerms(): Promise<Term[]> {
  const { data, error } = await supabase
    .from('terms')
    .select('id, academic_year, name')
    .order('academic_year', { ascending: false })
    .order('name')
  if (error) throw error
  return (data ?? []) as Term[]
}

export async function addTerm(schoolId: string, academicYear: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('terms')
    .insert({ school_id: schoolId, academic_year: academicYear, name })
  if (error) throw error
}

// ------------------------------------------------------------
// Grade scale (for computing letter grades client-side, so the
// same scale drives both the on-screen grid and the PDF without
// an extra round trip per cell)
// ------------------------------------------------------------
export async function fetchGradeScale(): Promise<GradeScaleBand[]> {
  const { data, error } = await supabase
    .from('grade_scale')
    .select('min_score, max_score, letter')
    .order('min_score', { ascending: false })
  if (error) throw error
  return (data ?? []) as GradeScaleBand[]
}

export function scoreToLetter(scale: GradeScaleBand[], score: number | null): string | null {
  if (score === null) return null
  const band = scale.find((b) => score >= b.min_score && score <= b.max_score)
  return band?.letter ?? null
}

// ------------------------------------------------------------
// Grades grid: one class + term + subject + assessment type at a
// time. Two independent queries (students, existing grades) run
// in parallel and get merged client-side, rather than a single
// slow query trying to do a filtered join.
// ------------------------------------------------------------
export interface GradeGridRow {
  student_id: string
  full_name: string
  score: number | null
}

export async function fetchGradeGrid(params: {
  classId: string
  termId: string
  subjectId: string
  assessmentType: AssessmentType
}): Promise<GradeGridRow[]> {
  const [studentsResult, gradesResult] = await Promise.all([
    supabase
      .from('students')
      .select('id, full_name')
      .eq('class_id', params.classId)
      .order('full_name'),
    supabase
      .from('grades')
      .select('student_id, score')
      .eq('term_id', params.termId)
      .eq('subject_id', params.subjectId)
      .eq('assessment_type', params.assessmentType),
  ])

  if (studentsResult.error) throw studentsResult.error
  if (gradesResult.error) throw gradesResult.error

  const scoreByStudent = new Map<string, number>(
    (gradesResult.data ?? []).map((g) => [g.student_id as string, g.score as number]),
  )

  return (studentsResult.data ?? []).map((s) => ({
    student_id: s.id,
    full_name: s.full_name,
    score: scoreByStudent.get(s.id) ?? null,
  }))
}

export async function saveGrades(params: {
  schoolId: string
  termId: string
  subjectId: string
  assessmentType: AssessmentType
  enteredBy: string
  rows: { student_id: string; score: number }[]
}): Promise<void> {
  if (params.rows.length === 0) return

  const payload = params.rows.map((r) => ({
    school_id: params.schoolId,
    student_id: r.student_id,
    subject_id: params.subjectId,
    term_id: params.termId,
    assessment_type: params.assessmentType,
    score: r.score,
    entered_by: params.enteredBy,
    updated_at: new Date().toISOString(),
  }))

  const { error } = await supabase
    .from('grades')
    .upsert(payload, { onConflict: 'student_id,subject_id,term_id,assessment_type' })

  if (error) throw error
}

// ------------------------------------------------------------
// Progress report fields (flexible, school-defined)
// ------------------------------------------------------------
export async function fetchProgressReportFields(): Promise<ProgressReportField[]> {
  const { data, error } = await supabase
    .from('progress_report_fields')
    .select('id, label, sort_order')
    .order('sort_order')
  if (error) throw error
  return (data ?? []) as ProgressReportField[]
}

export async function addProgressReportField(schoolId: string, label: string): Promise<void> {
  const existing = await fetchProgressReportFields()
  const nextOrder = existing.length === 0 ? 1 : Math.max(...existing.map((f) => f.sort_order)) + 1
  const { error } = await supabase
    .from('progress_report_fields')
    .insert({ school_id: schoolId, label, sort_order: nextOrder })
  if (error) throw error
}

export async function deleteProgressReportField(id: string): Promise<void> {
  const { error } = await supabase.from('progress_report_fields').delete().eq('id', id)
  if (error) throw error
}

// ------------------------------------------------------------
// Progress report entries grid: class + term, one column per
// school-defined field.
// ------------------------------------------------------------
export interface ProgressGridRow {
  student_id: string
  full_name: string
  values: Record<string, string> // field_id -> value
}

export async function fetchProgressGrid(params: {
  classId: string
  termId: string
}): Promise<ProgressGridRow[]> {
  const { data: students, error: studentsError } = await supabase
    .from('students')
    .select('id, full_name')
    .eq('class_id', params.classId)
    .order('full_name')

  if (studentsError) throw studentsError

  const studentIds = (students ?? []).map((s) => s.id)
  if (studentIds.length === 0) return []

  const { data: entries, error: entriesError } = await supabase
    .from('progress_report_entries')
    .select('student_id, field_id, value')
    .eq('term_id', params.termId)
    .in('student_id', studentIds)

  if (entriesError) throw entriesError

  const valuesByStudent = new Map<string, Record<string, string>>()
  for (const entry of entries ?? []) {
    const existing = valuesByStudent.get(entry.student_id) ?? {}
    existing[entry.field_id] = entry.value ?? ''
    valuesByStudent.set(entry.student_id, existing)
  }

  return (students ?? []).map((s) => ({
    student_id: s.id,
    full_name: s.full_name,
    values: valuesByStudent.get(s.id) ?? {},
  }))
}

export async function saveProgressEntries(params: {
  schoolId: string
  termId: string
  enteredBy: string
  rows: { student_id: string; field_id: string; value: string }[]
}): Promise<void> {
  if (params.rows.length === 0) return

  const payload = params.rows.map((r) => ({
    school_id: params.schoolId,
    student_id: r.student_id,
    term_id: params.termId,
    field_id: r.field_id,
    value: r.value,
    entered_by: params.enteredBy,
    updated_at: new Date().toISOString(),
  }))

  const { error } = await supabase
    .from('progress_report_entries')
    .upsert(payload, { onConflict: 'student_id,term_id,field_id' })

  if (error) throw error
}

// ------------------------------------------------------------
// View grades: pivoted grid (students x subjects) for a class +
// term, both assessment types + computed letter.
// ------------------------------------------------------------
export interface ViewGradeCell {
  midterm: number | null
  end_of_term: number | null
}

export interface ViewGradeRow {
  student_id: string
  full_name: string
  admission_number: string
  bySubject: Record<string, ViewGradeCell> // subject_id -> scores
}

export async function fetchViewGrid(params: {
  classId: string
  termId: string
}): Promise<{ subjects: Subject[]; rows: ViewGradeRow[] }> {
  const [studentsResult, subjects] = await Promise.all([
    supabase
      .from('students')
      .select('id, full_name, admission_number')
      .eq('class_id', params.classId)
      .order('full_name'),
    fetchSubjectsForClass(params.classId),
  ])

  if (studentsResult.error) throw studentsResult.error

  const students = studentsResult.data ?? []
  const studentIds = students.map((s) => s.id)
  const subjectIds = subjects.map((s) => s.id)

  let grades: Array<{ student_id: string; subject_id: string; assessment_type: string; score: number }> =
    []

  if (studentIds.length > 0 && subjectIds.length > 0) {
    const { data, error } = await supabase
      .from('grades')
      .select('student_id, subject_id, assessment_type, score')
      .eq('term_id', params.termId)
      .in('student_id', studentIds)
      .in('subject_id', subjectIds)

    if (error) throw error
    grades = data ?? []
  }

  const rows: ViewGradeRow[] = students.map((s) => {
    const bySubject: Record<string, ViewGradeCell> = {}
    for (const subject of subjects) {
      bySubject[subject.id] = { midterm: null, end_of_term: null }
    }
    for (const g of grades) {
      if (g.student_id !== s.id) continue
      if (!bySubject[g.subject_id]) continue
      if (g.assessment_type === 'midterm') bySubject[g.subject_id].midterm = g.score
      else bySubject[g.subject_id].end_of_term = g.score
    }
    return {
      student_id: s.id,
      full_name: s.full_name,
      admission_number: s.admission_number,
      bySubject,
    }
  })

  return { subjects, rows }
}

// ------------------------------------------------------------
// Release
// ------------------------------------------------------------
export async function fetchGradeRelease(classId: string, termId: string): Promise<GradeRelease | null> {
  const { data, error } = await supabase
    .from('grade_releases')
    .select('id, class_id, term_id, released_at')
    .eq('class_id', classId)
    .eq('term_id', termId)
    .maybeSingle()

  if (error) throw error
  return data as GradeRelease | null
}

export async function releaseGrades(params: {
  schoolId: string
  classId: string
  termId: string
  releasedBy: string
}): Promise<void> {
  const { error } = await supabase.from('grade_releases').upsert(
    {
      school_id: params.schoolId,
      class_id: params.classId,
      term_id: params.termId,
      released_by: params.releasedBy,
      released_at: new Date().toISOString(),
    },
    { onConflict: 'class_id,term_id' },
  )
  if (error) throw error
}

export async function fetchProgressEntriesForStudent(
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

// ------------------------------------------------------------
// School logo
// ------------------------------------------------------------
export async function updateSchoolLogo(schoolId: string, logoUrl: string): Promise<void> {
  const { error } = await supabase.from('schools').update({ logo_url: logoUrl }).eq('id', schoolId)
  if (error) throw error
}

export async function updateRegistrationTerms(schoolId: string, text: string): Promise<void> {
  const { error } = await supabase
    .from('schools')
    .update({ registration_terms: text })
    .eq('id', schoolId)
  if (error) throw error
}
