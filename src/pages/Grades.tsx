import { useEffect, useState } from 'react'
import { StudentProgressionView } from '../components/admin/StudentProgressionView'
import { EnterGradesTab } from '../components/grades/EnterGradesTab'
import { ViewGradesTab } from '../components/grades/ViewGradesTab'
import { FeatureName, useFeatures } from '../context/FeaturesContext'

type Tab = 'enter' | 'view' | 'progression'

export function Grades() {
  const [tab, setTab] = useState<Tab>('enter')
  const { ready: featuresReady, isEnabled } = useFeatures()

  const tabs: { id: Tab; label: string }[] = [
    { id: 'enter', label: 'Enter Grades' },
    { id: 'view', label: 'View Grades' },
    { id: 'progression', label: 'Student Progression' },
  ]
  const featureForTab: Record<Tab, FeatureName> = {
    enter: 'grades',
    view: 'grades',
    progression: 'promotions',
  }
  const visibleTabs = tabs.filter(({ id }) => isEnabled(featureForTab[id]))

  useEffect(() => {
    if (featuresReady && !isEnabled(featureForTab[tab])) {
      setTab(visibleTabs[0]?.id ?? 'enter')
    }
  }, [featuresReady, tab, isEnabled])

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="mb-4 text-lg font-semibold text-gray-900">Grades</h1>

      <div className="mb-6 flex gap-2 border-b border-gray-200">
        {visibleTabs.map((t) => (
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

      {tab === 'enter' && isEnabled('grades') && <EnterGradesTab />}
      {tab === 'view' && isEnabled('grades') && <ViewGradesTab />}
      {tab === 'progression' && isEnabled('promotions') && <StudentProgressionView />}
    </div>
  )
}
