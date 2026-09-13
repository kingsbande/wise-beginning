import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchClasses, PAGE_SIZE } from '../../lib/queries'
import { fetchTerms } from '../../lib/gradesApi'
import { fetchFeeBalancesPage } from '../../lib/feesApi'
import { downloadCsv } from '../../lib/csv'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import { SearchBar } from '../SearchBar'
import { Pagination } from '../Pagination'

export function BalancesOverview() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [classId, setClassId] = useState('all')
  const [termId, setTermId] = useState('')
  const [page, setPage] = useState(0)

  const { data: classes = [] } = useQuery({ queryKey: ['classes'], queryFn: fetchClasses })
  const { data: terms = [] } = useQuery({ queryKey: ['terms'], queryFn: fetchTerms })

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['fee-balances', page, debouncedSearch, classId, termId],
    queryFn: () => fetchFeeBalancesPage({ page, search: debouncedSearch, classId, termId }),
    enabled: termId !== '',
    placeholderData: (previousData) => previousData,
  })

  const balances = data?.balances ?? []
  const total = data?.total ?? 0

  function resetToFirstPage() {
    setPage(0)
  }

  function handleExportCsv() {
    downloadCsv(
      `fee_balances_${new Date().toISOString().slice(0, 10)}.csv`,
      ['Student', 'Admission No', 'Class', 'Total Due', 'Total Paid', 'Balance'],
      balances.map((b) => [
        b.full_name,
        b.admission_number,
        b.class_name,
        b.total_due,
        b.total_paid,
        b.total_balance,
      ]),
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBar
          value={search}
          onChange={(v) => {
            setSearch(v)
            resetToFirstPage()
          }}
        />
        <select
          value={classId}
          onChange={(e) => {
            setClassId(e.target.value)
            resetToFirstPage()
          }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
        >
          <option value="all">All classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={termId}
          onChange={(e) => {
            setTermId(e.target.value)
            resetToFirstPage()
          }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
        >
          <option value="">Select term</option>
          {terms.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} — {t.academic_year}
            </option>
          ))}
        </select>
        <button
          onClick={handleExportCsv}
          disabled={balances.length === 0}
          className="ml-auto rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
        >
          Export CSV
        </button>
      </div>

      <div className="mt-4">
        {termId === '' ? (
          <p className="text-sm text-gray-500">Select a term to view balances.</p>
        ) : isLoading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : balances.length === 0 ? (
          <p className="text-sm text-gray-500">No students found.</p>
        ) : (
          <div className={isFetching ? 'opacity-60 transition-opacity' : ''}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500">
                    <th className="py-2 pr-4">Student</th>
                    <th className="py-2 pr-4">Class</th>
                    <th className="py-2 pr-4">Total Due</th>
                    <th className="py-2 pr-4">Total Paid</th>
                    <th className="py-2 pr-4">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((b) => (
                    <tr key={b.student_id} className="border-b border-gray-100">
                      <td className="py-2 pr-4">{b.full_name}</td>
                      <td className="py-2 pr-4">{b.class_name}</td>
                      <td className="py-2 pr-4">{b.total_due.toLocaleString()}</td>
                      <td className="py-2 pr-4">{b.total_paid.toLocaleString()}</td>
                      <td
                        className={`py-2 pr-4 font-medium ${
                          b.total_balance > 0 ? 'text-red-600' : 'text-green-600'
                        }`}
                      >
                        {b.total_balance.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
          </div>
        )}
      </div>
    </div>
  )
}
