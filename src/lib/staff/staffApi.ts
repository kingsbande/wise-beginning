import { supabase } from '../supabaseClient'
import { StaffMember, TeacherAssignment, TeacherCertification, TeacherDetails } from '../../types'

// ------------------------------------------------------------
// Staff list (admin-only — see profiles_select_school_staff_admin
// in migration 0014)
// ------------------------------------------------------------
export async function fetchStaffList(): Promise<StaffMember[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, avatar_url, created_at, is_active')
    .in('role', ['teacher', 'headteacher'])
    .order('full_name')

  if (error) throw error
  return (data ?? []) as StaffMember[]
}

export async function toggleStaffAccountStatus(staffId: string, activate: boolean): Promise<void> {
  const { data, error } = await supabase.functions.invoke('toggle-staff-account-status', {
    body: { staff_id: staffId, activate },
  })
  if (error || data?.error) {
    throw new Error(await getFunctionErrorMessage(error, data?.error, 'Could not update staff account status'))
  }
}

export async function deleteStaffAccount(staffId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('delete-staff-account', {
    body: { staff_id: staffId },
  })
  if (error || data?.error) {
    const responseError = await getFunctionErrorResponse(error)
    const message = data?.error ?? responseError?.error ?? error?.message ?? 'Could not delete staff account'
    const references = Array.isArray(data?.references)
      ? data.references
      : Array.isArray(responseError?.references)
        ? responseError.references
        : []
    throw new Error(`${message}${references.length ? ` Referenced by: ${references.join(', ')}.` : ''}`)
  }
}

async function getFunctionErrorMessage(error: unknown, dataMessage: string | undefined, fallback: string) {
  const responseError = await getFunctionErrorResponse(error)
  return dataMessage ?? responseError?.error ?? (error instanceof Error ? error.message : fallback)
}

async function getFunctionErrorResponse(error: unknown): Promise<{ error?: string; references?: string[] } | null> {
  if (!error || typeof error !== 'object' || !('context' in error)) return null
  const context = (error as { context?: unknown }).context
  if (!(context instanceof Response)) return null

  try {
    return await context.clone().json() as { error?: string; references?: string[] }
  } catch {
    return null
  }
}

export async function fetchTeachersForAssignment(): Promise<{ id: string; full_name: string }[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('role', ['teacher', 'headteacher'])
    .order('full_name')

  if (error) throw error
  return data ?? []
}

// ------------------------------------------------------------
// Teacher details (personal + professional)
// ------------------------------------------------------------
export async function fetchTeacherDetails(teacherId: string): Promise<TeacherDetails | null> {
  const { data, error } = await supabase
    .from('teacher_details')
    .select(
      'id, date_of_birth, national_id, home_address, personal_phone, personal_email, emergency_contact_name, emergency_contact_phone, highest_degree, major, resume_summary, employee_id, date_of_hire, contract_type, salary_grade',
    )
    .eq('id', teacherId)
    .maybeSingle()

  if (error) throw error
  return data as TeacherDetails | null
}

export async function upsertTeacherDetails(
  schoolId: string,
  details: TeacherDetails,
): Promise<void> {
  const { error } = await supabase
    .from('teacher_details')
    .upsert({ ...details, school_id: schoolId, updated_at: new Date().toISOString() }, { onConflict: 'id' })

  if (error) throw error
}

// ------------------------------------------------------------
// Certifications
// ------------------------------------------------------------
export async function fetchTeacherCertifications(teacherId: string): Promise<TeacherCertification[]> {
  const { data, error } = await supabase
    .from('teacher_certifications')
    .select('id, teacher_id, title, issuing_body, issued_date, expiry_date')
    .eq('teacher_id', teacherId)
    .order('issued_date', { ascending: false })

  if (error) throw error
  return (data ?? []) as TeacherCertification[]
}

export async function addTeacherCertification(params: {
  schoolId: string
  teacherId: string
  title: string
  issuingBody: string
  issuedDate: string
  expiryDate: string
}): Promise<void> {
  const { error } = await supabase.from('teacher_certifications').insert({
    school_id: params.schoolId,
    teacher_id: params.teacherId,
    title: params.title,
    issuing_body: params.issuingBody || null,
    issued_date: params.issuedDate || null,
    expiry_date: params.expiryDate || null,
  })

  if (error) throw error
}

export async function deleteTeacherCertification(id: string): Promise<void> {
  const { error } = await supabase.from('teacher_certifications').delete().eq('id', id)
  if (error) throw error
}

// ------------------------------------------------------------
// Assignments (which class + subject a teacher teaches)
// ------------------------------------------------------------
export async function fetchTeacherAssignments(teacherId: string): Promise<TeacherAssignment[]> {
  const { data, error } = await supabase
    .from('teacher_assignments')
    .select('id, teacher_id, class_id, subject_id, classes ( name ), subjects ( name )')
    .eq('teacher_id', teacherId)

  if (error) throw error

  const rows = data as unknown as Array<{
    id: string
    teacher_id: string
    class_id: string
    subject_id: string
    classes: { name: string } | null
    subjects: { name: string } | null
  }>

  return rows.map((r) => ({
    id: r.id,
    teacher_id: r.teacher_id,
    class_id: r.class_id,
    subject_id: r.subject_id,
    class_name: r.classes?.name ?? 'Unknown class',
    subject_name: r.subjects?.name ?? 'Unknown subject',
  }))
}

export async function addTeacherAssignment(params: {
  schoolId: string
  teacherId: string
  classId: string
  subjectId: string
}): Promise<void> {
  const { error } = await supabase.from('teacher_assignments').insert({
    school_id: params.schoolId,
    teacher_id: params.teacherId,
    class_id: params.classId,
    subject_id: params.subjectId,
  })

  if (error) throw error
}

export async function removeTeacherAssignment(id: string): Promise<void> {
  const { error } = await supabase.from('teacher_assignments').delete().eq('id', id)
  if (error) throw error
}
