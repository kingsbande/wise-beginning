import { ProfilePictureForm } from '../components/settings/ProfilePictureForm'
import { ChangePasswordForm } from '../components/settings/ChangePasswordForm'

// Named SettingsPage (not Settings) to avoid colliding with the
// lucide-react `Settings` icon already imported in AdminDashboard.
export function SettingsPage() {
  return (
    <div className="space-y-6">
      <ProfilePictureForm />
      <ChangePasswordForm />
    </div>
  )
}
