import { supabase } from './supabaseClient'
import type {
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
    supabase.from('students').select('id, full_name').eq('class_id', params.classId).eq('status', 'active').order('full_name'),
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
  clearedStudentIds: string[]
}): Promise<{ savedCount: number; clearedCount: number }> {
  let savedCount = 0
  let clearedCount = 0

  if (params.rows.length > 0) {
    const payload = params.rows.map((row) => ({
      school_id: params.schoolId,
      student_id: row.student_id,
      class_id: params.classId,
      date: params.date,
      status: row.status,
      marked_by: params.markedBy,
      updated_at: new Date().toISOString(),
    }))

    const { error } = await runAttendanceRequest((signal) =>
      supabase
        .from('attendance_records')
        .upsert(payload, { onConflict: 'student_id,date' })
        .abortSignal(signal),
    )

    if (error) throw error
    savedCount = payload.length
  }

  if (params.clearedStudentIds.length > 0) {
    let result
    try {
      result = await runAttendanceRequest((signal) =>
        supabase
          .from('attendance_records')
          .delete()
          .eq('school_id', params.schoolId)
          .eq('class_id', params.classId)
          .eq('date', params.date)
          .in('student_id', params.clearedStudentIds)
          .select('student_id')
          .abortSignal(signal),
      )
    } catch (error) {
      const prefix = savedCount > 0
        ? 'Attendance marks were saved, but cleared records could not be removed: '
        : 'Cleared records could not be removed: '
      throw new Error(`${prefix}${getErrorMessage(error)}`)
    }

    if (result.error) {
      const prefix = savedCount > 0
        ? 'Attendance marks were saved, but cleared records could not be removed: '
        : 'Cleared records could not be removed: '
      throw new Error(`${prefix}${result.error.message}`)
    }
    clearedCount = result.data?.length ?? 0
    if (clearedCount !== params.clearedStudentIds.length) {
      const prefix = savedCount > 0
        ? 'Attendance marks were saved, but cleared records could not be removed: '
        : 'Cleared records could not be removed: '
      throw new Error(`${prefix}only ${clearedCount} of ${params.clearedStudentIds.length} selected marks were cleared.`)
    }
  }

  return { savedCount, clearedCount }
}

async function runAttendanceRequest<T>(
  request: (signal: AbortSignal) => PromiseLike<T>,
): Promise<T> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 30_000)
  try {
    const result = await request(controller.signal)
    if (controller.signal.aborted) throw new Error('The attendance request timed out.')
    return result
  } catch (error) {
    if (controller.signal.aborted) throw new Error('The attendance request timed out.')
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    return error.message
  }
  return 'Please refresh the register and try again.'
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
