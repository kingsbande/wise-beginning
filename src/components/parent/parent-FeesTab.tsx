import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchStudentFeeSummary } from '../../lib/feesApi'
import { generateFeeStatementPdf } from '../../lib/pdf'
import { useParentAuth } from '../../context/ParentAuthContext'
import { MyStudent } from '../../lib/parent/parentApi'

export function FeesTab({ student }: { student: MyStudent }) {
  const { parentProfile } = useParentAuth()
  const [downloading, setDownloading] = useState(false)

  const { data: summary = [], isLoading } = useQuery({
    queryKey: ['my-fee-summary', student.id],
    queryFn: () => fetchStudentFeeSummary(student.id),
  })

  const totalDue = summary.reduce((sum, r) => sum + r.amount_due, 0)
  const totalPaid = summary.reduce((sum, r) => sum + r.amount_paid, 0)
  const totalBalance = totalDue - totalPaid

  async function handleDownload() {
    if (!parentProfile) return
    setDownloading(true)
    try {
      await generateFeeStatementPdf({
        schoolName: parentProfile.school_name,
        logoUrl: parentProfile.school_logo_url,
        studentName: student.full_name,
        admissionNumber: student.admission_number,
        className: student.class_name,
        rows: summary.map((r) => ({
          categoryName: r.category_name,
          termName: r.term_name,
          amountDue: r.amount_due,
          amountPaid: r.amount_paid,
          balance: r.balance,
        })),
      })
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-gray-600">
          <p>
            Total Due: <span className="font-medium text-gray-900">{totalDue.toLocaleString()}</span>
          </p>
          <p>
            Total Paid:{' '}
            <span className="font-medium text-gray-900">{totalPaid.toLocaleString()}</span>
          </p>
          <p>
            Balance:{' '}
            <span className={`font-semibold ${totalBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {totalBalance.toLocaleString()}
            </span>
          </p>
        </div>
        <button
          onClick={handleDownload}
          disabled={downloading || summary.length === 0}
          className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {downloading ? 'Preparing...' : 'Download Statement PDF'}
        </button>
      </div>

      <div className="mt-4">
        {isLoading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : summary.length === 0 ? (
          <p className="text-sm text-gray-500">No fee charges recorded yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="py-2 pr-4">Category</th>
                <th className="py-2 pr-4">Term</th>
                <th className="py-2 pr-4">Due</th>
                <th className="py-2 pr-4">Paid</th>
                <th className="py-2 pr-4">Balance</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((row) => (
                <tr key={row.fee_charge_id} className="border-b border-gray-100">
                  <td className="py-2 pr-4">{row.category_name}</td>
                  <td className="py-2 pr-4">{row.term_name}</td>
                  <td className="py-2 pr-4">{row.amount_due.toLocaleString()}</td>
                  <td className="py-2 pr-4">{row.amount_paid.toLocaleString()}</td>
                  <td
                    className={`py-2 pr-4 font-medium ${
                      row.balance > 0 ? 'text-red-600' : 'text-green-600'
                    }`}
                  >
                    {row.balance.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
