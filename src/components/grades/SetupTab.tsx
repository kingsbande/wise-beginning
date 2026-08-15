import { ChangeEvent, FormEvent, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchClasses } from '../../lib/queries'
import { uploadImage } from '../../lib/cloudinary'
import { useAuth } from '../../context/AuthContext'
import {
  addProgressReportField,
  addSubject,
  addTerm,
  assignSubjectToClass,
  deleteProgressReportField,
  deleteSubject,
  fetchClassSubjectLinks,
  fetchProgressReportFields,
  fetchSubjects,
  fetchTerms,
  unassignSubjectFromClass,
  updateRegistrationTerms,
  updateSchoolLogo,
} from '../../lib/gradesApi'

export function SetupTab() {
  const { profile, refreshProfile } = useAuth()
  const queryClient = useQueryClient()

  const { data: classes = [] } = useQuery({ queryKey: ['classes'], queryFn: fetchClasses })
  const { data: subjects = [] } = useQuery({ queryKey: ['subjects'], queryFn: fetchSubjects })
  const { data: links = [] } = useQuery({
    queryKey: ['class-subject-links'],
    queryFn: fetchClassSubjectLinks,
  })
  const { data: terms = [] } = useQuery({ queryKey: ['terms'], queryFn: fetchTerms })
  const { data: progressFields = [] } = useQuery({
    queryKey: ['progress-fields'],
    queryFn: fetchProgressReportFields,
  })

  const [newSubjectName, setNewSubjectName] = useState('')
  const [selectedClassId, setSelectedClassId] = useState('')
  const [newTermYear, setNewTermYear] = useState(String(new Date().getFullYear()))
  const [newTermName, setNewTermName] = useState('')
  const [newFieldLabel, setNewFieldLabel] = useState('')
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoError, setLogoError] = useState<string | null>(null)
  const [subjectsError, setSubjectsError] = useState<string | null>(null)
  const [termsText, setTermsText] = useState(profile?.school_registration_terms ?? '')
  const [savingTerms, setSavingTerms] = useState(false)
  const [termsSaved, setTermsSaved] = useState(false)

  const addSubjectMutation = useMutation({
    mutationFn: (name: string) => addSubject(profile!.school_id, name),
    onSuccess: () => {
      setNewSubjectName('')
      queryClient.invalidateQueries({ queryKey: ['subjects'] })
    },
  })

  const deleteSubjectMutation = useMutation({
    mutationFn: deleteSubject,
    onSuccess: () => {
      setSubjectsError(null)
      queryClient.invalidateQueries({ queryKey: ['subjects'] })
      queryClient.invalidateQueries({ queryKey: ['class-subject-links'] })
    },
    onError: () =>
      setSubjectsError('Could not delete — this subject already has grades recorded against it.'),
  })

  const toggleClassSubjectMutation = useMutation({
    mutationFn: async ({ subjectId, linked }: { subjectId: string; linked: boolean }) => {
      if (linked) {
        await unassignSubjectFromClass(selectedClassId, subjectId)
      } else {
        await assignSubjectToClass(selectedClassId, subjectId)
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['class-subject-links'] }),
  })

  const addTermMutation = useMutation({
    mutationFn: () => addTerm(profile!.school_id, newTermYear, newTermName),
    onSuccess: () => {
      setNewTermName('')
      queryClient.invalidateQueries({ queryKey: ['terms'] })
    },
  })

  const addFieldMutation = useMutation({
    mutationFn: (label: string) => addProgressReportField(profile!.school_id, label),
    onSuccess: () => {
      setNewFieldLabel('')
      queryClient.invalidateQueries({ queryKey: ['progress-fields'] })
    },
  })

  const deleteFieldMutation = useMutation({
    mutationFn: deleteProgressReportField,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['progress-fields'] }),
  })

  useEffect(() => {
    setTermsText(profile?.school_registration_terms ?? '')
  }, [profile?.school_registration_terms])

  async function handleLogoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !profile) return

    setLogoError(null)
    setLogoUploading(true)
    try {
      const url = await uploadImage(file)
      await updateSchoolLogo(profile.school_id, url)
      await refreshProfile()
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : 'Logo upload failed.')
    }
    setLogoUploading(false)
  }

  function handleAddSubject(e: FormEvent) {
    e.preventDefault()
    if (newSubjectName.trim() === '') return
    addSubjectMutation.mutate(newSubjectName.trim())
  }

  function handleAddTerm(e: FormEvent) {
    e.preventDefault()
    if (newTermName.trim() === '' || newTermYear.trim() === '') return
    addTermMutation.mutate()
  }

  function handleAddField(e: FormEvent) {
    e.preventDefault()
    if (newFieldLabel.trim() === '') return
    addFieldMutation.mutate(newFieldLabel.trim())
  }

  async function handleSaveTerms() {
    if (!profile) return
    setSavingTerms(true)
    setTermsSaved(false)
    try {
      await updateRegistrationTerms(profile.school_id, termsText)
      await refreshProfile()
      setTermsSaved(true)
    } finally {
      setSavingTerms(false)
    }
  }

  const linkedSubjectIdsForClass = new Set(
    links.filter((l) => l.class_id === selectedClassId).map((l) => l.subject_id),
  )

  return (
    <div className="space-y-6">
      {/* School logo */}
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="text-base font-semibold text-gray-900">School Logo</h3>
        <p className="mt-1 text-sm text-gray-500">Embedded on grade and progress report PDFs.</p>
        <div className="mt-3 flex items-center gap-4">
          {profile?.school_logo_url && (
            <img
              src={profile.school_logo_url}
              alt="School logo"
              className="h-14 w-14 rounded-lg border border-gray-200 object-contain"
            />
          )}
          <input
            type="file"
            accept="image/*"
            onChange={handleLogoChange}
            className="block text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-gray-800"
          />
        </div>
        {logoUploading && <p className="mt-1 text-xs text-gray-500">Uploading...</p>}
        {logoError && <p className="mt-1 text-xs text-red-600">{logoError}</p>}
      </section>

      {/* Registration PDF terms & conditions */}
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="text-base font-semibold text-gray-900">Registration PDF Terms & Conditions</h3>
        <p className="mt-1 text-sm text-gray-500">
          Freeform text — terms and conditions, a welcome note, contact details, anything you want
          printed at the bottom of the registration confirmation PDF. Leave blank to omit it entirely.
        </p>
        <textarea
          value={termsText}
          onChange={(e) => setTermsText(e.target.value)}
          rows={5}
          placeholder="e.g. By registering, the parent/guardian agrees to..."
          className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
        />
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={handleSaveTerms}
            disabled={savingTerms}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {savingTerms ? 'Saving...' : 'Save'}
          </button>
          {termsSaved && <span className="text-sm text-green-600">Saved.</span>}
        </div>
      </section>

      {/* Subjects */}
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="text-base font-semibold text-gray-900">Subjects</h3>
        <p className="mt-1 text-sm text-gray-500">
          Your school's own subject list — add or remove as needed.
        </p>

        <form onSubmit={handleAddSubject} className="mt-3 flex gap-2">
          <input
            value={newSubjectName}
            onChange={(e) => setNewSubjectName(e.target.value)}
            placeholder="e.g. Agriculture"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
          />
          <button
            type="submit"
            disabled={addSubjectMutation.isPending}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            Add
          </button>
        </form>

        {subjectsError && <p className="mt-2 text-xs text-red-600">{subjectsError}</p>}

        <ul className="mt-3 divide-y divide-gray-100">
          {subjects.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2 text-sm">
              <span>{s.name}</span>
              <button
                onClick={() => deleteSubjectMutation.mutate(s.id)}
                className="text-xs font-medium text-red-600 underline hover:text-red-800"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Class <-> Subject assignment */}
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="text-base font-semibold text-gray-900">Assign Subjects to Classes</h3>
        <p className="mt-1 text-sm text-gray-500">
          Pick a class, then tick which subjects apply to it (e.g. Nursery won't need every subject
          Standard 8 has).
        </p>

        <select
          value={selectedClassId}
          onChange={(e) => setSelectedClassId(e.target.value)}
          className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none sm:w-64"
        >
          <option value="">Select a class</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        {selectedClassId && (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {subjects.map((s) => {
              const linked = linkedSubjectIdsForClass.has(s.id)
              return (
                <label
                  key={s.id}
                  className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={linked}
                    onChange={() =>
                      toggleClassSubjectMutation.mutate({ subjectId: s.id, linked })
                    }
                  />
                  {s.name}
                </label>
              )
            })}
          </div>
        )}
      </section>

      {/* Terms */}
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="text-base font-semibold text-gray-900">Terms</h3>

        <form onSubmit={handleAddTerm} className="mt-3 flex flex-wrap gap-2">
          <input
            value={newTermYear}
            onChange={(e) => setNewTermYear(e.target.value)}
            placeholder="2026"
            className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
          />
          <input
            value={newTermName}
            onChange={(e) => setNewTermName(e.target.value)}
            placeholder="e.g. Term 1"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
          />
          <button
            type="submit"
            disabled={addTermMutation.isPending}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            Add
          </button>
        </form>

        <ul className="mt-3 divide-y divide-gray-100">
          {terms.map((t) => (
            <li key={t.id} className="py-2 text-sm text-gray-700">
              {t.name} — {t.academic_year}
            </li>
          ))}
        </ul>
      </section>

      {/* Progress report fields */}
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="text-base font-semibold text-gray-900">Progress Report Fields</h3>
        <p className="mt-1 text-sm text-gray-500">
          These are the sections that appear on every student's progress report — add whatever your
          school actually uses (comments, conduct, attendance, skills, anything).
        </p>

        <form onSubmit={handleAddField} className="mt-3 flex gap-2">
          <input
            value={newFieldLabel}
            onChange={(e) => setNewFieldLabel(e.target.value)}
            placeholder="e.g. Sports & Talents"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
          />
          <button
            type="submit"
            disabled={addFieldMutation.isPending}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            Add
          </button>
        </form>

        <ul className="mt-3 divide-y divide-gray-100">
          {progressFields.map((f) => (
            <li key={f.id} className="flex items-center justify-between py-2 text-sm">
              <span>{f.label}</span>
              <button
                onClick={() => deleteFieldMutation.mutate(f.id)}
                className="text-xs font-medium text-red-600 underline hover:text-red-800"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
