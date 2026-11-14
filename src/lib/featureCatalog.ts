import type { FeatureName } from '../context/FeaturesContext'

export const FEATURE_CATALOG: { name: FeatureName; label: string; description: string }[] = [
  { name: 'attendance', label: 'Attendance', description: 'Daily attendance marking and reports' },
  { name: 'grades', label: 'Grades', description: 'Grade entry, report cards and grade viewing' },
  { name: 'progress_reports', label: 'Progress reports', description: 'Progress report comments and PDF' },
  { name: 'fees', label: 'Fees', description: 'Fee setup, balances and payments' },
  { name: 'curriculum_topics', label: 'Curriculum topics', description: 'Topics taught and their verification' },
  { name: 'weekly_reviews', label: 'Weekly reviews', description: 'Weekly performance reviews written by teachers and shown to parents' },
  { name: 'analytics', label: 'Analytics', description: 'School-wide analytics and charts' },
  { name: 'parent_portal', label: 'Parent portal', description: 'Parent accounts and the parent dashboard' },
  { name: 'weekly_assessments', label: 'Weekly assessments', description: 'Weekly assessment scores and academic progress' },
  { name: 'promotions', label: 'Student progression', description: 'End-of-year promotion runs (needs Grades)' },
  { name: 'staff_records', label: 'Staff records', description: 'Teacher HR details and certifications' },
  { name: 'sms_notifications', label: 'SMS notifications (on hold)', description: 'Registration SMS to parents' },
]

export type PlanPreset = 'basic' | 'standard' | 'full'

// Starting points only. SMS stays off in every plan while that feature is on hold.
export const PLAN_PRESETS: Record<PlanPreset, FeatureName[]> = {
  basic: ['attendance', 'grades', 'progress_reports'],
  standard: ['attendance', 'grades', 'progress_reports', 'fees', 'curriculum_topics', 'weekly_reviews', 'parent_portal'],
  full: [
    'attendance',
    'grades',
    'progress_reports',
    'fees',
    'curriculum_topics',
    'weekly_reviews',
    'analytics',
    'parent_portal',
    'weekly_assessments',
    'promotions',
    'staff_records',
  ],
}

export function featureMap(enabled: FeatureName[]): Record<FeatureName, boolean> {
  const map = {} as Record<FeatureName, boolean>
  for (const feature of FEATURE_CATALOG) {
    map[feature.name] = enabled.includes(feature.name)
  }
  return map
}
