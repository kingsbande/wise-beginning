import { useState } from 'react'
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
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="mb-4 text-lg font-semibold text-gray-900">Fees</h1>

      <div className="mb-6 flex gap-2 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={
              tab === t.id
                ? 'border-b-2 border-gray-900 px-3 py-2 text-sm font-medium text-gray-900'
                : 'px-3 py-2 text-sm text-gray-500 hover:text-gray-900'
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
