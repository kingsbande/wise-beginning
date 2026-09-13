import { supabase } from './supabaseClient'

export interface AcademicClassSummary {
  classId: string
  className: string
  averageScore: number
  gradedCount: number
}

export interface AcademicSubjectSummary {
  subjectId: string
  subjectName: string
  averageScore: number
  gradedCount: number
}

export interface AcademicGradeBand {
  label: string
  count: number
}

export interface StudentPerformanceSummary {
  studentId: string
  studentName: string
  admissionNumber: string
  classId: string
  className: string
  averageScore: number
  gradedCount: number
}

export interface SubjectTopStudent {
  subjectId: string
  subjectName: string
  topStudentName: string
  topStudentScore: number
  topStudentClass: string
}

export interface StudentSubjectGradeRecord {
  studentId: string
  studentName: string
  admissionNumber: string
  classId: string
  className: string
  subjectId: string
  subjectName: string
  score: number
}

export interface AdminAcademicAnalytics {
  averageScore: number
  gradedCount: number
  classSummaries: AcademicClassSummary[]
  subjectSummaries: AcademicSubjectSummary[]
  gradeBands: AcademicGradeBand[]
  topStudents: StudentPerformanceSummary[]
  lowestStudents: StudentPerformanceSummary[]
  subjectTopStudents: SubjectTopStudent[]
  allStudentPerformances: StudentPerformanceSummary[]
  allSubjectGrades: StudentSubjectGradeRecord[]
}

interface GradeRow {
  score: number
  subject_id: string
  student_id: string
}

interface StudentRow {
  id: string
  full_name: string
  admission_number: string | null
  class_id: string
}

interface NamedRow {
  id: string
  name: string
}

const GRADE_BANDS = [
  { label: '80-100', min: 80 },
  { label: '70-79', min: 70 },
  { label: '60-69', min: 60 },
  { label: '50-59', min: 50 },
  { label: '0-49', min: 0 },
]

