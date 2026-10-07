import { useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { BalancesOverview } from '../components/fees/BalancesOverview'
import { RecordPaymentPanel } from '../components/fees/RecordPaymentPanel'
import { FeesSetupTab } from '../components/fees/FeesSetupTab'

type Tab = 'balances' | 'record' | 'setup'

export function Fees() {
  const [tab, setTab] = useState<Tab>('balances')

  const tabs: { id: Tab; label: string }[] = [
    { id: 'balances', label: 'Balances' },
    { id: 'record', label: 'Record Payments' },
    { id: 'setup', label: 'Setup' },
  ]

  return (
    <div className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-6 sm:py-8">
      <PageHeader title="Fees" description="Track balances, record payments, and configure fee structures." />

      <div className="mb-6 flex gap-2 overflow-x-auto border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={
              tab === t.id
                ? 'shrink-0 whitespace-nowrap border-b-2 border-gray-900 px-3 py-2 text-sm font-medium text-gray-900'
                : 'shrink-0 whitespace-nowrap px-3 py-2 text-sm text-gray-500 hover:text-gray-900'
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'balances' && <BalancesOverview />}
      {tab === 'record' && <RecordPaymentPanel />}
      {tab === 'setup' && <FeesSetupTab />}
    </div>
  )
}
