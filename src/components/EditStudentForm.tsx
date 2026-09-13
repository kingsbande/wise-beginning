import { ChangeEvent, FormEvent, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { uploadStudentPhoto } from '../lib/cloudinary'
import { ClassRoom, Student } from '../types'
import { getUserFriendlyError } from '../lib/errorMessages'
import { logError } from '../lib/errorLogger'

interface EditStudentFormProps {
  student: Student
  classes: ClassRoom[]
  onSaved: () => void
  onCancel: () => void
}

export function EditStudentForm({ student, classes, onSaved, onCancel }: EditStudentFormProps) {
  const [form, setForm] = useState({
    full_name: student.full_name,
    date_of_birth: student.date_of_birth,
    age: student.age ?? ('' as number | ''),
    gender: student.gender,
    class_id: classes.find((c) => c.name === student.class_name)?.id ?? '',
    parent_name: student.parent_name,
    parent_phone: student.parent_phone,
    parent_occupation: student.parent_occupation ?? '',
    health_notes: student.health_notes ?? '',
    former_school: student.former_school ?? '',
    pickup_person: student.pickup_person ?? '',
    location: student.location ?? '',
    address: student.address ?? '',
    academic_year: student.academic_year,
    date_joined: student.date_joined,
    government_code: student.government_code ?? '',
  })
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(student.photo_url)
  const [saving, setSaving] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handlePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setPhotoFile(file)
    setPhotoPreview(file ? URL.createObjectURL(file) : student.photo_url)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)

    let photo_url = student.photo_url
    if (photoFile) {
      setUploadingPhoto(true)
      try {
        photo_url = await uploadStudentPhoto(photoFile)
      } catch (uploadErr) {
        setUploadingPhoto(false)
        setSaving(false)
        void logError(uploadErr, { type: 'student_photo_upload' })
        setError(getUserFriendlyError(uploadErr, 'The student photo could not be uploaded. Please try again.'))
        return
      }
      setUploadingPhoto(false)
    }

    const { error: updateError } = await supabase
      .from('students')
      .update({
        ...form,
        age: form.age === '' ? null : form.age,
        photo_url,
      })
      .eq('id', student.id)

    setSaving(false)

    if (updateError) {
      void logError(updateError, { type: 'student_update' })
      setError(getUserFriendlyError(updateError, 'We could not save the student changes. Please try again.'))
      return
    }

    onSaved()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg bg-white p-4">
      <div className="flex items-center gap-4">
        {photoPreview && (
          <img
            src={photoPreview}
            alt="Preview"
            className="h-14 w-14 rounded-full border border-gray-200 object-cover"
          />
        )}
        <input
          type="file"
          accept="image/*"
          onChange={handlePhotoChange}
          className="block text-xs text-gray-600 file:mr-2 file:rounded-lg file:border-0 file:bg-gray-900 file:px-2 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-gray-800"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-medium text-gray-700">Full Name</label>
          <input
            required
            value={form.full_name}
            onChange={(e) => updateField('full_name', e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700">Date of Birth</label>
          <input
            type="date"
            value={form.date_of_birth}
            onChange={(e) => updateField('date_of_birth', e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700">Age</label>
          <input
            type="number"
            min={0}
            max={25}
            value={form.age}
            onChange={(e) => updateField('age', e.target.value === '' ? '' : Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700">Gender</label>
          <select
            value={form.gender}
            onChange={(e) => updateField('gender', e.target.value as 'male' | 'female')}
            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
          >
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700">Class</label>
          <select
            required
            value={form.class_id}
            onChange={(e) => updateField('class_id', e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
          >
            <option value="" disabled>
              Select a class
            </option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700">Academic Year</label>
          <input
            required
            value={form.academic_year}
            onChange={(e) => updateField('academic_year', e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700">Date Joined</label>
          <input
            type="date"
            required
            value={form.date_joined}
            onChange={(e) => updateField('date_joined', e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700">Government Code</label>
          <input
            value={form.government_code}
            onChange={(e) => updateField('government_code', e.target.value)}
            placeholder="Optional"
            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700">Former School</label>
          <input
            value={form.former_school}
            onChange={(e) => updateField('former_school', e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700">Parent/Guardian Name</label>
          <input
            required
            value={form.parent_name}
            onChange={(e) => updateField('parent_name', e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700">Parent/Guardian Phone</label>
          <input
            required
            type="tel"
            value={form.parent_phone}
            onChange={(e) => updateField('parent_phone', e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700">Parent/Guardian Occupation</label>
          <input
            value={form.parent_occupation}
            onChange={(e) => updateField('parent_occupation', e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700">Authorized Pickup Person</label>
          <input
            value={form.pickup_person}
            onChange={(e) => updateField('pickup_person', e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700">Location</label>
          <input
            value={form.location}
            onChange={(e) => updateField('location', e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700">Full Address</label>
        <textarea
          value={form.address}
          onChange={(e) => updateField('address', e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700">Sickness / Disease / Allergies</label>
        <textarea
          value={form.health_notes}
          onChange={(e) => updateField('health_notes', e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
        />
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving || uploadingPhoto}
          className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
