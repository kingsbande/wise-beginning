import { ChangeEvent, FormEvent, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { uploadStudentPhoto } from '../lib/cloudinary'
import { fetchClasses } from '../lib/queries'
import { generateRegistrationConfirmationPdf } from '../lib/pdf'
import { useAuth } from '../context/AuthContext'
import { NewStudentInput } from '../types'

const registrationSteps: Array<{ id: 'student' | 'parent' | 'details'; label: string }> = [
  { id: 'student', label: 'Student' },
  { id: 'parent', label: 'Parent' },
  { id: 'details', label: 'Details' },
]

function defaultAcademicYear() {
  return String(new Date().getFullYear())
}

function defaultDateJoined() {
  return new Date().toISOString().slice(0, 10)
}

const emptyForm: NewStudentInput = {
  full_name: '',
  date_of_birth: '',
  age: '',
  gender: 'male',
  class_id: '',
  parent_name: '',
  parent_phone: '',
  parent_occupation: '',
  health_notes: '',
  former_school: '',
  pickup_person: '',
  location: '',
  address: '',
  academic_year: defaultAcademicYear(),
  date_joined: defaultDateJoined(),
  government_code: '',
  photo_url: null,
}

interface StudentRegistrationFormProps {
  // Optional — the form invalidates the shared ['students'] query
  // itself, so this fires even if Registration and Records live in
  // separate sections/routes with no shared parent state.
  onRegistered?: () => void
}

export function StudentRegistrationForm({ onRegistered }: StudentRegistrationFormProps = {}) {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const { data: classes = [] } = useQuery({ queryKey: ['classes'], queryFn: fetchClasses })
  const [form, setForm] = useState<NewStudentInput>(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<{ studentName: string; admissionNumber: string } | null>(
    null,
  )
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [step, setStep] = useState<'student' | 'parent' | 'details'>('student')

  function updateField<K extends keyof NewStudentInput>(key: K, value: NewStudentInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function goToStep(nextStep: 'student' | 'parent' | 'details') {
    setStep(nextStep)
  }

  function handlePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setPhotoFile(file)
    setPhotoPreview(file ? URL.createObjectURL(file) : null)
  }

  function generateAdmissionNumber() {
    const year = new Date().getFullYear()
    const random = Math.floor(1000 + Math.random() * 9000)
    return `${year}-${random}`
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()

    // Prevent submission if we're not on the final step
    if (step !== 'details') {
      goToStep(step === 'student' ? 'parent' : 'details')
      return
    }

    setError(null)
    setSubmitting(true)

    if (!profile) {
      setSubmitting(false)
      setError('Could not determine your school. Please sign in again.')
      return
    }

    let photo_url: string | null = null
    if (photoFile) {
      setUploadingPhoto(true)
      try {
        photo_url = await uploadStudentPhoto(photoFile)
      } catch (uploadErr) {
        setUploadingPhoto(false)
        setSubmitting(false)
        setError(uploadErr instanceof Error ? uploadErr.message : 'Photo upload failed.')
        return
      }
      setUploadingPhoto(false)
    }

    const admission_number = generateAdmissionNumber()

    const { data: inserted, error: insertError } = await supabase
      .from('students')
      .insert({
        ...form,
        admission_number,
        age: form.age === '' ? null : form.age,
        school_id: profile.school_id,
        photo_url,
      })
      .select('id, admission_number, full_name')
      .single()

    if (insertError || !inserted) {
      setSubmitting(false)
      setError(insertError?.message ?? 'Could not register student.')
      return
    }

    const className = classes.find((c) => c.id === form.class_id)?.name ?? ''

    // Fire-and-forget notification call: registration has already
    // succeeded, so a notify failure shouldn't block the admin.
    supabase.functions
      .invoke('notify-registration', {
        body: {
          student_id: inserted.id,
          full_name: inserted.full_name,
          admission_number: inserted.admission_number,
          class_name: className,
          parent_name: form.parent_name,
          parent_phone: form.parent_phone,
        },
      })
      .catch((err) => console.error('Notification call failed:', err))

    setSubmitting(false)
    setConfirmation({ studentName: inserted.full_name, admissionNumber: inserted.admission_number })
    setForm({ ...emptyForm, academic_year: defaultAcademicYear(), date_joined: defaultDateJoined() })
    setPhotoFile(null)
    setPhotoPreview(null)
    queryClient.invalidateQueries({ queryKey: ['students'] })
    onRegistered?.()
  }

  async function downloadConfirmationPdf() {
    if (!confirmation || !profile) return

    setGeneratingPdf(true)
    try {
      await generateRegistrationConfirmationPdf({
        schoolName: profile.school_name,
        logoUrl: profile.school_logo_url,
        studentName: confirmation.studentName,
        admissionNumber: confirmation.admissionNumber,
        registrationDate: new Date().toLocaleDateString(),
        termsAndConditions: profile.school_registration_terms,
      })
    } finally {
      setGeneratingPdf(false)
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Register a Student</h2>
              <p className="text-sm text-slate-500">Complete the form one step at a time.</p>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-xs text-slate-500">
              Step {registrationSteps.findIndex((item) => item.id === step) + 1} of {registrationSteps.length}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {registrationSteps.map((item) => {
              const isActive = item.id === step
              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setStep(item.id)}
                  className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                    isActive
                      ? 'border-rose-500 bg-rose-50 text-rose-700'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {item.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-4">
          {step === 'student' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Student Photo</label>
                <div className="mt-1 flex items-center gap-4">
                  {photoPreview && (
                    <img
                      src={photoPreview}
                      alt="Preview"
                      className="h-16 w-16 rounded-full object-cover border border-slate-200"
                    />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoChange}
                    className="block text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-rose-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-rose-500"
                  />
                </div>
                {uploadingPhoto && <p className="mt-1 text-xs text-slate-500">Uploading photo...</p>}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Full Name</label>
                  <input
                    required
                    value={form.full_name}
                    onChange={(e) => updateField('full_name', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Date of Birth</label>
                  <input
                    type="date"
                    required
                    value={form.date_of_birth}
                    onChange={(e) => updateField('date_of_birth', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Age</label>
                  <input
                    type="number"
                    min={0}
                    max={25}
                    value={form.age}
                    onChange={(e) => updateField('age', e.target.value === '' ? '' : Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Gender</label>
                  <select
                    value={form.gender}
                    onChange={(e) => updateField('gender', e.target.value as 'male' | 'female')}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40"
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Class</label>
                  <select
                    required
                    value={form.class_id}
                    onChange={(e) => updateField('class_id', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40"
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
                  <label className="block text-sm font-medium text-slate-700">Academic Year</label>
                  <input
                    required
                    value={form.academic_year}
                    onChange={(e) => updateField('academic_year', e.target.value)}
                    placeholder="2026"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Date Joined</label>
                  <input
                    type="date"
                    required
                    value={form.date_joined}
                    onChange={(e) => updateField('date_joined', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 'parent' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Parent/Guardian Name</label>
                  <input
                    required
                    value={form.parent_name}
                    onChange={(e) => updateField('parent_name', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Parent/Guardian Phone</label>
                  <input
                    required
                    type="tel"
                    placeholder="+265..."
                    value={form.parent_phone}
                    onChange={(e) => updateField('parent_phone', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Parent/Guardian Occupation</label>
                  <input
                    value={form.parent_occupation}
                    onChange={(e) => updateField('parent_occupation', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Authorized Pickup Person</label>
                  <input
                    value={form.pickup_person}
                    onChange={(e) => updateField('pickup_person', e.target.value)}
                    placeholder="If different from parent/guardian"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 'details' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Location (Village/Township)</label>
                  <input
                    value={form.location}
                    onChange={(e) => updateField('location', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Former School</label>
                  <input
                    value={form.former_school}
                    onChange={(e) => updateField('former_school', e.target.value)}
                    placeholder="Leave blank if none"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Government Code</label>
                  <input
                    value={form.government_code}
                    onChange={(e) => updateField('government_code', e.target.value)}
                    placeholder="Optional"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Full Address</label>
                  <textarea
                    value={form.address}
                    onChange={(e) => updateField('address', e.target.value)}
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Sickness / Disease / Allergies
                  </label>
                  <textarea
                    value={form.health_notes}
                    onChange={(e) => updateField('health_notes', e.target.value)}
                    rows={2}
                    placeholder="Leave blank if none"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => goToStep(step === 'student' ? 'student' : step === 'parent' ? 'student' : 'parent')}
            disabled={step === 'student'}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Back
          </button>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="submit"
              disabled={submitting || uploadingPhoto}
              className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-500 disabled:opacity-50"
            >
              {step !== 'details' ? 'Next' : submitting ? 'Registering...' : 'Register Student'}
            </button>
          </div>
        </div>
      </form>

      {confirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-lg">
            <h3 className="text-lg font-semibold text-slate-900">Registration Successful</h3>
            <p className="mt-3 text-sm text-slate-700">
              Thank you for joining {profile?.school_name ?? 'the school'},{' '}
              <span className="font-medium">{confirmation.studentName}</span> has been registered
              successfully.
            </p>

            <div className="mt-6 flex flex-col gap-2">
              <button
                onClick={downloadConfirmationPdf}
                disabled={generatingPdf}
                className="rounded-lg bg-rose-600 py-2 text-sm font-medium text-white hover:bg-rose-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60 disabled:opacity-50"
              >
                {generatingPdf ? 'Preparing PDF...' : 'Download as PDF'}
              </button>
              <button
                onClick={() => setConfirmation(null)}
                className="rounded-lg border border-slate-300 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
