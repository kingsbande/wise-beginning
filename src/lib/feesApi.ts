import { supabase } from './supabaseClient'
import { fetchStudentsPage } from './queries'
import { FeeBalanceRow, FeeCategory, FeePayment, FeeStructure, StudentFeeSummaryRow } from '../types'

// ------------------------------------------------------------
// Categories
// ------------------------------------------------------------
export async function fetchFeeCategories(): Promise<FeeCategory[]> {
  const { data, error } = await supabase.from('fee_categories').select('id, name').order('name')
  if (error) throw error
  return (data ?? []) as FeeCategory[]
}

export async function addFeeCategory(schoolId: string, name: string): Promise<void> {
  const { error } = await supabase.from('fee_categories').insert({ school_id: schoolId, name })
  if (error) throw error
}

export async function deleteFeeCategory(id: string): Promise<void> {
  const { error } = await supabase.from('fee_categories').delete().eq('id', id)
  if (error) throw error
}

// ------------------------------------------------------------
// Structures — standard amount per class+category+term, used to
// bulk-generate charges rather than typing the same number in for
// every student individually.
// ------------------------------------------------------------
export async function fetchFeeStructures(): Promise<FeeStructure[]> {
  const { data, error } = await supabase
    .from('fee_structures')
    .select(
      'id, class_id, fee_category_id, term_id, amount, classes ( name ), fee_categories ( name ), terms ( name, academic_year )',
    )
    .order('created_at', { ascending: false })

  if (error) throw error

  const rows = data as unknown as Array<{
    id: string
    class_id: string
    fee_category_id: string
    term_id: string
    amount: number
    classes: { name: string } | null
    fee_categories: { name: string } | null
    terms: { name: string; academic_year: string } | null
  }>

  return rows.map((r) => ({
    id: r.id,
    class_id: r.class_id,
    class_name: r.classes?.name ?? 'Unknown',
    fee_category_id: r.fee_category_id,
    fee_category_name: r.fee_categories?.name ?? 'Unknown',
    term_id: r.term_id,
    term_name: `${r.terms?.name ?? 'Term'} (${r.terms?.academic_year ?? ''})`,
    amount: r.amount,
  }))
}

export async function upsertFeeStructure(params: {
  schoolId: string
  classId: string
  feeCategoryId: string
  termId: string
  amount: number
}): Promise<string> {
  const { data, error } = await supabase
    .from('fee_structures')
    .upsert(
      {
        school_id: params.schoolId,
        class_id: params.classId,
        fee_category_id: params.feeCategoryId,
        term_id: params.termId,
        amount: params.amount,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'class_id,fee_category_id,term_id' },
    )
    .select('id')
    .single()

  if (error) throw error
  return data.id
}

// Applies a structure's standard amount to every active student in
// that class. Re-running this resets any individually adjusted
// amount back to the standard rate — call adjustChargeAmount()
// afterward for one-off exceptions (scholarships, etc), not before.
export async function generateChargesFromStructure(
  structureId: string,
  schoolId: string,
): Promise<number> {
  const { data: structure, error: structureError } = await supabase
    .from('fee_structures')
    .select('class_id, fee_category_id, term_id, amount')
    .eq('id', structureId)
    .single()

  if (structureError) throw structureError

  const { data: students, error: studentsError } = await supabase
    .from('students')
    .select('id')
    .eq('class_id', structure.class_id)
    .eq('status', 'active')

  if (studentsError) throw studentsError
  if (!students || students.length === 0) return 0

  const payload = students.map((s) => ({
    school_id: schoolId,
    student_id: s.id,
    fee_category_id: structure.fee_category_id,
    term_id: structure.term_id,
    amount_due: structure.amount,
    updated_at: new Date().toISOString(),
  }))

  const { error: upsertError } = await supabase
    .from('fee_charges')
    .upsert(payload, { onConflict: 'student_id,fee_category_id,term_id' })

  if (upsertError) throw upsertError
  return students.length
}

// ------------------------------------------------------------
// Per-student fee summary — used by both the admin "Record
// Payments" panel and the parent portal Fees tab. Shows every
// category+term a student has a charge for, not just the current
// term, so payment history is visible going back.
// ------------------------------------------------------------
export async function fetchStudentFeeSummary(studentId: string): Promise<StudentFeeSummaryRow[]> {
  const { data: charges, error } = await supabase
    .from('fee_charges')
    .select('id, amount_due, fee_categories ( name ), terms ( name, academic_year )')
    .eq('student_id', studentId)

  if (error) throw error

  const rows = charges as unknown as Array<{
    id: string
    amount_due: number
    fee_categories: { name: string } | null
    terms: { name: string; academic_year: string } | null
  }>

  const chargeIds = rows.map((r) => r.id)
  let payments: { fee_charge_id: string; amount: number }[] = []

  if (chargeIds.length > 0) {
    const { data: paymentsData, error: paymentsError } = await supabase
      .from('fee_payments')
      .select('fee_charge_id, amount')
      .in('fee_charge_id', chargeIds)

    if (paymentsError) throw paymentsError
    payments = paymentsData ?? []
  }

  const paidByCharge = new Map<string, number>()
  for (const p of payments) {
    paidByCharge.set(p.fee_charge_id, (paidByCharge.get(p.fee_charge_id) ?? 0) + p.amount)
  }

  return rows.map((r) => {
    const paid = paidByCharge.get(r.id) ?? 0
    return {
      fee_charge_id: r.id,
      category_name: r.fee_categories?.name ?? 'Unknown',
      term_name: `${r.terms?.name ?? 'Term'} (${r.terms?.academic_year ?? ''})`,
      amount_due: r.amount_due,
      amount_paid: paid,
      balance: r.amount_due - paid,
    }
  })
}

