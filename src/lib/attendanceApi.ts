import { supabase } from './supabaseClient'
import {
  AttendanceGridRow,
  AttendanceStatus,
  AttendanceSummaryRow,
  ClassRoom,
  ClassTeacherAssignment,
} from '../types'

export const ATTENDANCE_STATUSES: { value: AttendanceStatus; label: string }[] = [
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
  { value: 'late', label: 'Late' },
  { value: 'half_day', label: 'Half-Day' },
  { value: 'excused', label: 'Excused' },
];

export function normalizeClassId(rawId: string): string {
  return rawId
}


// ------------------------------------------------------------
// Class teacher assignment (admin-only setup)
// ------------------------------------------------------------
export async function fetchClassTeacherAssignments(): Promise<ClassTeacherAssignment[]> {
  const { data, error } = await supabase
    .from('classes')
    .select('id, name, class_teacher_id, profiles ( full_name )')

  if (error) throw error

  const rows = data as unknown as Array<{
    id: string
    name: string
    class_teacher_id: string | null
    profiles: { full_name: string } | null
  }>

  return rows.map((r) => ({
    class_id: r.id,
    class_name: r.name,
    teacher_id: r.class_teacher_id,
    teacher_name: r.profiles?.full_name ?? null,
  }))
}

export async function setClassTeacher(classId: string, teacherId: string | null): Promise<void> {
  const { error } = await supabase
    .from('classes')
    .update({ class_teacher_id: teacherId })
    .eq('id', classId)

  if (error) throw error
}


// A teacher's own view of which class(es) they are the class
// teacher for — usually zero or one, occasionally more.
export async function fetchMyClassTeacherClasses(teacherId: string): Promise<ClassRoom[]> {
  const { data, error } = await supabase
    .from('classes')
    .select('id, name')
    .eq('class_teacher_id', teacherId)
    .order('name')

  if (error) throw error
  return (data ?? []) as ClassRoom[]
}

// ------------------------------------------------------------
// Marking attendance for one class + one date
// ------------------------------------------------------------
export async function fetchAttendanceGrid(params: {
  classId: string
  date: string // 'YYYY-MM-DD'
}): Promise<AttendanceGridRow[]> {
  const [studentsResult, attendanceResult] = await Promise.all([
    supabase.from('students').select('id, full_name').eq('class_id', params.classId).order('full_name'),
    supabase
      .from('attendance_records')
      .select('student_id, status')
      .eq('class_id', params.classId)
      .eq('date', params.date),
  ])

  if (studentsResult.error) throw studentsResult.error
  if (attendanceResult.error) throw attendanceResult.error

  const statusByStudent = new Map<string, AttendanceStatus>(
    (attendanceResult.data ?? []).map((r) => [r.student_id as string, r.status as AttendanceStatus]),
  )

  return (studentsResult.data ?? []).map((s) => ({
    student_id: s.id,
    full_name: s.full_name,
    status: statusByStudent.get(s.id) ?? null,
  }))
}

export async function saveAttendance(params: {
  schoolId: string
  classId: string
  date: string
  markedBy: string
  rows: { student_id: string; status: AttendanceStatus }[]
}): Promise<void> {
  if (params.rows.length === 0) return

  const payload = params.rows.map((r) => ({
    school_id: params.schoolId,
    student_id: r.student_id,
    class_id: params.classId,
    date: params.date,
    status: r.status,
    marked_by: params.markedBy,
    updated_at: new Date().toISOString(),
  }))

  const { error } = await supabase
    .from('attendance_records')
    .upsert(payload, { onConflict: 'student_id,date' })

  if (error) throw error
}

// ------------------------------------------------------------
// Reports: aggregated summary (for the on-screen table + PDF) and
// raw register rows (for CSV export)
// ------------------------------------------------------------
export async function fetchAttendanceSummary(params: {
  classId: string
  dateFrom: string
  dateTo: string
}): Promise<AttendanceSummaryRow[]> {
  const [studentsResult, recordsResult] = await Promise.all([
    supabase.from('students').select('id, full_name').eq('class_id', params.classId).order('full_name'),
    supabase
      .from('attendance_records')
      .select('student_id, status')
      .eq('class_id', params.classId)
      .gte('date', params.dateFrom)
      .lte('date', params.dateTo),
  ])

  if (studentsResult.error) throw studentsResult.error
  if (recordsResult.error) throw recordsResult.error

  const counts = new Map<string, Record<AttendanceStatus, number>>()
  for (const s of studentsResult.data ?? []) {
    counts.set(s.id, { present: 0, absent: 0, late: 0, half_day: 0, excused: 0 })
  }
  for (const r of recordsResult.data ?? []) {
    const entry = counts.get(r.student_id)
    if (entry) entry[r.status as AttendanceStatus] += 1
  }

  return (studentsResult.data ?? []).map((s) => {
    const c = counts.get(s.id)!
    return {
      student_id: s.id,
      full_name: s.full_name,
      present: c.present,
      absent: c.absent,
      late: c.late,
      half_day: c.half_day,
      excused: c.excused,
    }
  })
}

export interface AttendanceRegisterRow {
  student_name: string
  date: string
  status: AttendanceStatus
}

export async function fetchAttendanceRegister(params: {
  classId: string
  dateFrom: string
  dateTo: string
}): Promise<AttendanceRegisterRow[]> {
  const { data, error } = await supabase
    .from('attendance_records')
    .select('date, status, students ( full_name )')
    .eq('class_id', params.classId)
    .gte('date', params.dateFrom)
    .lte('date', params.dateTo)
    .order('date')

  if (error) throw error

  const rows = data as unknown as Array<{
    date: string
    status: AttendanceStatus
    students: { full_name: string } | null
  }>

  return rows.map((r) => ({
    student_name: r.students?.full_name ?? 'Unknown',
    date: r.date,
    status: r.status,
  }))
}
