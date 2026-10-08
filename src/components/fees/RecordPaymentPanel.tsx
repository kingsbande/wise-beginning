import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RotateCcw } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { searchStudentsForPicker, StudentPickerRow } from '../../lib/queries'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import { fetchTerms } from '../../lib/gradesApi'
import {
  adjustChargeAmount,
  fetchFeeCategories,
  fetchFeeCategoryItemCollections,
  fetchFeeCategoryItems,
  fetchPaymentHistory,
  fetchStudentFeeSummary,
  recordFlexiblePayment,
  recordPayment,
  reversePayment,
  setFeeCategoryItemCollected,
  updatePayment,
} from '../../lib/feesApi'
import { getUserFriendlyError } from '../../lib/errorMessages'
import { logError } from '../../lib/errorLogger'
import { generatePaymentReceiptPdf, PaymentReceiptParams } from '../../lib/pdf'

export function RecordPaymentPanel() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [activeView, setActiveView] = useState<'payments' | 'collection'>('payments')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 250)
  const [selectedStudent, setSelectedStudent] = useState<StudentPickerRow | null>(null)
  const [payingChargeId, setPayingChargeId] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [flexibleCategoryId, setFlexibleCategoryId] = useState('')
  const [flexibleItemIds, setFlexibleItemIds] = useState<string[]>([])
  const [flexibleTermId, setFlexibleTermId] = useState('')
  const [flexibleTotalDue, setFlexibleTotalDue] = useState('')
  const [flexibleAmount, setFlexibleAmount] = useState('')
  const [collectionCategoryId, setCollectionCategoryId] = useState('')
  const [collectionTermId, setCollectionTermId] = useState('')
  const [collectionError, setCollectionError] = useState<string | null>(null)
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [method, setMethod] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null)
  const [editingAmountId, setEditingAmountId] = useState<string | null>(null)
  const [editAmountValue, setEditAmountValue] = useState('')
  const [lastReceipt, setLastReceipt] = useState<PaymentReceiptParams | null>(null)
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null)
  const [editPaymentAmount, setEditPaymentAmount] = useState('')
  const [editPaymentDate, setEditPaymentDate] = useState('')
  const [editPaymentMethod, setEditPaymentMethod] = useState('')
  const [editPaymentNote, setEditPaymentNote] = useState('')
  const [editPaymentItems, setEditPaymentItems] = useState<string[]>([])
  const [reversingPaymentId, setReversingPaymentId] = useState<string | null>(null)
  const [reversalReason, setReversalReason] = useState('')
  const [reversalError, setReversalError] = useState<string | null>(null)

  const { data: students = [] } = useQuery({
    queryKey: ['fee-student-picker', debouncedSearch],
    queryFn: () => searchStudentsForPicker(debouncedSearch),
    enabled: !selectedStudent,
  })

  const { data: summary = [], isLoading: summaryLoading } = useQuery({
    queryKey: ['student-fee-summary', selectedStudent?.id],
    queryFn: () => fetchStudentFeeSummary(selectedStudent!.id),
    enabled: !!selectedStudent,
  })

  const editingCharge = summary.find((row) => row.fee_charge_id === expandedHistoryId)

  const { data: flexibleCategories = [] } = useQuery({
    queryKey: ['fee-categories'],
    queryFn: fetchFeeCategories,
  })

  const { data: flexibleCategoryItems = [] } = useQuery({
    queryKey: ['fee-category-items', flexibleCategoryId],
    queryFn: () => fetchFeeCategoryItems(flexibleCategoryId),
    enabled: !!flexibleCategoryId,
  })

  const { data: collectionItems = [] } = useQuery({
    queryKey: ['fee-category-items-collection', collectionCategoryId],
    queryFn: () => fetchFeeCategoryItems(collectionCategoryId),
    enabled: !!collectionCategoryId,
  })

  const { data: terms = [] } = useQuery({
    queryKey: ['terms'],
    queryFn: fetchTerms,
  })

  const { data: history = [] } = useQuery({
    queryKey: ['fee-payment-history', expandedHistoryId],
    queryFn: () => fetchPaymentHistory(expandedHistoryId!),
    enabled: !!expandedHistoryId,
  })

  const { data: editingCategoryItems = [] } = useQuery({
    queryKey: ['fee-category-items-edit', editingCharge?.fee_category_id],
    queryFn: () => fetchFeeCategoryItems(editingCharge!.fee_category_id),
    enabled: !!editingPaymentId && !!editingCharge?.is_flexible,
  })

  const collectionQueryKey = ['fee-item-collections', selectedStudent?.id, collectionCategoryId, collectionTermId]
  const { data: itemCollections = [], isLoading: collectionsLoading } = useQuery({
    queryKey: collectionQueryKey,
    queryFn: () => fetchFeeCategoryItemCollections({
      studentId: selectedStudent!.id,
      feeCategoryId: collectionCategoryId,
      termId: collectionTermId,
    }),
    enabled: !!selectedStudent && !!collectionCategoryId && !!collectionTermId,
  })

  const paymentMutation = useMutation({
    mutationFn: async () => {
      const numericAmount = Number(amount)
      if (!numericAmount || numericAmount <= 0) throw new Error('Enter a valid amount.')
      const charge = summary.find((row) => row.fee_charge_id === payingChargeId)
      if (!charge) throw new Error('The selected fee charge is no longer available.')
      const payment = await recordPayment({
        schoolId: profile!.school_id,
        feeChargeId: payingChargeId!,
        amount: numericAmount,
        paymentDate,
        method,
        note,
        recordedBy: profile!.id,
      })
      return { payment, charge }
    },
    onSuccess: async ({ payment, charge }) => {
      const receipt: PaymentReceiptParams = {
        schoolName: profile?.school_name ?? 'School',
        logoUrl: profile?.school_logo_url ?? null,
        receiptNumber: payment.id.slice(0, 8).toUpperCase(),
        studentName: selectedStudent!.full_name,
        admissionNumber: selectedStudent!.admission_number,
        className: selectedStudent!.class_name,
        categoryName: charge.category_name,
        termName: charge.term_name,
        amountDue: charge.amount_due,
        amountPaid: payment.amount,
        balance: Math.max(0, charge.balance - payment.amount),
        paymentDate: payment.payment_date,
        method: payment.method,
        note: payment.note,
      }
      setLastReceipt(receipt)
      await generatePaymentReceiptPdf(receipt)
      queryClient.invalidateQueries({ queryKey: ['student-fee-summary', selectedStudent?.id] })
      queryClient.invalidateQueries({ queryKey: ['fee-payment-history'] })
      setPayingChargeId(null)
      setAmount('')
      setMethod('')
      setNote('')
      setError(null)
    },
    onError: (err: Error) => {
      void logError(err, { type: 'payment_recording' })
      setError(getUserFriendlyError(err, 'We could not record the payment. Please try again.'))
    },
  })

  const flexiblePaymentMutation = useMutation({
    mutationFn: async () => {
      const numericAmount = Number(flexibleAmount)
      if (!flexibleCategoryId || !flexibleTermId) throw new Error('Select a flexible category and term.')
      if (!numericAmount || numericAmount <= 0) throw new Error('Enter a valid amount.')
      const numericTotalDue = Number(flexibleTotalDue)
      return recordFlexiblePayment({
        schoolId: profile!.school_id,
        studentId: selectedStudent!.id,
        feeCategoryId: flexibleCategoryId,
        termId: flexibleTermId,
        totalDue: numericTotalDue > 0 ? numericTotalDue : undefined,
        amount: numericAmount,
        feeCategoryItemIds: flexibleItemIds,
        paymentDate,
        method,
        note,
        recordedBy: profile!.id,
      })
    },
    onSuccess: async ({ payment, charge }) => {
      const receipt: PaymentReceiptParams = {
        schoolName: profile?.school_name ?? 'School',
        logoUrl: profile?.school_logo_url ?? null,
        receiptNumber: payment.id.slice(0, 8).toUpperCase(),
        studentName: selectedStudent!.full_name,
        admissionNumber: selectedStudent!.admission_number,
        className: selectedStudent!.class_name,
        categoryName: charge.category_name,
        termName: charge.term_name,
        amountDue: charge.amount_due,
        amountPaid: payment.amount,
        balance: charge.balance,
        paymentDate: payment.payment_date,
        method: payment.method,
        note: [payment.note, payment.paid_for_items.length ? `Items: ${payment.paid_for_items.join(', ')}` : ''].filter(Boolean).join(' | '),
      }
      setLastReceipt(receipt)
      await generatePaymentReceiptPdf(receipt)
      queryClient.invalidateQueries({ queryKey: ['student-fee-summary', selectedStudent?.id] })
      queryClient.invalidateQueries({ queryKey: ['fee-payment-history'] })
      setFlexibleCategoryId('')
      setFlexibleItemIds([])
      setFlexibleTermId('')
      setFlexibleTotalDue('')
      setFlexibleAmount('')
      setMethod('')
      setNote('')
      setError(null)
    },
    onError: (err: Error) => {
      void logError(err, { type: 'flexible_payment_recording' })
      setError(getUserFriendlyError(err, 'We could not record the flexible payment. Please try again.'))
    },
  })

  const adjustMutation = useMutation({
    mutationFn: async () => {
      const numericAmount = Number(editAmountValue)
      if (Number.isNaN(numericAmount) || numericAmount < 0) throw new Error('Enter a valid amount.')
      await adjustChargeAmount(editingAmountId!, numericAmount)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-fee-summary', selectedStudent?.id] })
      setEditingAmountId(null)
    },
  })

  const updatePaymentMutation = useMutation({
    mutationFn: () => updatePayment({
      paymentId: editingPaymentId!,
      feeChargeId: expandedHistoryId!,
      amount: Number(editPaymentAmount),
      paymentDate: editPaymentDate,
      method: editPaymentMethod,
      note: editPaymentNote,
      paidForItems: editingCharge?.is_flexible ? editPaymentItems : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-fee-summary', selectedStudent?.id] })
      queryClient.invalidateQueries({ queryKey: ['fee-payment-history', expandedHistoryId] })
      setEditingPaymentId(null)
      setEditPaymentItems([])
    },
    onError: (err: Error) => setError(err.message || 'The payment could not be updated.'),
  })

  const reversePaymentMutation = useMutation({
    mutationFn: () => reversePayment(reversingPaymentId!, reversalReason),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['student-fee-summary', selectedStudent?.id] }),
        queryClient.invalidateQueries({ queryKey: ['fee-payment-history', expandedHistoryId] }),
        queryClient.invalidateQueries({ queryKey: ['fee-balances'] }),
        queryClient.invalidateQueries({ queryKey: ['fee-balance-totals'] }),
        queryClient.invalidateQueries({ queryKey: ['fee-balance-details'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-analytics-kpis'] }),
      ])
      setReversingPaymentId(null)
      setReversalReason('')
      setReversalError(null)
    },
    onError: (err: Error) => setReversalError(err.message || 'The payment could not be reversed.'),
  })

  const collectionMutation = useMutation({
    mutationFn: ({ itemId, itemName, isCollected }: { itemId: string; itemName: string; isCollected: boolean }) =>
      setFeeCategoryItemCollected({
        schoolId: profile!.school_id,
        studentId: selectedStudent!.id,
        feeCategoryId: collectionCategoryId,
        feeCategoryItemId: itemId,
        itemName,
        termId: collectionTermId,
        isCollected,
        updatedBy: profile!.id,
      }),
    onSuccess: () => {
      setCollectionError(null)
      void queryClient.invalidateQueries({ queryKey: collectionQueryKey })
    },
    onError: (err: Error) => setCollectionError(err.message || 'Could not update collection status.'),
  })

  const collectionByItemId = new Map(
    itemCollections
      .filter((collection) => collection.fee_category_item_id)
      .map((collection) => [collection.fee_category_item_id!, collection]),
  )
  const collectedItems = collectionItems.filter((item) => collectionByItemId.get(item.id)?.is_collected)
  const remainingItems = collectionItems.filter((item) => !collectionByItemId.get(item.id)?.is_collected)
  const archivedCollectedItems = itemCollections.filter(
    (collection) => collection.is_collected && !collection.fee_category_item_id,
  )
  const hasFlexibleCategories = flexibleCategories.some((category) => category.is_flexible)

  if (!selectedStudent) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6">
        <h3 className="text-base font-semibold text-gray-900">Find a Student</h3>
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by student name, parent name, or admission number..."
          className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
        />
        <div className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-gray-100">
          {students.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">
              {search.trim() === '' ? 'Start typing to search.' : 'No students found.'}
            </p>
          ) : (
            students.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedStudent(s)}
                className="flex w-full flex-col items-start border-b border-gray-100 px-4 py-3 text-left last:border-b-0 hover:bg-gray-50"
              >
                <span className="text-sm font-medium text-gray-900">{s.full_name}</span>
                <span className="text-xs text-gray-500">
                  {s.class_name} · Adm No: {s.admission_number}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-gray-900">{selectedStudent.full_name}</h3>
          <p className="break-words text-xs text-gray-500">
            {selectedStudent.class_name} · Adm No: {selectedStudent.admission_number}
          </p>
        </div>
        <button
          type="button"
          aria-label="Choose a different student"
          onClick={() => {
            setSelectedStudent(null)
            setActiveView('payments')
            setLastReceipt(null)
            setExpandedHistoryId(null)
            setEditingPaymentId(null)
            setError(null)
            setCollectionError(null)
          }}
          className="shrink-0 whitespace-nowrap text-left text-xs font-medium text-gray-500 underline hover:text-gray-900"
        >
          Change Student
        </button>
      </div>

      <div role="tablist" aria-label="Student fee tasks" className="mt-4 grid w-full grid-cols-2 gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
        <button
          type="button"
          role="tab"
          id="student-payments-tab"
          aria-controls="student-fee-task-panel"
          aria-selected={activeView === 'payments'}
          onClick={() => setActiveView('payments')}
          className={`rounded-md px-3 py-2 text-sm font-medium ${activeView === 'payments' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
        >
          Payments
        </button>
        <button
          type="button"
          role="tab"
          id="student-collection-tab"
          aria-controls="student-fee-task-panel"
          aria-selected={activeView === 'collection'}
          onClick={() => setActiveView('collection')}
          disabled={!hasFlexibleCategories}
          className={`rounded-md px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${activeView === 'collection' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
        >
          Item collection
        </button>
      </div>

      <div
        id="student-fee-task-panel"
        role="tabpanel"
        aria-labelledby={activeView === 'payments' ? 'student-payments-tab' : 'student-collection-tab'}
        className="mt-4"
      >
        {activeView === 'payments' && lastReceipt && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
            <p className="text-xs text-green-800">Payment recorded. Receipt downloaded successfully.</p>
            <button
              type="button"
              onClick={() => void generatePaymentReceiptPdf(lastReceipt)}
              className="rounded-lg border border-green-300 bg-white px-3 py-1.5 text-xs font-medium text-green-800 hover:bg-green-100"
            >
              Download Receipt Again
            </button>
          </div>
        )}
        {activeView === 'payments' && flexibleCategories.some((category) => category.is_flexible) && (
          <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 p-3">
            <p className="text-sm font-medium text-gray-900">Record Flexible Fee</p>
            <p className="mt-1 text-xs text-gray-600">This fee applies only to this student and term.</p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <select
                value={flexibleCategoryId}
                onChange={(e) => {
                  setFlexibleCategoryId(e.target.value)
                  setFlexibleItemIds([])
                }}
                className="w-full min-w-0 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
              >
                <option value="">Category</option>
                {flexibleCategories.filter((category) => category.is_flexible).map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
              <select
                value={flexibleTermId}
                onChange={(e) => setFlexibleTermId(e.target.value)}
                className="w-full min-w-0 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
              >
                <option value="">Term</option>
                {terms.map((term) => (
                  <option key={term.id} value={term.id}>{term.name} — {term.academic_year}</option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                value={flexibleTotalDue}
                onChange={(e) => setFlexibleTotalDue(e.target.value)}
                placeholder="Total due (first payment)"
                className="w-full min-w-0 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
              />
              <input
                type="number"
                min={0}
                value={flexibleAmount}
                onChange={(e) => setFlexibleAmount(e.target.value)}
                placeholder="Amount"
                className="w-full min-w-0 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
              />
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full min-w-0 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
              />
              <button
                onClick={() => flexiblePaymentMutation.mutate()}
                disabled={flexiblePaymentMutation.isPending || (flexibleCategoryItems.length > 0 && flexibleItemIds.length === 0)}
                className="w-full rounded-lg bg-blue-700 px-3 py-2 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50"
              >
                {flexiblePaymentMutation.isPending ? 'Saving...' : 'Record Flexible Payment'}
              </button>
            </div>
            {flexibleCategoryId && flexibleCategoryItems.length > 0 && (
              <fieldset className="mt-3 rounded-lg border border-blue-100 bg-white p-3">
                <legend className="px-1 text-xs font-medium text-gray-700">Items this payment is for</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {flexibleCategoryItems.map((item) => (
                    <label key={item.id} className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={flexibleItemIds.includes(item.id)}
                        onChange={(event) => setFlexibleItemIds((current) =>
                          event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id),
                        )}
                      />
                      {item.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {flexibleCategoryId && flexibleCategoryItems.length === 0 && (
              <p className="mt-2 text-xs text-gray-600">No items are set up for this category yet. You can still record the payment.</p>
            )}
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                placeholder="Method (optional)"
                className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
              />
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note (optional)"
                className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
              />
            </div>
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          </div>
        )}
        {activeView === 'collection' && flexibleCategories.some((category) => category.is_flexible) && (
          <section className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-gray-900">Item collection</h4>
                <p className="mt-1 text-xs text-gray-500">Track what this student has collected. This does not change payments or balances.</p>
              </div>
              {collectionCategoryId && collectionTermId && (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                  {remainingItems.length} remaining
                </span>
              )}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="text-xs font-medium text-gray-700">
                Flexible category
                <select
                  value={collectionCategoryId}
                  onChange={(event) => {
                    setCollectionCategoryId(event.target.value)
                    setCollectionError(null)
                  }}
                  className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm font-normal focus:border-gray-900 focus:outline-none"
                >
                  <option value="">Select category</option>
                  {flexibleCategories.filter((category) => category.is_flexible).map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-gray-700">
                Term
                <select
                  value={collectionTermId}
                  onChange={(event) => {
                    setCollectionTermId(event.target.value)
                    setCollectionError(null)
                  }}
                  className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm font-normal focus:border-gray-900 focus:outline-none"
                >
                  <option value="">Select term</option>
                  {terms.map((term) => (
                    <option key={term.id} value={term.id}>{term.name} — {term.academic_year}</option>
                  ))}
                </select>
              </label>
            </div>
            {collectionError && <p role="alert" className="mt-3 text-xs text-red-600">{collectionError}</p>}
            {collectionCategoryId && collectionTermId && (
              collectionsLoading ? (
                <p className="mt-4 text-sm text-gray-500">Loading collection status...</p>
              ) : collectionItems.length === 0 ? (
                <p className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">No items are set up for this category yet.</p>
              ) : (
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <h5 className="text-xs font-semibold uppercase text-amber-800">Not collected ({remainingItems.length})</h5>
                    {remainingItems.length === 0 ? (
                      <p className="mt-2 text-sm text-gray-500">All listed items have been collected.</p>
                    ) : (
                      <ul className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-100">
                        {remainingItems.map((item) => (
                          <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                            <span className="text-sm text-gray-800">{item.name}</span>
                            <button
                              type="button"
                              disabled={collectionMutation.isPending}
                              onClick={() => collectionMutation.mutate({ itemId: item.id, itemName: item.name, isCollected: true })}
                              className="shrink-0 rounded-md border border-emerald-200 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                            >
                              Mark collected
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <h5 className="text-xs font-semibold uppercase text-emerald-800">Collected ({collectedItems.length + archivedCollectedItems.length})</h5>
                    {collectedItems.length === 0 && archivedCollectedItems.length === 0 ? (
                      <p className="mt-2 text-sm text-gray-500">No items collected yet.</p>
                    ) : (
                      <ul className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-100">
                        {collectedItems.map((item) => {
                          const collection = collectionByItemId.get(item.id)!
                          return (
                            <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                              <div>
                                <p className="text-sm font-medium text-gray-800">{item.name}</p>
                                <p className="mt-0.5 text-xs text-gray-500">
                                  Collected {collection.collected_at ? new Date(collection.collected_at).toLocaleString() : ''}
                                </p>
                              </div>
                              <button
                                type="button"
                                disabled={collectionMutation.isPending}
                                onClick={() => collectionMutation.mutate({ itemId: item.id, itemName: item.name, isCollected: false })}
                                className="shrink-0 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                              >
                                Undo
                              </button>
                            </li>
                          )
                        })}
                        {archivedCollectedItems.map((collection) => (
                          <li key={`${collection.item_name}-${collection.updated_at}`} className="px-3 py-2.5">
                            <p className="text-sm font-medium text-gray-800">{collection.item_name}</p>
                            <p className="mt-0.5 text-xs text-gray-500">Collected item removed from the active list</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )
            )}
          </section>
        )}
        {activeView === 'payments' && (summaryLoading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : summary.length === 0 ? (
          <p className="text-sm text-gray-500">
            No fee charges yet for this student — generate them from a fee structure in Setup.
          </p>
        ) : (
          <div className="space-y-3">
            {summary.map((row) => (
              <div key={row.fee_charge_id} className="rounded-lg border border-gray-100 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {row.category_name} — {row.term_name}
                    </p>
                    <p className="text-xs text-gray-500">
                      Due: {row.amount_due.toLocaleString()} · Paid: {row.amount_paid.toLocaleString()}{' '}
                      ·{' '}
                      <span className={row.balance > 0 ? 'text-red-600' : 'text-green-600'}>
                        Balance: {row.balance.toLocaleString()}
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() =>
                        setPayingChargeId(payingChargeId === row.fee_charge_id ? null : row.fee_charge_id)
                      }
                      className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800"
                    >
                      Record Payment
                    </button>
                    <button
                      onClick={() => {
                        setEditingAmountId(
                          editingAmountId === row.fee_charge_id ? null : row.fee_charge_id,
                        )
                        setEditAmountValue(String(row.amount_due))
                      }}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100"
                    >
                      Adjust Due
                    </button>
                    <button
                      onClick={() =>
                        setExpandedHistoryId(
                          expandedHistoryId === row.fee_charge_id ? null : row.fee_charge_id,
                        )
                      }
                      className="text-xs font-medium text-gray-500 underline hover:text-gray-900"
                    >
                      History
                    </button>
                  </div>
                </div>

                {payingChargeId === row.fee_charge_id && (
                  <div className="mt-3 grid grid-cols-1 gap-2 border-t border-gray-100 pt-3 sm:grid-cols-2 xl:grid-cols-4">
                    <input
                      type="number"
                      min={0}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="Amount"
                      className="w-full min-w-0 rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
                    />
                    <input
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      className="w-full min-w-0 rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
                    />
                    <input
                      value={method}
                      onChange={(e) => setMethod(e.target.value)}
                      placeholder="Method (optional)"
                      className="w-full min-w-0 rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
                    />
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Note (optional)"
                      className="w-full min-w-0 rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
                    />
                    <div className="sm:col-span-2 xl:col-span-4">
                      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
                      <button
                        onClick={() => paymentMutation.mutate()}
                        disabled={paymentMutation.isPending}
                        className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                      >
                        {paymentMutation.isPending ? 'Saving...' : 'Save Payment'}
                      </button>
                    </div>
                  </div>
                )}

                {editingAmountId === row.fee_charge_id && (
                  <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3">
                    <input
                      type="number"
                      min={0}
                      value={editAmountValue}
                      onChange={(e) => setEditAmountValue(e.target.value)}
                      className="w-32 rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
                    />
                    <button
                      onClick={() => adjustMutation.mutate()}
                      disabled={adjustMutation.isPending}
                      className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                )}

                {expandedHistoryId === row.fee_charge_id && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    {history.length === 0 ? (
                      <p className="text-xs text-gray-500">No payments recorded yet.</p>
                    ) : (
                      <ul className="space-y-1 text-xs text-gray-600">
                        {history.map((p) => (
                          <li key={p.id} className="space-y-2">
                            {editingPaymentId === p.id ? (
                              <div className="grid grid-cols-1 gap-2 rounded-lg bg-gray-50 p-2 sm:grid-cols-2 xl:grid-cols-4">
                                <input type="number" min={0.01} value={editPaymentAmount} onChange={(e) => setEditPaymentAmount(e.target.value)} className="w-full min-w-0 rounded border border-gray-300 px-2 py-1 text-xs" />
                                <input type="date" value={editPaymentDate} onChange={(e) => setEditPaymentDate(e.target.value)} className="w-full min-w-0 rounded border border-gray-300 px-2 py-1 text-xs" />
                                <input value={editPaymentMethod} onChange={(e) => setEditPaymentMethod(e.target.value)} placeholder="Method" className="w-full min-w-0 rounded border border-gray-300 px-2 py-1 text-xs" />
                                <input value={editPaymentNote} onChange={(e) => setEditPaymentNote(e.target.value)} placeholder="Note" className="w-full min-w-0 rounded border border-gray-300 px-2 py-1 text-xs" />
                                {editingCharge?.is_flexible && (
                                  <fieldset className="rounded border border-gray-200 bg-white p-2 sm:col-span-2 xl:col-span-4">
                                    <legend className="px-1 text-xs font-medium text-gray-700">Items this payment is for</legend>
                                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                                      {Array.from(new Set([...editingCategoryItems.map((item) => item.name), ...editPaymentItems])).map((itemName) => (
                                        <label key={itemName} className="flex items-center gap-2 text-xs text-gray-700">
                                          <input
                                            type="checkbox"
                                            checked={editPaymentItems.includes(itemName)}
                                            onChange={(event) => setEditPaymentItems((current) =>
                                              event.target.checked ? [...current, itemName] : current.filter((name) => name !== itemName),
                                            )}
                                          />
                                          {itemName}
                                        </label>
                                      ))}
                                      {editingCategoryItems.length === 0 && editPaymentItems.length === 0 && (
                                        <span className="text-xs text-gray-500">No items are currently set up for this category.</span>
                                      )}
                                    </div>
                                  </fieldset>
                                )}
                                <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-4">
                                  <button type="button" onClick={() => updatePaymentMutation.mutate()} disabled={updatePaymentMutation.isPending} className="rounded bg-gray-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50">{updatePaymentMutation.isPending ? 'Saving...' : 'Save'}</button>
                                  <button type="button" onClick={() => { setEditingPaymentId(null); setEditPaymentItems([]); setError(null) }} className="rounded border border-gray-300 px-2.5 py-1 text-xs">Cancel</button>
                                </div>
                                {error && <p role="alert" className="text-xs text-red-600 sm:col-span-2 xl:col-span-4">{error}</p>}
                              </div>
                            ) : (
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                  <p className="text-gray-800">
                                    Payment date: {p.payment_date} · Amount: {p.amount.toLocaleString()}{p.method ? ` · ${p.method}` : ''}
                                  </p>
                                  <p className="mt-1 text-gray-500">
                                    Posted on: {new Date(p.created_at).toLocaleString()} · By: {p.posted_by_name ?? 'User unavailable'}
                                  </p>
                                  {p.paid_for_items.length > 0 && (
                                    <p className="mt-1 text-gray-600">Paid for: {p.paid_for_items.join(', ')}</p>
                                  )}
                                  {p.note && <p className="mt-1 text-gray-500">Note: {p.note}</p>}
                                  {p.reversed_at && (
                                    <p className="mt-1 text-amber-700">
                                      Reversed on {new Date(p.reversed_at).toLocaleString()} by {p.reversed_by_name ?? 'User unavailable'}
                                      {p.reversal_reason ? ` · ${p.reversal_reason}` : ''}
                                    </p>
                                  )}
                                </div>
                                <div className="shrink-0 flex flex-wrap items-center gap-2">
                                  {!p.reversed_at && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setReversingPaymentId(p.id)
                                        setReversalReason('')
                                        setReversalError(null)
                                      }}
                                      className="inline-flex items-center gap-1 font-medium text-amber-700 underline hover:text-amber-900"
                                    >
                                      <RotateCcw className="h-3.5 w-3.5" />
                                      Reverse
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                            {reversingPaymentId === p.id && !p.reversed_at && (
                              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2">
                                <p className="text-xs font-medium text-amber-900">Reverse this payment</p>
                                <textarea
                                  value={reversalReason}
                                  onChange={(event) => setReversalReason(event.target.value)}
                                  rows={2}
                                  placeholder="Why is this payment being reversed?"
                                  className="mt-2 w-full rounded border border-amber-300 bg-white px-2 py-1.5 text-xs text-gray-700 focus:border-amber-500 focus:outline-none"
                                />
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void reversePaymentMutation.mutate()}
                                    disabled={reversePaymentMutation.isPending || !reversalReason.trim()}
                                    className="rounded bg-amber-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {reversePaymentMutation.isPending ? 'Reversing...' : 'Confirm reversal'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setReversingPaymentId(null)
                                      setReversalReason('')
                                      setReversalError(null)
                                    }}
                                    className="rounded border border-amber-300 bg-white px-2.5 py-1 text-xs text-amber-800 hover:bg-amber-100"
                                  >
                                    Cancel
                                  </button>
                                </div>
                                {reversalError && <p role="alert" className="mt-2 text-xs text-red-600">{reversalError}</p>}
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
