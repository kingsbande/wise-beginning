import { supabase } from './supabaseClient'

export interface AcademicProgressClassOption {
  id: string
  name: string
}

export interface AcademicProgressStudentOption {
  id: string
  full_name: string
  admission_number: string | null
}

export interface AcademicProgressTermOption {
  id: string
  name: string
  academic_year: string
  academic_year_id: string | null
  yearLabel: string
  yearStartDate: string | null
  term_order: number | null
}

export interface AcademicProgressTrendPoint {
  label: string
  averageScore: number
  count: number
}

export interface AcademicProgressTermComparison {
  termId: string
  termName: string
  averageScore: number
  gradedCount: number
}

export interface AcademicProgressData {
  classOptions: AcademicProgressClassOption[]
  studentOptions: AcademicProgressStudentOption[]
  termOptions: AcademicProgressTermOption[]
  defaultClassId: string
  defaultStudentId: string | null
  defaultTermId: string
  weeklyTrend: AcademicProgressTrendPoint[]
  termComparison: AcademicProgressTermComparison[]
  currentTermAverage: number
  previousTermAverage: number
  changeFromPreviousTerm: number
  currentWeekAverage: number
  previousWeekAverage: number
  weekOverWeekChange: number
  classAverage: number
  studentAverage: number
  totalStudents: number
}

export type AcademicProgressAssessmentType = 'midterm' | 'end_of_term'

const PAGE_SIZE = 1000

function roundScore(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 10) / 10
}

function compareTerms(a: AcademicProgressTermOption, b: AcademicProgressTermOption) {
  if (a.yearStartDate && b.yearStartDate && a.yearStartDate !== b.yearStartDate) {
    return a.yearStartDate.localeCompare(b.yearStartDate)
  }

  const aYear = Number(a.yearLabel.match(/\d{4}/)?.[0] ?? 0)
  const bYear = Number(b.yearLabel.match(/\d{4}/)?.[0] ?? 0)
  if (aYear !== bYear) return aYear - bYear

  const aOrder = a.term_order ?? Number(a.name.match(/(?:term\s*)?([1-3])\b/i)?.[1] ?? Number.MAX_SAFE_INTEGER)
  const bOrder = b.term_order ?? Number(b.name.match(/(?:term\s*)?([1-3])\b/i)?.[1] ?? Number.MAX_SAFE_INTEGER)
  if (aOrder !== bOrder) return aOrder - bOrder
  return a.name.localeCompare(b.name)
}

interface GradeRow {
  student_id: string
  subject_id: string
  assessment_type: 'midterm' | 'end_of_term'
  score: number
  term_id: string
}

function averageAssessmentScores(
  rows: GradeRow[],
  assessmentType: AcademicProgressAssessmentType,
  selectedStudentId?: string,
): { average: number; count: number } {
  const scoresByStudentSubject = new Map<string, number>()

  for (const row of rows) {
    if (selectedStudentId && row.student_id !== selectedStudentId) continue
    if (row.assessment_type !== assessmentType) continue
    const key = `${row.student_id}:${row.subject_id}`
    const score = Number(row.score)
    if (!Number.isFinite(score)) continue
    scoresByStudentSubject.set(key, score)
  }

  const scores = Array.from(scoresByStudentSubject.values())

  return {
    average: scores.length
      ? roundScore(scores.reduce((sum, score) => sum + score, 0) / scores.length)
      : 0,
    count: scores.length,
  }
}