export async function fetchAdminAcademicAnalytics(
  schoolId: string,
  termId: string,
): Promise<AdminAcademicAnalytics> {
  const [gradesResult, studentsResult, classesResult, subjectsResult] = await Promise.all([
    supabase
      .from('grades')
      .select('score, subject_id, student_id')
      .eq('school_id', schoolId)
      .eq('term_id', termId),
    supabase
      .from('students')
      .select('id, full_name, admission_number, class_id')
      .eq('school_id', schoolId),
    supabase.from('classes').select('id, name').eq('school_id', schoolId),
    supabase.from('subjects').select('id, name').eq('school_id', schoolId),
  ])

  if (gradesResult.error) throw gradesResult.error
  if (studentsResult.error) throw studentsResult.error
  if (classesResult.error) throw classesResult.error
  if (subjectsResult.error) throw subjectsResult.error

  const grades = (gradesResult.data ?? []) as GradeRow[]
  const students = (studentsResult.data ?? []) as StudentRow[]
  const classes = (classesResult.data ?? []) as NamedRow[]
  const subjects = (subjectsResult.data ?? []) as NamedRow[]

  const classNames = new Map(classes.map((item) => [item.id, item.name]))
  const subjectNames = new Map(subjects.map((item) => [item.id, item.name]))
  const studentMap = new Map(students.map((item) => [item.id, item]))

  const classScores = new Map<string, number[]>()
  const subjectScores = new Map<string, number[]>()
  const studentScoresMap = new Map<string, number[]>()
  const subjectBestScoresMap = new Map<string, { studentId: string; score: number }>()

  const bands = GRADE_BANDS.map((band) => ({ label: band.label, count: 0 }))

  for (const grade of grades) {
    const score = Number(grade.score)
    if (!Number.isFinite(score)) continue

    const student = studentMap.get(grade.student_id)
    if (student?.class_id) {
      classScores.set(student.class_id, [...(classScores.get(student.class_id) ?? []), score])
    }

    subjectScores.set(grade.subject_id, [...(subjectScores.get(grade.subject_id) ?? []), score])
    studentScoresMap.set(grade.student_id, [...(studentScoresMap.get(grade.student_id) ?? []), score])

    // Track highest scoring student per subject
    const currentBest = subjectBestScoresMap.get(grade.subject_id)
    if (!currentBest || score > currentBest.score) {
      subjectBestScoresMap.set(grade.subject_id, { studentId: grade.student_id, score })
    }

    const band = bands.find((_, index) => score >= GRADE_BANDS[index].min)
    if (band) band.count += 1
  }

  const average = (scores: number[]) =>
    scores.length === 0 ? 0 : Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10

  const toClassSummary = ([classId, scores]: [string, number[]]): AcademicClassSummary => ({
    classId,
    className: classNames.get(classId) ?? 'Unknown class',
    averageScore: average(scores),
    gradedCount: scores.length,
  })

  const toSubjectSummary = ([subjectId, scores]: [string, number[]]): AcademicSubjectSummary => ({
    subjectId,
    subjectName: subjectNames.get(subjectId) ?? 'Unknown subject',
    averageScore: average(scores),
    gradedCount: scores.length,
  })

  // Build student performance list
  const allStudentPerformances: StudentPerformanceSummary[] = Array.from(studentScoresMap.entries())
    .map(([studentId, scores]) => {
      const student = studentMap.get(studentId)
      return {
        studentId,
        studentName: student?.full_name ?? 'Unknown Student',
        admissionNumber: student?.admission_number ?? 'N/A',
        classId: student?.class_id ?? '',
        className: student?.class_id ? classNames.get(student.class_id) ?? 'Unknown Class' : 'Unassigned',
        averageScore: average(scores),
        gradedCount: scores.length,
      }
    })
    .sort((a, b) => b.averageScore - a.averageScore)

  const topStudents = allStudentPerformances.slice(0, 5)
  const lowestStudents = [...allStudentPerformances]
    .filter((s) => s.gradedCount > 0)
    .sort((a, b) => a.averageScore - b.averageScore)
    .slice(0, 5)

  // Build subject champions list
  const subjectTopStudents: SubjectTopStudent[] = Array.from(subjectBestScoresMap.entries()).map(
    ([subjectId, best]) => {
      const student = studentMap.get(best.studentId)
      return {
        subjectId,
        subjectName: subjectNames.get(subjectId) ?? 'Unknown Subject',
        topStudentName: student?.full_name ?? 'Unknown Student',
        topStudentScore: best.score,
        topStudentClass: student?.class_id ? classNames.get(student.class_id) ?? 'Unknown Class' : 'N/A',
      }
    },
  )

  // Build complete list of individual subject grades
  const allSubjectGrades: StudentSubjectGradeRecord[] = grades
    .map((grade) => {
      const score = Number(grade.score)
      if (!Number.isFinite(score)) return null
      const student = studentMap.get(grade.student_id)
      if (!student) return null
      return {
        studentId: student.id,
        studentName: student.full_name,
        admissionNumber: student.admission_number ?? 'N/A',
        classId: student.class_id ?? '',
        className: student.class_id ? classNames.get(student.class_id) ?? 'Unknown Class' : 'Unassigned',
        subjectId: grade.subject_id,
        subjectName: subjectNames.get(grade.subject_id) ?? 'Unknown Subject',
        score,
      }
    })
    .filter((g): g is StudentSubjectGradeRecord => g !== null)
    .sort((a, b) => b.score - a.score)

  return {
    averageScore: average(grades.map((grade) => Number(grade.score)).filter(Number.isFinite)),
    gradedCount: grades.length,
    classSummaries: Array.from(classScores.entries()).map(toClassSummary).sort((a, b) => b.averageScore - a.averageScore),
    subjectSummaries: Array.from(subjectScores.entries()).map(toSubjectSummary).sort((a, b) => b.averageScore - a.averageScore),
    gradeBands: bands,
    topStudents,
    lowestStudents,
    subjectTopStudents,
    allStudentPerformances,
    allSubjectGrades,
  }
}
