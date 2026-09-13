import { useState } from 'react'
import { EnterGradesTab } from '../components/grades/EnterGradesTab'
import { ViewGradesTab } from '../components/grades/ViewGradesTab'

type Tab = 'enter' | 'view'

export function Grades() {
  const [tab, setTab] = useState<Tab>('enter')

  const tabs: { id: Tab; label: string }[] = [
    { id: 'enter', label: 'Enter Grades' },
    { id: 'view', label: 'View Grades' },
  ]

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="mb-4 text-lg font-semibold text-gray-900">Grades</h1>

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

      {tab === 'enter' && <EnterGradesTab />}
      {tab === 'view' && <ViewGradesTab />}
    </div>
  )
}
