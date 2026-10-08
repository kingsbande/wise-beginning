import { supabase } from './supabaseClient'
import { fetchStudentsPage, PAGE_SIZE } from './queries'
import { FeeBalanceDetailRow, FeeBalanceRow, FeeCategory, FeeCategoryItem, FeeCategoryItemCollection, FeePayment, FeeStructure, StudentFeeSummaryRow } from '../types'

// ------------------------------------------------------------
// Categories
// ------------------------------------------------------------
export async function fetchFeeCategories(): Promise<FeeCategory[]> {
  const { data, error } = await supabase
    .from('fee_categories')
    .select('id, name, is_flexible')
    .order('name')
  if (error) throw error
  return (data ?? []) as FeeCategory[]
}

export async function addFeeCategory(schoolId: string, name: string, isFlexible: boolean): Promise<string> {
  const { data, error } = await supabase
    .from('fee_categories')
    .insert({ school_id: schoolId, name, is_flexible: isFlexible })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function fetchFeeCategoryItems(feeCategoryId?: string): Promise<FeeCategoryItem[]> {
  let query = supabase
    .from('fee_category_items')
    .select('id, fee_category_id, name')
    .order('name')
  if (feeCategoryId) query = query.eq('fee_category_id', feeCategoryId)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as FeeCategoryItem[]
}

export async function addFeeCategoryItem(schoolId: string, feeCategoryId: string, name: string): Promise<void> {
  const { data: category, error: categoryError } = await supabase
    .from('fee_categories')
    .select('id')
    .eq('id', feeCategoryId)
    .eq('school_id', schoolId)
    .eq('is_flexible', true)
    .maybeSingle()
  if (categoryError) throw categoryError
  if (!category) throw new Error('Items can only be added to your school\'s flexible fee categories.')

  const { error } = await supabase
    .from('fee_category_items')
    .insert({ school_id: schoolId, fee_category_id: feeCategoryId, name: name.trim() })
  if (error) throw error
}

export async function deleteFeeCategoryItem(id: string): Promise<void> {
  const { error } = await supabase.from('fee_category_items').delete().eq('id', id)
  if (error) throw error
}

export async function fetchFeeCategoryItemCollections(params: {
  studentId: string
  feeCategoryId: string
  termId: string
}): Promise<FeeCategoryItemCollection[]> {
  const { data, error } = await supabase
    .from('fee_category_item_collections')
    .select('fee_category_item_id, item_name, is_collected, collected_at, updated_at, updated_by')
    .eq('student_id', params.studentId)
    .eq('fee_category_id', params.feeCategoryId)
    .eq('term_id', params.termId)

  if (error) throw error
  return (data ?? []) as FeeCategoryItemCollection[]
}

export async function setFeeCategoryItemCollected(params: {
  schoolId: string
  studentId: string
  feeCategoryId: string
  feeCategoryItemId: string
  itemName: string
  termId: string
  isCollected: boolean
  updatedBy: string
}): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('fee_category_item_collections')
    .upsert(
      {
        school_id: params.schoolId,
        student_id: params.studentId,
        fee_category_id: params.feeCategoryId,
        fee_category_item_id: params.feeCategoryItemId,
        item_name: params.itemName,
        term_id: params.termId,
        is_collected: params.isCollected,
        collected_at: params.isCollected ? now : null,
        updated_at: now,
        updated_by: params.updatedBy,
      },
      { onConflict: 'student_id,fee_category_item_id,term_id' },
    )
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
    .select('class_id, fee_category_id, term_id, amount, fee_categories ( is_flexible )')
    .eq('id', structureId)
    .single()

  if (structureError) throw structureError
  const category = structure.fee_categories as unknown as { is_flexible: boolean } | null
  if (category?.is_flexible) return 0

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

export async function applyFeeStructuresToStudent(params: {
  studentId: string
  classId: string
  schoolId: string
}): Promise<number> {
  const { data: structures, error: structuresError } = await supabase
    .from('fee_structures')
    .select('fee_category_id, term_id, amount, fee_categories ( is_flexible )')
    .eq('school_id', params.schoolId)
    .eq('class_id', params.classId)

  if (structuresError) throw structuresError
  const fixedStructures = (structures ?? []).filter((structure) => {
    const category = structure.fee_categories as unknown as { is_flexible: boolean } | null
    return !category?.is_flexible
  })
  if (fixedStructures.length === 0) return 0

  const payload = fixedStructures.map((structure) => ({
    school_id: params.schoolId,
    student_id: params.studentId,
    fee_category_id: structure.fee_category_id,
    term_id: structure.term_id,
    amount_due: structure.amount,
    updated_at: new Date().toISOString(),
  }))

  const { error: upsertError } = await supabase
    .from('fee_charges')
    .upsert(payload, { onConflict: 'student_id,fee_category_id,term_id' })

  if (upsertError) throw upsertError
  return fixedStructures.length
}

export async function recordFlexiblePayment(params: {
  schoolId: string
  studentId: string
  feeCategoryId: string
  termId: string
  totalDue?: number
  amount: number
  feeCategoryItemIds?: string[]
  paymentDate: string
  method: string
  note: string
  recordedBy: string
}): Promise<{ payment: FeePayment; charge: StudentFeeSummaryRow }> {
  const { data: category, error: categoryError } = await supabase
    .from('fee_categories')
    .select('id, is_flexible')
    .eq('id', params.feeCategoryId)
    .eq('school_id', params.schoolId)
    .single()

  if (categoryError) throw categoryError
  if (!category.is_flexible) throw new Error('Only flexible categories can be used for this payment.')

  const { data: categoryItems, error: itemsError } = await supabase
    .from('fee_category_items')
    .select('id, name')
    .eq('fee_category_id', params.feeCategoryId)
  if (itemsError) throw itemsError

  const selectedItemIds = [...new Set(params.feeCategoryItemIds ?? [])]
  if (categoryItems.length > 0 && selectedItemIds.length === 0) {
    throw new Error('Select at least one item this flexible payment is for.')
  }
  const selectedItems = (categoryItems ?? []).filter((item) => selectedItemIds.includes(item.id))
  if (selectedItems.length !== selectedItemIds.length) {
    throw new Error('One or more selected items do not belong to this fee category.')
  }

  const { data: existingCharge, error: chargeLookupError } = await supabase
    .from('fee_charges')
    .select('id, amount_due, fee_categories ( name ), terms ( name, academic_year )')
    .eq('student_id', params.studentId)
    .eq('fee_category_id', params.feeCategoryId)
    .eq('term_id', params.termId)
    .maybeSingle()

  if (chargeLookupError) throw chargeLookupError

  const amountDue = existingCharge?.amount_due ?? params.totalDue
  if (amountDue === undefined || amountDue <= 0) {
    throw new Error('Enter the total due amount for this flexible fee.')
  }
  if (amountDue < params.amount) {
    throw new Error('The payment amount cannot be greater than the total due.')
  }

  const paidBefore = existingCharge
    ? await getPaidAmount(existingCharge.id)
    : 0
  const { data: charge, error: chargeError } = await supabase
    .from('fee_charges')
    .upsert(
      {
        school_id: params.schoolId,
        student_id: params.studentId,
        fee_category_id: params.feeCategoryId,
        term_id: params.termId,
        amount_due: amountDue,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'student_id,fee_category_id,term_id' },
    )
    .select('id, amount_due, fee_categories ( name ), terms ( name, academic_year )')
    .single()

  if (chargeError) throw chargeError

  const payment = await recordPayment({
    schoolId: params.schoolId,
    feeChargeId: charge.id,
    amount: params.amount,
    paymentDate: params.paymentDate,
    method: params.method,
    note: params.note,
    recordedBy: params.recordedBy,
    paidForItems: selectedItems.map((item) => item.name),
  })

  const amountPaid = paidBefore + params.amount
  return {
    payment,
    charge: {
      fee_charge_id: charge.id,
      fee_category_id: params.feeCategoryId,
      category_name: (charge.fee_categories as unknown as { name: string } | null)?.name ?? 'Unknown',
      is_flexible: true,
      term_name: `${(charge.terms as unknown as { name: string; academic_year: string } | null)?.name ?? 'Term'} (${(charge.terms as unknown as { name: string; academic_year: string } | null)?.academic_year ?? ''})`,
      amount_due: Number(charge.amount_due),
      amount_paid: amountPaid,
      balance: Math.max(0, Number(charge.amount_due) - amountPaid),
    },
  }
}

async function getPaidAmount(feeChargeId: string): Promise<number> {
  const { data, error } = await supabase
    .from('fee_payments')
    .select('amount')
    .eq('fee_charge_id', feeChargeId)
    .is('reversed_at', null)
  if (error) throw error
  return (data ?? []).reduce((total, payment) => total + Number(payment.amount), 0)
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
    .select('id, amount_due, fee_categories ( id, name, is_flexible ), terms ( name, academic_year )')
    .eq('student_id', studentId)

  if (error) throw error

  const rows = charges as unknown as Array<{
    id: string
    amount_due: number
    fee_categories: { id: string; name: string; is_flexible: boolean } | null
    terms: { name: string; academic_year: string } | null
  }>

  const chargeIds = rows.map((r) => r.id)
  let payments: { fee_charge_id: string; amount: number }[] = []

  if (chargeIds.length > 0) {
    const { data: paymentsData, error: paymentsError } = await supabase
      .from('fee_payments')
      .select('fee_charge_id, amount')
      .in('fee_charge_id', chargeIds)
      .is('reversed_at', null)

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
      fee_category_id: r.fee_categories?.id ?? '',
      category_name: r.fee_categories?.name ?? 'Unknown',
      is_flexible: r.fee_categories?.is_flexible ?? false,
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
    .select('id, fee_charge_id, amount, payment_date, method, note, paid_for_items, created_at, recorded_by, reversed_at, reversed_by, reversal_reason, recorder:profiles!fee_payments_recorded_by_fkey(full_name), reverser:profiles!fee_payments_reversed_by_fkey(full_name)')
    .eq('fee_charge_id', feeChargeId)
    .order('payment_date', { ascending: false })

  if (error) throw error
  const rows = (data ?? []) as unknown as Array<FeePayment & {
    recorder: { full_name: string } | null
    reverser: { full_name: string } | null
  }>
  return rows.map(({ recorder, reverser, ...payment }) => ({
    ...payment,
    posted_by_name: recorder?.full_name ?? null,
    reversed_by_name: reverser?.full_name ?? null,
  }))
}

export async function recordPayment(params: {
  schoolId: string
  feeChargeId: string
  amount: number
  paymentDate: string
  method: string
  note: string
  recordedBy: string
  paidForItems?: string[]
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
      ...(params.paidForItems ? { paid_for_items: params.paidForItems } : {}),
    })
    .select('id, fee_charge_id, amount, payment_date, method, note, paid_for_items, created_at')
    .single()
  if (error) throw error
  return data as FeePayment
}

export async function updatePayment(params: {
  paymentId: string
  feeChargeId: string
  amount: number
  paymentDate: string
  method: string
  note: string
  paidForItems?: string[]
}): Promise<FeePayment> {
  if (params.amount <= 0) throw new Error('Payment amount must be greater than zero.')

  const { data: charge, error: chargeError } = await supabase
    .from('fee_charges')
    .select('amount_due, fee_category_id, fee_categories ( is_flexible )')
    .eq('id', params.feeChargeId)
    .single()
  if (chargeError) throw chargeError

  const { data: payments, error: paymentsError } = await supabase
    .from('fee_payments')
    .select('id, amount, reversed_at')
    .eq('fee_charge_id', params.feeChargeId)
  if (paymentsError) throw paymentsError

  const otherPaymentsTotal = (payments ?? [])
    .filter((payment) => payment.id !== params.paymentId && payment.reversed_at === null)
    .reduce((total, payment) => total + Number(payment.amount), 0)
  if (otherPaymentsTotal + params.amount > Number(charge.amount_due)) {
    throw new Error('The corrected payment would exceed the charge balance.')
  }

  let paidForItems: string[] | undefined
  if (params.paidForItems !== undefined) {
    const category = charge.fee_categories as unknown as { is_flexible: boolean } | null
    if (!category?.is_flexible) throw new Error('Items can only be assigned to flexible fee payments.')

    const selectedItems = [...new Set(params.paidForItems.map((item) => item.trim()).filter(Boolean))]
    const [{ data: categoryItems, error: itemsError }, { data: existingPayment, error: paymentError }] = await Promise.all([
      supabase.from('fee_category_items').select('name').eq('fee_category_id', charge.fee_category_id),
      supabase.from('fee_payments').select('paid_for_items').eq('id', params.paymentId).eq('fee_charge_id', params.feeChargeId).single(),
    ])
    if (itemsError) throw itemsError
    if (paymentError) throw paymentError

    const allowedNames = new Set([
      ...(categoryItems ?? []).map((item) => item.name),
      ...((existingPayment.paid_for_items as string[] | null) ?? []),
    ])
    if (selectedItems.some((item) => !allowedNames.has(item))) {
      throw new Error('One or more selected items do not belong to this fee category.')
    }
    paidForItems = selectedItems
  }

  const { data, error } = await supabase
    .from('fee_payments')
    .update({
      amount: params.amount,
      payment_date: params.paymentDate,
      method: params.method || null,
      note: params.note || null,
      ...(paidForItems !== undefined ? { paid_for_items: paidForItems } : {}),
    })
    .eq('id', params.paymentId)
    .eq('fee_charge_id', params.feeChargeId)
    .is('reversed_at', null)
    .select('id, fee_charge_id, amount, payment_date, method, note, paid_for_items, created_at')
    .single()

  if (error) throw error
  return data as FeePayment
}

export async function reversePayment(paymentId: string, reason: string): Promise<void> {
  const normalizedReason = reason.trim()
  if (!normalizedReason) throw new Error('A reason is required to reverse a payment.')

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!userData.user) throw new Error('You must be signed in to reverse a payment.')

  const { data, error } = await supabase
    .from('fee_payments')
    .update({
      reversal_reason: normalizedReason,
      reversed_at: new Date().toISOString(),
      reversed_by: userData.user.id,
    })
    .eq('id', paymentId)
    .is('reversed_at', null)
    .select('id')
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('This payment has already been reversed or is no longer available.')
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
// Balances overview (admin) — all-category results use student
// pagination; category-filtered results page directly from matching
// charges. In both cases, only current-page charges and payments are
// fetched to keep balance calculations bounded.
// ------------------------------------------------------------
export async function fetchFeeBalancesPage(params: {
  page: number
  search: string
  classId: string
  termId: string
  categoryId?: string
}): Promise<{ balances: FeeBalanceRow[]; total: number }> {
  type BalanceStudent = {
    id: string
    full_name: string
    admission_number: string
    class_name: string
  }
  type BalanceCharge = { id: string; student_id: string; amount_due: number }

  let students: BalanceStudent[]
  let charges: BalanceCharge[]
  let total: number

  if (params.categoryId && params.categoryId !== 'all') {
    const from = params.page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    let query = supabase
      .from('fee_charges')
      .select(
        'id, student_id, amount_due, students!inner(id, full_name, admission_number, status, class_id, created_at, classes(name))',
        { count: 'exact' },
      )
      .eq('term_id', params.termId)
      .eq('fee_category_id', params.categoryId)
      .eq('students.status', 'active')
      .order('created_at', { ascending: false })
      .range(from, to)

    if (params.classId !== 'all') query = query.eq('students.class_id', params.classId)

    const search = params.search.replace(/[,()]/g, '').trim()
    if (search) {
      query = query.or(
        `full_name.ilike.%${search}%,admission_number.ilike.%${search}%`,
        { foreignTable: 'students' },
      )
    }

    const { data, count, error } = await query
    if (error) throw error

    const rows = (data ?? []) as unknown as Array<BalanceCharge & {
      students: {
        id: string
        full_name: string
        admission_number: string
        classes: { name: string } | null
      }
    }>
    students = rows.map((row) => ({
      id: row.students.id,
      full_name: row.students.full_name,
      admission_number: row.students.admission_number,
      class_name: row.students.classes?.name ?? 'Unassigned',
    }))
    charges = rows.map(({ id, student_id, amount_due }) => ({ id, student_id, amount_due }))
    total = count ?? 0
  } else {
    const studentsPage = await fetchStudentsPage({
      page: params.page,
      search: params.search,
      classId: params.classId,
      dateJoinedFrom: '',
      status: 'active',
    })
    students = studentsPage.students.map((student) => ({
      id: student.id,
      full_name: student.full_name,
      admission_number: student.admission_number,
      class_name: student.class_name ?? 'Unassigned',
    }))
    total = studentsPage.total

    const studentIds = students.map((student) => student.id)
    if (studentIds.length === 0) return { balances: [], total }

    const { data, error } = await supabase
      .from('fee_charges')
      .select('id, student_id, amount_due')
      .eq('term_id', params.termId)
      .in('student_id', studentIds)
    if (error) throw error
    charges = (data ?? []) as BalanceCharge[]
  }

  const chargeIds = charges.map((charge) => charge.id)
  let payments: { fee_charge_id: string; amount: number }[] = []

  if (chargeIds.length > 0) {
    const { data: paymentsData, error: paymentsError } = await supabase
      .from('fee_payments')
      .select('fee_charge_id, amount')
      .in('fee_charge_id', chargeIds)
      .is('reversed_at', null)

    if (paymentsError) throw paymentsError
    payments = paymentsData ?? []
  }

  const paidByCharge = new Map<string, number>()
  for (const p of payments) {
    paidByCharge.set(p.fee_charge_id, (paidByCharge.get(p.fee_charge_id) ?? 0) + p.amount)
  }

  const dueByStudent = new Map<string, number>()
  const paidByStudent = new Map<string, number>()
  for (const c of charges) {
    dueByStudent.set(c.student_id, (dueByStudent.get(c.student_id) ?? 0) + Number(c.amount_due))
    paidByStudent.set(
      c.student_id,
      (paidByStudent.get(c.student_id) ?? 0) + (paidByCharge.get(c.id) ?? 0),
    )
  }

  const balances: FeeBalanceRow[] = students.map((s) => {
    const totalDue = dueByStudent.get(s.id) ?? 0
    const totalPaid = paidByStudent.get(s.id) ?? 0
    return {
      student_id: s.id,
      full_name: s.full_name,
      admission_number: s.admission_number,
      class_name: s.class_name,
      total_due: totalDue,
      total_paid: totalPaid,
      total_balance: totalDue - totalPaid,
    }
  })

  return { balances, total }
}

export async function fetchFeeBalanceTotals(params: {
  search: string
  classId: string
  termId: string
  categoryId: string
}): Promise<{ total_due: number; total_paid: number; total_balance: number }> {
  const { data, error } = await supabase.rpc('get_fee_balance_totals', {
    p_term_id: params.termId,
    p_class_id: params.classId === 'all' ? null : params.classId,
    p_category_id: params.categoryId === 'all' ? null : params.categoryId,
    p_search: params.search,
  })
  if (error) throw error

  const totals = Array.isArray(data) ? data[0] : data
  return {
    total_due: Number(totals?.total_due ?? 0),
    total_paid: Number(totals?.total_paid ?? 0),
    total_balance: Number(totals?.total_balance ?? 0),
  }
}

export async function fetchFeeBalanceDetails(params: {
  studentId: string
  termId: string
  categoryId: string
}): Promise<FeeBalanceDetailRow[]> {
  let chargesQuery = supabase
    .from('fee_charges')
    .select('id, fee_category_id, amount_due, fee_categories ( id, name, is_flexible )')
    .eq('student_id', params.studentId)
    .eq('term_id', params.termId)
  if (params.categoryId !== 'all') chargesQuery = chargesQuery.eq('fee_category_id', params.categoryId)

  const { data: chargesData, error: chargesError } = await chargesQuery
  if (chargesError) throw chargesError
  const charges = (chargesData ?? []) as unknown as Array<{
    id: string
    fee_category_id: string
    amount_due: number
    fee_categories: { id: string; name: string; is_flexible: boolean } | null
  }>
  if (charges.length === 0) return []

  const chargeIds = charges.map((charge) => charge.id)
  const flexibleCategoryIds = [...new Set(
    charges.filter((charge) => charge.fee_categories?.is_flexible).map((charge) => charge.fee_category_id),
  )]
  const [paymentsResult, itemsResult, collectionsResult] = await Promise.all([
    supabase
      .from('fee_payments')
      .select('id, fee_charge_id, amount, payment_date, method, note, paid_for_items, created_at, recorded_by, reversed_at, reversed_by, reversal_reason, recorder:profiles!fee_payments_recorded_by_fkey(full_name), reverser:profiles!fee_payments_reversed_by_fkey(full_name)')
      .in('fee_charge_id', chargeIds)
      .order('payment_date', { ascending: false }),
    flexibleCategoryIds.length > 0
      ? supabase.from('fee_category_items').select('id, fee_category_id, name').in('fee_category_id', flexibleCategoryIds).order('name')
      : Promise.resolve({ data: [], error: null }),
    flexibleCategoryIds.length > 0
      ? supabase
        .from('fee_category_item_collections')
        .select('fee_category_id, fee_category_item_id, item_name, is_collected, collected_at')
        .eq('student_id', params.studentId)
        .eq('term_id', params.termId)
        .in('fee_category_id', flexibleCategoryIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (paymentsResult.error) throw paymentsResult.error
  if (itemsResult.error) throw itemsResult.error
  if (collectionsResult.error) throw collectionsResult.error

  const paymentRows = (paymentsResult.data ?? []) as unknown as Array<FeePayment & {
    recorder: { full_name: string } | null
    reverser: { full_name: string } | null
  }>
  const paymentsByCharge = new Map<string, FeePayment[]>()
  for (const { recorder, reverser, ...payment } of paymentRows) {
    const normalizedPayment = {
      ...payment,
      posted_by_name: recorder?.full_name ?? null,
      reversed_by_name: reverser?.full_name ?? null,
    }
    paymentsByCharge.set(payment.fee_charge_id, [
      ...(paymentsByCharge.get(payment.fee_charge_id) ?? []),
      normalizedPayment,
    ])
  }

  const catalogItems = (itemsResult.data ?? []) as FeeCategoryItem[]
  const itemCollections = (collectionsResult.data ?? []) as Array<{
    fee_category_id: string
    fee_category_item_id: string | null
    item_name: string
    is_collected: boolean
    collected_at: string | null
  }>
  return charges.map((charge) => {
    const categoryItems = catalogItems.filter((item) => item.fee_category_id === charge.fee_category_id)
    const categoryCollections = itemCollections.filter((item) => item.fee_category_id === charge.fee_category_id)
    const collectionsByItem = new Map(
      categoryCollections
        .filter((item) => item.fee_category_item_id)
        .map((item) => [item.fee_category_item_id!, item]),
    )
    const items = [
      ...categoryItems.map((item) => {
        const collection = collectionsByItem.get(item.id)
        return {
          item_name: item.name,
          is_collected: collection?.is_collected ?? false,
          collected_at: collection?.collected_at ?? null,
        }
      }),
      ...categoryCollections
        .filter((item) => item.fee_category_item_id === null && item.is_collected)
        .map((item) => ({ item_name: item.item_name, is_collected: true, collected_at: item.collected_at })),
    ]
    const payments = paymentsByCharge.get(charge.id) ?? []
    const amountPaid = payments.reduce(
      (total, payment) => total + (payment.reversed_at ? 0 : Number(payment.amount)),
      0,
    )
    const amountDue = Number(charge.amount_due)

    return {
      fee_charge_id: charge.id,
      fee_category_id: charge.fee_category_id,
      category_name: charge.fee_categories?.name ?? 'Unknown',
      is_flexible: charge.fee_categories?.is_flexible ?? false,
      amount_due: amountDue,
      amount_paid: amountPaid,
      balance: amountDue - amountPaid,
      payments,
      items,
    }
  })
}
