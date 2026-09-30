import { Fragment, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchClasses, PAGE_SIZE } from '../../lib/queries'
import { fetchTerms } from '../../lib/gradesApi'
import { fetchFeeBalanceDetails, fetchFeeBalanceTotals, fetchFeeBalancesPage, fetchFeeCategories } from '../../lib/feesApi'
import { downloadCsv } from '../../lib/csv'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import { SearchBar } from '../SearchBar'
import { Pagination } from '../Pagination'

export function BalancesOverview() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [classId, setClassId] = useState('all')
  const [termId, setTermId] = useState('')
  const [categoryId, setCategoryId] = useState('all')
  const [page, setPage] = useState(0)
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null)

  const { data: classes = [] } = useQuery({ queryKey: ['classes'], queryFn: fetchClasses })
  const { data: terms = [] } = useQuery({ queryKey: ['terms'], queryFn: fetchTerms })
  const { data: categories = [] } = useQuery({ queryKey: ['fee-categories'], queryFn: fetchFeeCategories })

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['fee-balances', page, debouncedSearch, classId, termId, categoryId],
    queryFn: () => fetchFeeBalancesPage({ page, search: debouncedSearch, classId, termId, categoryId }),
    enabled: termId !== '',
    placeholderData: (previousData) => previousData,
  })

  const { data: balanceTotals, isLoading: totalsLoading, isError: totalsError } = useQuery({
    queryKey: ['fee-balance-totals', debouncedSearch, classId, termId, categoryId],
    queryFn: () => fetchFeeBalanceTotals({ search: debouncedSearch, classId, termId, categoryId }),
    enabled: termId !== '',
  })

  const { data: studentDetails = [], isLoading: detailsLoading, isError: detailsError } = useQuery({
    queryKey: ['fee-balance-details', expandedStudentId, termId, categoryId],
    queryFn: () => fetchFeeBalanceDetails({ studentId: expandedStudentId!, termId, categoryId }),
    enabled: !!expandedStudentId && !!termId,
  })

  const balances = data?.balances ?? []
  const total = data?.total ?? 0
  const selectedCategory = categories.find((category) => category.id === categoryId)

  function resetToFirstPage() {
    setPage(0)
    setExpandedStudentId(null)
  }

  function handleExportCsv() {
    downloadCsv(
      `fee_balances_${categoryId === 'all' ? 'all_categories' : categoryId}_${new Date().toISOString().slice(0, 10)}.csv`,
      [
        'Student',
        'Admission No',
        'Class',
        selectedCategory ? `${selectedCategory.name} Due` : 'Total Due',
        selectedCategory ? `${selectedCategory.name} Paid` : 'Total Paid',
        'Balance',
      ],
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
    <div className="rounded-xl border border-gray-200 bg-white p-3 sm:p-6">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
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
          aria-label="Filter balances by class"
          className="w-full min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
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
          aria-label="Filter balances by term"
          className="w-full min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
        >
          <option value="">Select term</option>
          {terms.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} — {t.academic_year}
            </option>
          ))}
        </select>
        <select
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value)
            resetToFirstPage()
          }}
          aria-label="Filter balances by fee category"
          className="w-full min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
        >
          <option value="all">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={balances.length === 0}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 sm:col-span-2 sm:justify-self-end xl:col-span-1 xl:w-auto"
        >
          Export CSV
        </button>
      </div>

      {termId && (
        <section aria-label="Balance totals for current filters" className="mt-4 border-y border-gray-200">
          {totalsError ? (
            <p role="alert" className="py-3 text-sm text-red-600">Balance totals could not be loaded.</p>
          ) : (
            <dl className="grid grid-cols-1 divide-y divide-gray-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <div className="py-3 sm:px-4 sm:first:pl-0">
                <dt className="text-xs font-medium text-gray-500">{selectedCategory ? `${selectedCategory.name} charged` : 'Total charged'}</dt>
                <dd className="mt-1 text-lg font-semibold text-gray-900">{totalsLoading ? '—' : (balanceTotals?.total_due ?? 0).toLocaleString()}</dd>
              </div>
              <div className="py-3 sm:px-4">
                <dt className="text-xs font-medium text-gray-500">Payments received</dt>
                <dd className="mt-1 text-lg font-semibold text-emerald-700">{totalsLoading ? '—' : (balanceTotals?.total_paid ?? 0).toLocaleString()}</dd>
              </div>
              <div className="py-3 sm:px-4 sm:last:pr-0">
                <dt className="text-xs font-medium text-gray-500">Balance remaining</dt>
                <dd className="mt-1 text-lg font-semibold text-rose-700">{totalsLoading ? '—' : (balanceTotals?.total_balance ?? 0).toLocaleString()}</dd>
              </div>
            </dl>
          )}
        </section>
      )}

      <div className="mt-4">
        {termId === '' ? (
          <p className="text-sm text-gray-500">Select a term to view balances.</p>
        ) : isLoading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : balances.length === 0 ? (
          <p className="text-sm text-gray-500">
            {selectedCategory
              ? `No students have a recorded ${selectedCategory.name} charge for this term and filter selection.`
              : 'No students found.'}
          </p>
        ) : (
          <div className={isFetching ? 'opacity-60 transition-opacity' : ''}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[660px] text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500">
                    <th className="py-2 pr-4">Student</th>
                    <th className="py-2 pr-4">Class</th>
                    <th className="py-2 pr-4">{selectedCategory ? `${selectedCategory.name} Due` : 'Total Due'}</th>
                    <th className="py-2 pr-4">{selectedCategory ? `${selectedCategory.name} Paid` : 'Total Paid'}</th>
                    <th className="py-2 pr-4">Balance</th>
                    <th className="py-2 pr-4"><span className="sr-only">Details</span></th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((b) => (
                    <Fragment key={b.student_id}>
                      <tr className="border-b border-gray-100">
                        <td className="py-2 pr-4">
                          <span className="font-medium text-gray-900">{b.full_name}</span>
                          <span className="ml-2 text-xs text-gray-500">{b.admission_number}</span>
                        </td>
                        <td className="py-2 pr-4">{b.class_name}</td>
                        <td className="py-2 pr-4">{b.total_due.toLocaleString()}</td>
                        <td className="py-2 pr-4">{b.total_paid.toLocaleString()}</td>
                        <td className={`py-2 pr-4 font-medium ${b.total_balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {b.total_balance.toLocaleString()}
                        </td>
                        <td className="py-2 pr-4">
                          <button
                            type="button"
                            aria-expanded={expandedStudentId === b.student_id}
                            onClick={() => setExpandedStudentId(expandedStudentId === b.student_id ? null : b.student_id)}
                            className="whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
                          >
                            {expandedStudentId === b.student_id ? 'Hide details' : 'View details'}
                          </button>
                        </td>
                      </tr>
                      {expandedStudentId === b.student_id && (
                        <tr className="border-b border-gray-200 bg-gray-50">
                          <td colSpan={6} className="p-3 sm:p-4">
                            {detailsLoading ? (
                              <p className="text-sm text-gray-500">Loading fee details...</p>
                            ) : detailsError ? (
                              <p role="alert" className="text-sm text-red-600">Fee details could not be loaded.</p>
                            ) : studentDetails.length === 0 ? (
                              <p className="text-sm text-gray-500">No fee details found for this student and term.</p>
                            ) : (
                              <div className="space-y-4">
                                {studentDetails.map((detail) => (
                                  <section key={detail.fee_charge_id} className="border-b border-gray-200 pb-4 last:border-0 last:pb-0">
                                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                                      <h4 className="text-sm font-semibold text-gray-900">{detail.category_name}</h4>
                                      <p className="text-xs text-gray-600">
                                        Due {detail.amount_due.toLocaleString()} · Paid {detail.amount_paid.toLocaleString()} · Balance {detail.balance.toLocaleString()}
                                      </p>
                                    </div>
                                    {detail.is_flexible && detail.items.length > 0 && (
                                      <div className="mt-2">
                                        <p className="text-xs font-medium text-gray-600">Items and collection status</p>
                                        <ul className="mt-1 flex flex-wrap gap-2">
                                          {detail.items.map((item) => (
                                            <li key={item.item_name} className={`rounded-md px-2 py-1 text-xs ${item.is_collected ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
                                              {item.item_name} · {item.is_collected ? `Collected${item.collected_at ? ` ${new Date(item.collected_at).toLocaleDateString()}` : ''}` : 'Not collected'}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                    {detail.payments.length > 0 ? (
                                      <ul className="mt-2 space-y-1">
                                        {detail.payments.map((payment) => (
                                          <li key={payment.id} className="rounded-md bg-white px-3 py-2 text-xs text-gray-600">
                                            <p>Payment date: {payment.payment_date} · {Number(payment.amount).toLocaleString()}{payment.method ? ` · ${payment.method}` : ''}</p>
                                            <p className="mt-0.5 text-gray-500">Posted {new Date(payment.created_at).toLocaleString()} · By {payment.posted_by_name ?? 'User unavailable'}</p>
                                            {payment.paid_for_items.length > 0 && <p className="mt-0.5">Paid for: {payment.paid_for_items.join(', ')}</p>}
                                            {payment.note && <p className="mt-0.5">Note: {payment.note}</p>}
                                          </li>
                                        ))}
                                      </ul>
                                    ) : (
                                      <p className="mt-2 text-xs text-gray-500">No payments recorded for this category.</p>
                                    )}
                                  </section>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
