import { supabase } from './supabaseClient'

export interface AcademicYearRecord {
  id: string
  school_id: string
  label: string
  start_date: string | null
  end_date: string | null
}

export interface CalendarTermRecord {
  id: string
  school_id: string
  academic_year: string
  name: string
  academic_year_id: string | null
  term_order: number | null
  start_date: string | null
  end_date: string | null
}

export interface AcademicYearTermInput {
  term_order: 1 | 2 | 3
  term_id: string | null
  start_date: string
  end_date: string
}

export async function fetchAcademicYears(schoolId: string): Promise<AcademicYearRecord[]> {
  const { data, error } = await supabase
    .from('academic_years')
    .select('id, school_id, label, start_date, end_date')
    .eq('school_id', schoolId)
    .order('label', { ascending: false })

  if (error) throw new Error(`Failed to load academic years: ${error.message}`)
  return (data ?? []) as AcademicYearRecord[]
}

export async function fetchCalendarTerms(schoolId: string): Promise<CalendarTermRecord[]> {
  const { data, error } = await supabase
    .from('terms')
    .select('id, school_id, academic_year, name, academic_year_id, term_order, start_date, end_date')
    .eq('school_id', schoolId)
    .order('academic_year', { ascending: false })
    .order('name')

  if (error) throw new Error(`Failed to load terms for calendar setup: ${error.message}`)
  return (data ?? []) as CalendarTermRecord[]
}

export async function saveSchoolAcademicYear(input: {
  academicYearId: string | null
  label: string
  startDate: string
  endDate: string
  terms: AcademicYearTermInput[]
}): Promise<string> {
  const { data, error } = await supabase.rpc('save_school_academic_year', {
    p_academic_year_id: input.academicYearId,
    p_label: input.label.trim(),
    p_start_date: input.startDate,
    p_end_date: input.endDate,
    p_terms: input.terms,
  })

  if (error) throw new Error(`Failed to save academic calendar: ${error.message}`)
  if (typeof data !== 'string') {
    throw new Error('Academic calendar save returned an unexpected result.')
  }
  return data
}