export async function fetchAcademicProgressData(params: {
  schoolId: string
  allowedClassIds?: string[]
  classId?: string
  studentId?: string
  termId?: string
  assessmentType?: AcademicProgressAssessmentType
  weeks?: number
}): Promise<AcademicProgressData> {
  const { schoolId, allowedClassIds, classId, studentId, termId, assessmentType = 'end_of_term', weeks = 5 } = params

  const classQuery = supabase.from('classes').select('id, name').eq('school_id', schoolId).order('name')
  if (allowedClassIds !== undefined) {
    if (allowedClassIds.length === 0) {
      return {
        classOptions: [],
        studentOptions: [],
        termOptions: [],
        defaultClassId: '',
        defaultStudentId: null,
        defaultTermId: '',
        weeklyTrend: [],
        termComparison: [],
        currentTermAverage: 0,
        previousTermAverage: 0,
        changeFromPreviousTerm: 0,
        currentWeekAverage: 0,
        previousWeekAverage: 0,
        weekOverWeekChange: 0,
        classAverage: 0,
        studentAverage: 0,
        totalStudents: 0,
      }
    }
    classQuery.in('id', allowedClassIds)
  }

  const [classesResult, termsResult] = await Promise.all([
    classQuery,
    supabase
      .from('terms')
      .select('id, name, academic_year, academic_year_id, term_order')
      .eq('school_id', schoolId)
      .order('academic_year', { ascending: false })
      .order('name'),
  ])

  if (classesResult.error) throw classesResult.error
  if (termsResult.error) throw termsResult.error

  const classOptions = (classesResult.data ?? []) as AcademicProgressClassOption[]
  const rawTerms = termsResult.data ?? []
  const academicYearIds = [...new Set(rawTerms.map((term) => term.academic_year_id).filter((id): id is string => id !== null))]
  const yearLabels = new Map<string, { label: string; startDate: string | null }>()
  if (academicYearIds.length > 0) {
    const { data: academicYears, error } = await supabase
      .from('academic_years')
      .select('id, label, start_date')
      .eq('school_id', schoolId)
      .in('id', academicYearIds)
    if (error) throw error
    for (const academicYear of academicYears ?? []) {
      yearLabels.set(academicYear.id, { label: academicYear.label, startDate: academicYear.start_date })
    }
  }
  const termOptions: AcademicProgressTermOption[] = rawTerms.map((term) => ({
    id: term.id,
    name: term.name,
    academic_year: term.academic_year,
    academic_year_id: term.academic_year_id,
    yearLabel: (term.academic_year_id && yearLabels.get(term.academic_year_id)?.label) || term.academic_year,
    yearStartDate: (term.academic_year_id && yearLabels.get(term.academic_year_id)?.startDate) || null,
    term_order: term.term_order,
  }))
  const sortedTerms = [...termOptions].sort(compareTerms)
  const mappedTerms = sortedTerms.filter((term) => term.academic_year_id !== null && term.term_order !== null)

  const defaultClassId = classId && classOptions.some((c) => c.id === classId) ? classId : classOptions[0]?.id ?? ''
  const classStudentsResult = defaultClassId
    ? await supabase
        .from('students')
        .select('id, full_name, admission_number')
        .eq('school_id', schoolId)
        .eq('class_id', defaultClassId)
        .order('full_name')
    : null

  if (classStudentsResult?.error) throw classStudentsResult.error

  const studentOptions = (classStudentsResult?.data ?? []) as AcademicProgressStudentOption[]
  const defaultStudentId = studentId && studentOptions.some((s) => s.id === studentId) ? studentId : null
  const defaultTermId =
    termId && sortedTerms.some((t) => t.id === termId)
      ? termId
      : mappedTerms[mappedTerms.length - 1]?.id ?? sortedTerms[sortedTerms.length - 1]?.id ?? ''

  let weeklyTrend: AcademicProgressTrendPoint[] = []
  let termComparison: AcademicProgressTermComparison[] = []
  let currentTermAverage = 0
  let previousTermAverage = 0
  let changeFromPreviousTerm = 0
  let currentWeekAverage = 0
  let previousWeekAverage = 0
  let weekOverWeekChange = 0
  let classAverage = 0
  let studentAverage = 0
  let totalStudents = studentOptions.length

  if (defaultClassId && defaultTermId) {
    const { data: assessments, error: assessmentsError } = await supabase
      .from('weekly_assessments')
      .select('id, week_number, assessment_date')
      .eq('school_id', schoolId)
      .eq('class_id', defaultClassId)
      .eq('term_id', defaultTermId)
      .eq('status', 'approved')
      .order('week_number', { ascending: true })
    if (assessmentsError) throw assessmentsError

    const assessmentIds = (assessments ?? []).map((entry) => entry.id)
    if (assessmentIds.length > 0) {
      const scoreRows: Array<{ weekly_assessment_id: string; student_id: string; score: number }> = []
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const { data: page, error } = await supabase
          .from('weekly_assessment_scores')
          .select('weekly_assessment_id, student_id, score')
          .in('weekly_assessment_id', assessmentIds)
          .range(offset, offset + PAGE_SIZE - 1)
        if (error) throw error
        scoreRows.push(...(page ?? []))
        if (!page || page.length < PAGE_SIZE) break
      }

      const assessmentMap = new Map((assessments ?? []).map((entry) => [entry.id, entry]))
      const filteredRows = scoreRows.filter((row) => {
        if (!defaultStudentId) return true
        return row.student_id === defaultStudentId
      })

      const weekMap = new Map<number, { total: number; count: number }>()
      for (const row of filteredRows) {
        const assessment = assessmentMap.get(row.weekly_assessment_id)
        if (!assessment || row.score === null) continue
        const bucket = weekMap.get(Number(assessment.week_number)) ?? { total: 0, count: 0 }
        bucket.total += Number(row.score)
        bucket.count += 1
        weekMap.set(Number(assessment.week_number), bucket)
      }

      const orderedWeeks = [...weekMap.entries()].sort((a, b) => a[0] - b[0]).slice(-weeks)
      weeklyTrend = orderedWeeks.map(([weekNumber, data]) => ({
        label: `Week ${weekNumber}`,
        averageScore: roundScore(data.total / data.count),
        count: data.count,
      }))

      if (weeklyTrend.length > 1) {
        const previous = weeklyTrend[weeklyTrend.length - 2]
        const latest = weeklyTrend[weeklyTrend.length - 1]
        previousWeekAverage = previous.averageScore
        currentWeekAverage = latest.averageScore
        weekOverWeekChange = roundScore(latest.averageScore - previous.averageScore)
      } else if (weeklyTrend.length === 1) {
        currentWeekAverage = weeklyTrend[0].averageScore
      }
    }

    const selectedTerm = sortedTerms.find((term) => term.id === defaultTermId)
    if (selectedTerm) {
      const selectedMappedTermIndex = mappedTerms.findIndex((term) => term.id === defaultTermId)
      const comparisonTerms =
        selectedMappedTermIndex >= 0
          ? mappedTerms.slice(Math.max(0, selectedMappedTermIndex - 4), selectedMappedTermIndex + 1)
          : [selectedTerm]
      const comparisonTermIds = comparisonTerms.map((term) => term.id)
      const classStudentIds = studentOptions.map((student) => student.id)
      const comparisonGradeRows: GradeRow[] = []
      if (classStudentIds.length > 0) {
        for (let offset = 0; ; offset += PAGE_SIZE) {
          const { data: page, error } = await supabase
            .from('grades')
            .select('student_id, subject_id, assessment_type, score, term_id')
            .eq('school_id', schoolId)
            .in('term_id', comparisonTermIds)
            .in('student_id', classStudentIds)
            .range(offset, offset + PAGE_SIZE - 1)
          if (error) throw error
          comparisonGradeRows.push(...((page ?? []) as GradeRow[]))
          if (!page || page.length < PAGE_SIZE) break
        }
      }

      const gradeRows = comparisonGradeRows
      const gradesByTerm = new Map<string, GradeRow[]>()
      for (const row of gradeRows) {
        const termGrades = gradesByTerm.get(row.term_id) ?? []
        termGrades.push(row)
        gradesByTerm.set(row.term_id, termGrades)
      }

      termComparison = comparisonTerms.map((term) => {
        const termGrades = gradesByTerm.get(term.id) ?? []
        const stats = averageAssessmentScores(termGrades, assessmentType, defaultStudentId ?? undefined)
        return {
          termId: term.id,
          termName: `${term.yearLabel} · ${term.name}`,
          averageScore: stats.average,
          gradedCount: stats.count,
        }
      })

      const currentTerm = selectedTerm
      const currentTermIndex = comparisonTerms.findIndex((term) => term.id === currentTerm.id)
      const previousTerm = comparisonTerms[currentTermIndex - 1]
      const currentTermGrades = gradesByTerm.get(currentTerm.id) ?? []
      const currentClassStats = averageAssessmentScores(currentTermGrades, assessmentType)
      const currentStats = averageAssessmentScores(currentTermGrades, assessmentType, defaultStudentId ?? undefined)
      classAverage = currentClassStats.average
      currentTermAverage = currentStats.average
      studentAverage = defaultStudentId ? currentStats.average : currentClassStats.average

      if (previousTerm) {
        const previousTermGrades = gradesByTerm.get(previousTerm.id) ?? []
        previousTermAverage = averageAssessmentScores(
          previousTermGrades,
          assessmentType,
          defaultStudentId ?? undefined,
        ).average
        changeFromPreviousTerm = roundScore(currentTermAverage - previousTermAverage)
      }
    }
  }

  return {
    classOptions,
    studentOptions,
    termOptions: sortedTerms,
    defaultClassId,
    defaultStudentId,
    defaultTermId,
    weeklyTrend,
    termComparison,
    currentTermAverage,
    previousTermAverage,
    changeFromPreviousTerm,
    currentWeekAverage,
    previousWeekAverage,
    weekOverWeekChange,
    classAverage,
    studentAverage,
    totalStudents,
  }
}
