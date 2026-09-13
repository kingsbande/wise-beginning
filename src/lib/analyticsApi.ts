import { supabase } from './supabaseClient'

export interface AdminAnalyticsKpis {
  activeStudents: number
  markedToday: number
  presentToday: number
  absentToday: number
  lateToday: number
  otherToday: number
  totalDue: number
  totalCollected: number
}

export interface AttendanceTrendDay {
  date: string
  present: number
  absent: number
  late: number
  other: number
  marked: number
}

export interface AttendanceClassSummary {
  classId: string
  className: string
  marked: number
  absent: number
  attendanceRate: number
}

function todayInLocalTime(): string {
  const now = new Date()
  const offset = now.getTimezoneOffset()
  return new Date(now.getTime() - offset * 60 * 1000).toISOString().slice(0, 10)
}

export async function fetchAdminAnalyticsKpis(schoolId: string): Promise<AdminAnalyticsKpis> {
  const today = todayInLocalTime()
  const [studentsResult, attendanceResult, chargesResult, paymentsResult] = await Promise.all([
    supabase
      .from('students')
      .select('*', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('status', 'active'),
    supabase
      .from('attendance_records')
      .select('status')
      .eq('school_id', schoolId)
      .eq('date', today),
    supabase.from('fee_charges').select('amount_due').eq('school_id', schoolId),
    supabase.from('fee_payments').select('amount').eq('school_id', schoolId),
  ])

  if (studentsResult.error) throw studentsResult.error
  if (attendanceResult.error) throw attendanceResult.error
  if (chargesResult.error) throw chargesResult.error
  if (paymentsResult.error) throw paymentsResult.error

  const attendance = attendanceResult.data ?? []
  const totalDue = (chargesResult.data ?? []).reduce((sum, row) => sum + Number(row.amount_due), 0)
  const totalCollected = (paymentsResult.data ?? []).reduce((sum, row) => sum + Number(row.amount), 0)
  const presentToday = attendance.filter((row) => row.status === 'present').length
  const absentToday = attendance.filter((row) => row.status === 'absent').length
  const lateToday = attendance.filter((row) => row.status === 'late').length

  return {
    activeStudents: studentsResult.count ?? 0,
    markedToday: attendance.length,
    presentToday,
    absentToday,
    lateToday,
    otherToday: attendance.length - presentToday - absentToday - lateToday,
    totalDue,
    totalCollected,
  }
}

export async function fetchAdminAttendanceTrend(
  schoolId: string,
  dateFrom: string,
  dateTo: string,
): Promise<{ days: AttendanceTrendDay[]; classes: AttendanceClassSummary[] }> {
  const [recordsResult, classesResult] = await Promise.all([
    supabase
      .from('attendance_records')
      .select('date, status, class_id')
      .eq('school_id', schoolId)
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .order('date'),
    supabase.from('classes').select('id, name').eq('school_id', schoolId).order('name'),
  ])

  if (recordsResult.error) throw recordsResult.error
  if (classesResult.error) throw classesResult.error

  const days = new Map<string, AttendanceTrendDay>()
  const classes = new Map<string, { marked: number; absent: number }>()

  for (const record of recordsResult.data ?? []) {
    const day = days.get(record.date) ?? { date: record.date, present: 0, absent: 0, late: 0, other: 0, marked: 0 }
    day.marked += 1
    if (record.status === 'present') day.present += 1
    else if (record.status === 'absent') day.absent += 1
    else if (record.status === 'late') day.late += 1
    else day.other += 1
    days.set(record.date, day)

    const summary = classes.get(record.class_id) ?? { marked: 0, absent: 0 }
    summary.marked += 1
    if (record.status === 'absent') summary.absent += 1
    classes.set(record.class_id, summary)
  }

  const classNames = new Map((classesResult.data ?? []).map((item) => [item.id, item.name]))
  return {
    days: Array.from(days.values()),
    classes: Array.from(classes.entries())
      .map(([classId, summary]) => ({
        classId,
        className: classNames.get(classId) ?? 'Unknown class',
        marked: summary.marked,
        absent: summary.absent,
        attendanceRate: summary.marked === 0 ? 0 : Math.round(((summary.marked - summary.absent) / summary.marked) * 100),
      }))
      .sort((a, b) => a.attendanceRate - b.attendanceRate),
  }
}
