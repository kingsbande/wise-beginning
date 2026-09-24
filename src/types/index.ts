export type UserRole = 'admin' | 'headteacher' | 'teacher'

export type StudentStatus = 'active' | 'withdrawn' | 'graduated' | 'transferred'

export interface Profile {
  id: string
  full_name: string
  role: UserRole
  school_id: string
  school_name: string
  school_logo_url: string | null
  school_registration_terms: string | null
  avatar_url: string | null // NEW
  must_change_password: boolean
  username: string | null // NEW
  is_active: boolean
}

export interface ParentAccount {
  id: string
  school_id: string
  full_name: string
  username: string
  phone: string | null
  is_active: boolean
  must_change_password: boolean
  created_at: string
}

export interface Subject {
  id: string
  name: string
}

export interface Term {
  id: string
  academic_year: string
  name: string
}

export type AssessmentType = 'midterm' | 'end_of_term'

export interface GradeScaleBand {
  min_score: number
  max_score: number
  letter: string
}

export interface ProgressReportField {
  id: string
  label: string
  sort_order: number
}

export interface GradeRelease {
  id: string
  class_id: string
  term_id: string
  released_at: string
}

export interface ClassRoom {
  id: string
  name: string // e.g. "Standard 1", "Form 2"
}

export interface Student {
  id: string
  admission_number: string
  full_name: string
  date_of_birth: string
  age: number | null
  gender: 'male' | 'female'
  class_id: string
  class_name?: string // joined in for display
  parent_name: string
  parent_phone: string
  parent_occupation: string | null
  health_notes: string | null
  former_school: string | null
  pickup_person: string | null
  location: string | null
  address: string | null
  academic_year: string
  date_joined: string
  government_code: string | null
  photo_url: string | null
  parent_account_id: string | null
  status: StudentStatus // NEW
  status_changed_at: string // NEW
  created_at: string
}

export interface NewStudentInput {
  full_name: string
  date_of_birth: string
  age: number | ''
  gender: 'male' | 'female'
  class_id: string
  parent_name: string
  parent_phone: string
  parent_occupation: string
  health_notes: string
  former_school: string
  pickup_person: string
  location: string
  address: string
  academic_year: string
  date_joined: string
  government_code: string
  photo_url: string | null
}

export interface TeacherDetails {
  id: string
  date_of_birth: string | null
  national_id: string | null
  home_address: string | null
  personal_phone: string | null
  personal_email: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  highest_degree: string | null
  major: string | null
  resume_summary: string | null
  employee_id: string | null
  date_of_hire: string | null
  contract_type: 'full_time' | 'part_time' | 'substitute' | null
  salary_grade: string | null
}

export interface TeacherCertification {
  id: string
  teacher_id: string
  title: string
  issuing_body: string | null
  issued_date: string | null
  expiry_date: string | null
}

export interface TeacherAssignment {
  id: string
  teacher_id: string
  class_id: string
  subject_id: string
  class_name: string
  subject_name: string
}

export interface CurriculumTopic {
  id: string
  school_id: string
  teacher_id: string
  class_id: string
  subject_id: string
  term_id: string
  title: string
  note: string | null
  taught_on: string | null
  completed: boolean
  approval_status: CurriculumTopicApprovalStatus
  approval_comment: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export type CurriculumTopicApprovalStatus = 'not_started' | 'pending_approval' | 'approved' | 'disapproved'

export interface CurriculumTopicProgress {
  school_id: string
  term_id: string
  teacher_id: string
  teacher_name: string
  class_id: string
  class_name: string
  subject_id: string
  subject_name: string
  total_topics: number
  completed_topics: number
  completion_rate: number
}

export interface StaffMember {
  id: string
  full_name: string
  role: 'teacher' | 'headteacher'
  avatar_url: string | null
  created_at: string
  is_active: boolean
}

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'half_day' | 'excused'

export interface AttendanceGridRow {
  student_id: string
  full_name: string
  status: AttendanceStatus | null
}

export interface ClassTeacherAssignment {
  class_id: string
  class_name: string
  teacher_id: string | null
  teacher_name: string | null
}

export interface AttendanceSummaryRow {
  student_id: string
  full_name: string
  present: number
  absent: number
  late: number
  half_day: number
  excused: number
}

export interface FeeCategory {
  id: string
  name: string
  is_flexible: boolean
}

export interface FeeStructure {
  id: string
  class_id: string
  class_name: string
  fee_category_id: string
  fee_category_name: string
  term_id: string
  term_name: string
  amount: number
}

export interface FeeCharge {
  id: string
  student_id: string
  fee_category_id: string
  term_id: string
  amount_due: number
}

export interface FeePayment {
  id: string
  fee_charge_id: string
  amount: number
  payment_date: string
  method: string | null
  note: string | null
  created_at: string
}

// One row per category+term for a single student — used in the
// admin "Record Payments" panel and the parent portal Fees tab.
export interface StudentFeeSummaryRow {
  fee_charge_id: string
  category_name: string
  term_name: string
  amount_due: number
  amount_paid: number
  balance: number
}

// One row per student — used in the admin "Balances" overview list.
export interface FeeBalanceRow {
  student_id: string
  full_name: string
  admission_number: string
  class_name: string
  total_due: number
  total_paid: number
  total_balance: number
}
