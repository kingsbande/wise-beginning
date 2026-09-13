import { ProfilePictureForm } from '../components/settings/ProfilePictureForm'
import { ChangePasswordForm } from '../components/settings/ChangePasswordForm'
import { SetupTab } from '../components/settings/SetupTab'
import { useState } from 'react'

type Tab = 'profile' | 'school'

// Named SettingsPage (not Settings) to avoid colliding with the
// lucide-react `Settings` icon already imported in AdminDashboard.
export function SettingsPage() {
  const [tab, setTab] = useState<Tab>('profile')

  const tabs: { id: Tab; label: string }[] = [
    { id: 'profile', label: 'My Profile' },
    { id: 'school', label: 'School Setup' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-gray-200">
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

      {tab === 'profile' && (
        <div className="space-y-6">
          <ProfilePictureForm />
          <ChangePasswordForm />
        </div>
      )}

      {tab === 'school' && <SetupTab />}
    </div>
  )
}
