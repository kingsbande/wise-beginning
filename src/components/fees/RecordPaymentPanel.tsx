import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../context/AuthContext'
import { searchStudentsForPicker, StudentPickerRow } from '../../lib/queries'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import {
  adjustChargeAmount,
  fetchPaymentHistory,
  fetchStudentFeeSummary,
  recordPayment,
} from '../../lib/feesApi'
import { getUserFriendlyError } from '../../lib/errorMessages'
import { logError } from '../../lib/errorLogger'
import { generatePaymentReceiptPdf, PaymentReceiptParams } from '../../lib/pdf'

export function RecordPaymentPanel() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 250)
  const [selectedStudent, setSelectedStudent] = useState<StudentPickerRow | null>(null)
  const [payingChargeId, setPayingChargeId] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [method, setMethod] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null)
  const [editingAmountId, setEditingAmountId] = useState<string | null>(null)
  const [editAmountValue, setEditAmountValue] = useState('')
  const [lastReceipt, setLastReceipt] = useState<PaymentReceiptParams | null>(null)

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

  const { data: history = [] } = useQuery({
    queryKey: ['fee-payment-history', expandedHistoryId],
    queryFn: () => fetchPaymentHistory(expandedHistoryId!),
    enabled: !!expandedHistoryId,
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

  if (!selectedStudent) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
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
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900">{selectedStudent.full_name}</h3>
          <p className="text-xs text-gray-500">
            {selectedStudent.class_name} · Adm No: {selectedStudent.admission_number}
          </p>
        </div>
        <button
          onClick={() => setSelectedStudent(null)}
          className="text-xs font-medium text-gray-500 underline hover:text-gray-900"
        >
          Change Student
        </button>
      </div>

      <div className="mt-4">
        {lastReceipt && (
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
        {summaryLoading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : summary.length === 0 ? (
          <p className="text-sm text-gray-500">
            No fee charges yet for this student — generate them from a fee structure in Setup.
          </p>
        ) : (
          <div className="space-y-3">
            {summary.map((row) => (
              <div key={row.fee_charge_id} className="rounded-lg border border-gray-100 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
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
                  <div className="flex gap-2">
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
                  <div className="mt-3 grid grid-cols-1 gap-2 border-t border-gray-100 pt-3 sm:grid-cols-4">
                    <input
                      type="number"
                      min={0}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="Amount"
                      className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
                    />
                    <input
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
                    />
                    <input
                      value={method}
                      onChange={(e) => setMethod(e.target.value)}
                      placeholder="Method (optional)"
                      className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
                    />
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Note (optional)"
                      className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
                    />
                    <div className="sm:col-span-4">
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
                          <li key={p.id}>
                            {p.payment_date} — {p.amount.toLocaleString()}
                            {p.method ? ` (${p.method})` : ''}
                            {p.note ? ` — ${p.note}` : ''}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
