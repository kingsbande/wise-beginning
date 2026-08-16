import { supabase } from '../supabaseClient'
import { StaffMember, TeacherAssignment, TeacherCertification, TeacherDetails } from '../../types'

// ------------------------------------------------------------
// Staff list (admin-only — see profiles_select_school_staff_admin
// in migration 0014)
// ------------------------------------------------------------
export async function fetchStaffList(): Promise<StaffMember[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, avatar_url, created_at')
    .in('role', ['teacher', 'headteacher'])
    .order('full_name')

  if (error) throw error
  return (data ?? []) as StaffMember[]
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
