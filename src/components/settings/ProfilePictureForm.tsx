import { ChangeEvent, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { uploadImage } from '../../lib/cloudinary'
import { updateOwnAvatar } from '../../lib/settings/settingsApi'

function getInitials(name?: string | null) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}

export function ProfilePictureForm() {
  const { profile, refreshProfile } = useAuth()
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !profile) return

    setError(null)
    setSuccess(false)
    setPreview(URL.createObjectURL(file))
    setUploading(true)

    try {
      const url = await uploadImage(file)
      await updateOwnAvatar(profile.id, url)
      await refreshProfile()
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const displayImage = preview ?? profile?.avatar_url ?? null

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <h3 className="text-base font-semibold text-gray-900">Profile Picture</h3>
      <p className="mt-1 text-sm text-gray-500">Shown in the dashboard header.</p>

      <div className="mt-4 flex items-center gap-4">
        {displayImage ? (
          <img
            src={displayImage}
            alt={profile?.full_name ?? 'Profile'}
            className="h-16 w-16 rounded-full border border-gray-200 object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-lg font-semibold text-gray-500">
            {getInitials(profile?.full_name)}
          </div>
        )}

        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="block text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-gray-800"
        />
      </div>

      {uploading && <p className="mt-2 text-xs text-gray-500">Uploading...</p>}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {success && !uploading && <p className="mt-2 text-xs text-green-600">Profile picture updated.</p>}
    </section>
  )
}