export async function fetchPaymentHistory(feeChargeId: string): Promise<FeePayment[]> {
  const { data, error } = await supabase
    .from('fee_payments')
    .select('id, fee_charge_id, amount, payment_date, method, note, created_at')
    .eq('fee_charge_id', feeChargeId)
    .order('payment_date', { ascending: false })

  if (error) throw error
  return (data ?? []) as FeePayment[]
}

export async function recordPayment(params: {
  schoolId: string
  feeChargeId: string
  amount: number
  paymentDate: string
  method: string
  note: string
  recordedBy: string
}): Promise<FeePayment> {
  const { data, error } = await supabase
    .from('fee_payments')
    .insert({
      school_id: params.schoolId,
      fee_charge_id: params.feeChargeId,
      amount: params.amount,
      payment_date: params.paymentDate,
      method: params.method || null,
      note: params.note || null,
      recorded_by: params.recordedBy,
    })
    .select('id, fee_charge_id, amount, payment_date, method, note, created_at')
    .single()
  if (error) throw error
  return data as FeePayment
}

// For one-off manual adjustments (scholarship, mid-term joiner,
// correction) — separate from the bulk generate-from-structure flow.
export async function adjustChargeAmount(feeChargeId: string, newAmount: number): Promise<void> {
  const { data, error } = await supabase
    .from('fee_charges')
    .update({ amount_due: newAmount, updated_at: new Date().toISOString() })
    .eq('id', feeChargeId)
    .select('id')

  if (error) throw error
  // Same defensive check as setClassTeacher — an update RLS denies
  // silently affects zero rows with no error, so verify explicitly.
  if (!data || data.length === 0) {
    throw new Error('Could not update this charge — you may not have permission.')
  }
}

// ------------------------------------------------------------
// Balances overview (admin) — paginated via the existing student
// pagination, then charges/payments fetched ONLY for that page's
// students. Never loads the whole school's fee history to compute
// a list of numbers, regardless of how many students or how many
// years of payments exist.
// ------------------------------------------------------------
export async function fetchFeeBalancesPage(params: {
  page: number
  search: string
  classId: string
  termId: string
}): Promise<{ balances: FeeBalanceRow[]; total: number }> {
  const studentsPage = await fetchStudentsPage({
    page: params.page,
    search: params.search,
    classId: params.classId,
    dateJoinedFrom: '',
    status: 'active',
  })

  const studentIds = studentsPage.students.map((s) => s.id)
  if (studentIds.length === 0) {
    return { balances: [], total: studentsPage.total }
  }

  const { data: charges, error: chargesError } = await supabase
    .from('fee_charges')
    .select('id, student_id, amount_due')
    .eq('term_id', params.termId)
    .in('student_id', studentIds)

  if (chargesError) throw chargesError

  const chargeIds = (charges ?? []).map((c) => c.id)
  let payments: { fee_charge_id: string; amount: number }[] = []

  if (chargeIds.length > 0) {
    const { data: paymentsData, error: paymentsError } = await supabase
      .from('fee_payments')
      .select('fee_charge_id, amount')
      .in('fee_charge_id', chargeIds)

    if (paymentsError) throw paymentsError
    payments = paymentsData ?? []
  }

  const paidByCharge = new Map<string, number>()
  for (const p of payments) {
    paidByCharge.set(p.fee_charge_id, (paidByCharge.get(p.fee_charge_id) ?? 0) + p.amount)
  }

  const dueByStudent = new Map<string, number>()
  const paidByStudent = new Map<string, number>()
  for (const c of charges ?? []) {
    dueByStudent.set(c.student_id, (dueByStudent.get(c.student_id) ?? 0) + c.amount_due)
    paidByStudent.set(
      c.student_id,
      (paidByStudent.get(c.student_id) ?? 0) + (paidByCharge.get(c.id) ?? 0),
    )
  }

  const balances: FeeBalanceRow[] = studentsPage.students.map((s) => {
    const totalDue = dueByStudent.get(s.id) ?? 0
    const totalPaid = paidByStudent.get(s.id) ?? 0
    return {
      student_id: s.id,
      full_name: s.full_name,
      admission_number: s.admission_number,
      class_name: s.class_name ?? 'Unassigned',
      total_due: totalDue,
      total_paid: totalPaid,
      total_balance: totalDue - totalPaid,
    }
  })

  return { balances, total: studentsPage.total }
}
