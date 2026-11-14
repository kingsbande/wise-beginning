import { ChangeEvent, FormEvent, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { FEATURE_CATALOG, featureMap, PLAN_PRESETS, PlanPreset } from '../lib/featureCatalog'
import {
  createSchool,
  CreateSchoolInput,
  CreateSchoolResult,
  listSchools,
  PlatformSchool,
  setSchoolFeatures,
} from '../lib/platformApi'
import { FeatureName } from '../context/FeaturesContext'
import { uploadImage } from '../lib/cloudinary'

const SCHOOLS_QUERY_KEY = ['platform-schools']
const RESERVED_SLUGS = new Set(['platform', 'api', 's', 'admin', 'login', 'assets', 'app', 'www'])
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
const LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const MAX_LOGO_SIZE = 2 * 1024 * 1024

function suggestedSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function effectiveFeatures(school: PlatformSchool): Record<FeatureName, boolean> {
  if (!school.has_flags_row) return featureMap(FEATURE_CATALOG.map((feature) => feature.name))
  return featureMap(FEATURE_CATALOG
    .filter((feature) => school.features[feature.name] === true)
    .map((feature) => feature.name))
}

function planLabel(plan: PlanPreset) {
  const names = PLAN_PRESETS[plan].map((name) =>
    FEATURE_CATALOG.find((feature) => feature.name === name)?.label.toLowerCase() ?? name,
  )
  return `${plan[0].toUpperCase()}${plan.slice(1)}: ${names.join(', ')}`
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
}

export function Platform() {
  const queryClient = useQueryClient()
  const schoolsQuery = useQuery({ queryKey: SCHOOLS_QUERY_KEY, queryFn: listSchools })
  const [schoolErrors, setSchoolErrors] = useState<Record<string, string>>({})
  const [copyMessage, setCopyMessage] = useState('')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createdSchool, setCreatedSchool] = useState<CreateSchoolResult | null>(null)

  const featureMutation = useMutation({
    mutationFn: ({ schoolId, features }: { schoolId: string; features: Record<FeatureName, boolean> }) =>
      setSchoolFeatures(schoolId, features),
    onMutate: async ({ schoolId, features }) => {
      await queryClient.cancelQueries({ queryKey: SCHOOLS_QUERY_KEY })
      const previous = queryClient.getQueryData<PlatformSchool[]>(SCHOOLS_QUERY_KEY)
      queryClient.setQueryData<PlatformSchool[]>(SCHOOLS_QUERY_KEY, (schools) =>
        schools?.map((school) => school.id === schoolId
          ? { ...school, has_flags_row: true, features }
          : school),
      )
      setSchoolErrors((errors) => ({ ...errors, [schoolId]: '' }))
      return { previous, schoolId }
    },
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(SCHOOLS_QUERY_KEY, context.previous)
      if (context) setSchoolErrors((errors) => ({ ...errors, [context.schoolId]: error.message }))
    },
    onSuccess: async (_data, variables) => {
      setSchoolErrors((errors) => ({ ...errors, [variables.schoolId]: '' }))
      await queryClient.invalidateQueries({ queryKey: SCHOOLS_QUERY_KEY })
    },
  })

  const createMutation = useMutation<void, Error, CreateSchoolInput>({
    mutationFn: async (input) => {
      const result = await createSchool(input)
      setCreatedSchool(result)
    },
    gcTime: 0,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SCHOOLS_QUERY_KEY })
    },
  })

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopyMessage(`${label} copied`)
      window.setTimeout(() => setCopyMessage(''), 1800)
    } catch {
      setCopyMessage('Could not copy to clipboard')
      window.setTimeout(() => setCopyMessage(''), 2500)
    }
  }

  function updateSchoolFeatures(school: PlatformSchool, name: FeatureName, enabled: boolean) {
    const features = effectiveFeatures(school)
    features[name] = enabled
    featureMutation.mutate({ schoolId: school.id, features })
  }

  if (schoolsQuery.isLoading) {
    return <main className="p-6 text-sm text-gray-500">Loading schools...</main>
  }

  if (schoolsQuery.isError) {
    if (schoolsQuery.error.message === 'Not authorized') {
      return (
        <main className="space-y-3 p-6">
          <p className="text-gray-700">This page is for the platform owner.</p>
          <Link to="/" className="text-sm font-medium text-rose-700 hover:underline">Back to home</Link>
        </main>
      )
    }
    return (
      <main className="space-y-3 p-6">
        <p role="alert" className="text-sm text-rose-700">{schoolsQuery.error.message}</p>
        <button
          type="button"
          onClick={() => void schoolsQuery.refetch()}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
        >
          Try again
        </button>
      </main>
    )
  }

  const schools = schoolsQuery.data ?? []

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-col gap-3 border-b border-gray-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Platform</h1>
          <p className="mt-1 text-sm text-gray-500">{schools.length} {schools.length === 1 ? 'school' : 'schools'}</p>
        </div>
        <button
          type="button"
          onClick={() => { setCreatedSchool(null); setIsCreateOpen((open) => !open) }}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
        >
          {isCreateOpen ? 'Close form' : 'Create school'}
        </button>
      </header>

      {copyMessage && <p role="status" className="text-sm text-gray-600">{copyMessage}</p>}

      {isCreateOpen && (
        <CreateSchoolPanel
          createdSchool={createdSchool}
          isSubmitting={createMutation.isPending}
          serverError={createMutation.error?.message ?? null}
          onSubmit={(input) => createMutation.mutate(input)}
          onClearError={() => createMutation.reset()}
          onCreateAnother={() => { createMutation.reset(); setCreatedSchool(null) }}
          onDone={() => { createMutation.reset(); setCreatedSchool(null); setIsCreateOpen(false) }}
          onCopy={copyText}
        />
      )}

      <section aria-label="Schools" className="space-y-4">
        {schools.length === 0 ? (
          <p className="rounded-lg border border-gray-200 bg-white p-5 text-sm text-gray-500">No schools yet.</p>
        ) : schools.map((school) => {
          const link = `${window.location.origin}/s/${school.slug}`
          const features = effectiveFeatures(school)
          const isSaving = featureMutation.isPending && featureMutation.variables?.schoolId === school.id
          return (
            <article key={school.id} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 items-start gap-4">
                  {school.logo_url ? (
                    <img src={school.logo_url} alt={`${school.name} logo`} className="h-14 w-14 rounded-full border border-gray-200 object-cover" />
                  ) : (
                    <div aria-hidden="true" className="flex h-14 w-14 flex-none items-center justify-center rounded-full bg-gray-100 text-lg font-semibold text-gray-600">
                      {school.name.trim().charAt(0).toUpperCase() || '?'}
                    </div>
                  )}
                  <div className="min-w-0 space-y-1">
                    <h2 className="text-lg font-semibold text-gray-900">{school.name}</h2>
                    <p className="text-sm text-gray-500">Link name: {school.slug}</p>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <a href={link} className="break-all text-rose-700 hover:underline">{link}</a>
                      <button type="button" onClick={() => void copyText(link, 'School link')} className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">Copy link</button>
                    </div>
                    <p className="text-xs text-gray-500">Created {formatDate(school.created_at)}</p>
                  </div>
                </div>
                <div className="w-full max-w-sm">
                  <label className="mb-1 block text-xs font-medium text-gray-600" htmlFor={`plan-${school.id}`}>Apply plan</label>
                  <select
                    id={`plan-${school.id}`}
                    value=""
                    disabled={isSaving}
                    onChange={(event) => {
                      const plan = event.target.value as PlanPreset | ''
                      if (!plan) return
                      const confirmed = window.confirm(`Apply the ${plan} plan to ${school.name}? This replaces all feature settings for this school.`)
                      if (confirmed) featureMutation.mutate({ schoolId: school.id, features: featureMap(PLAN_PRESETS[plan]) })
                      event.target.value = ''
                    }}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800"
                  >
                    <option value="">Choose a plan...</option>
                    {(['basic', 'standard', 'full'] as PlanPreset[]).map((plan) => <option key={plan} value={plan}>{planLabel(plan)}</option>)}
                  </select>
                </div>
              </div>

              {schoolErrors[school.id] && <p role="alert" className="mt-4 text-sm text-rose-700">{schoolErrors[school.id]}</p>}

              <div className="mt-5 grid gap-3 border-t border-gray-100 pt-4 sm:grid-cols-2">
                {FEATURE_CATALOG.map((feature) => {
                  const enabled = features[feature.name]
                  return (
                    <div key={feature.name} className="flex items-center justify-between gap-4 rounded-md bg-gray-50 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800">{feature.label}</p>
                        <p className="text-xs text-gray-500">{feature.description}</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={enabled}
                        aria-label={`${feature.label} for ${school.name}`}
                        disabled={isSaving}
                        onClick={() => updateSchoolFeatures(school, feature.name, !enabled)}
                        className={`relative h-6 w-11 flex-none rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 disabled:opacity-50 ${enabled ? 'bg-rose-700' : 'bg-gray-300'}`}
                      >
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </button>
                    </div>
                  )
                })}
              </div>
              {isSaving && <p role="status" className="mt-3 text-xs text-gray-500">Saving feature settings...</p>}
            </article>
          )
        })}
      </section>
    </main>
  )
}

function CreateSchoolPanel({
  createdSchool,
  isSubmitting,
  serverError,
  onSubmit,
  onClearError,
  onCreateAnother,
  onDone,
  onCopy,
}: {
  createdSchool: CreateSchoolResult | null
  isSubmitting: boolean
  serverError: string | null
  onSubmit: (input: CreateSchoolInput) => void
  onClearError: () => void
  onCreateAnother: () => void
  onDone: () => void
  onCopy: (value: string, label: string) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoError, setLogoError] = useState('')
  const [adminFullName, setAdminFullName] = useState('')
  const [selectedFeatures, setSelectedFeatures] = useState<FeatureName[]>(PLAN_PRESETS.basic)
  const [plan, setPlan] = useState<PlanPreset | 'custom'>('basic')
  const [isUploading, setIsUploading] = useState(false)
  const [formError, setFormError] = useState('')
  const [logoPreview, setLogoPreview] = useState('')

  useEffect(() => {
    if (!logoFile) {
      setLogoPreview('')
      return
    }
    const objectUrl = URL.createObjectURL(logoFile)
    setLogoPreview(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [logoFile])

  const normalizedSlug = slug.trim()
  const slugValid = SLUG_PATTERN.test(normalizedSlug)
    && normalizedSlug.length <= 40
    && !RESERVED_SLUGS.has(normalizedSlug)
  const logoValid = !!logoFile && LOGO_TYPES.has(logoFile.type) && logoFile.size <= MAX_LOGO_SIZE
  const nameValid = name.trim().length >= 2 && name.trim().length <= 120
  const adminValid = adminFullName.trim().length > 0
  const canSubmit = nameValid && slugValid && logoValid && adminValid && !isSubmitting && !isUploading

  function resetForm() {
    setName('')
    setSlug('')
    setSlugEdited(false)
    setLogoFile(null)
    setLogoError('')
    setAdminFullName('')
    setSelectedFeatures(PLAN_PRESETS.basic)
    setPlan('basic')
    setFormError('')
  }

  function handleLogoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    event.target.value = ''
    setLogoError('')
    setLogoFile(null)
    if (!file) return
    if (!LOGO_TYPES.has(file.type)) {
      setLogoError('Choose a PNG, JPG or WebP image.')
      return
    }
    if (file.size > MAX_LOGO_SIZE) {
      setLogoError('The logo must be 2 MB or smaller.')
      return
    }
    setLogoFile(file)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit || !logoFile) return
    setFormError('')
    onClearError()
    setIsUploading(true)
    try {
      const logoUrl = await uploadImage(logoFile)
      onSubmit({
        name: name.trim(),
        slug: normalizedSlug,
        logo_url: logoUrl,
        features: featureMap(selectedFeatures),
        admin_full_name: adminFullName.trim(),
      })
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'The logo could not be uploaded.')
    } finally {
      setIsUploading(false)
    }
  }

  if (createdSchool) {
    const schoolLink = `${window.location.origin}/s/${createdSchool.school.slug}`
    return (
      <section aria-labelledby="created-school-heading" className="space-y-4 rounded-lg border border-emerald-200 bg-white p-5 shadow-sm">
        <div>
          <h2 id="created-school-heading" className="text-lg font-semibold text-gray-900">School created</h2>
          <p className="text-sm text-gray-600">{createdSchool.school.name}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <CopyValue label="School link" value={schoolLink} onCopy={onCopy} />
          <CopyValue label="Admin username" value={createdSchool.admin.username} onCopy={onCopy} />
          <CopyValue label="Temporary password" value={createdSchool.admin.temporary_password} onCopy={onCopy} />
        </div>
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">The password is shown once. Give it to the admin now. They must change it at first sign-in.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => { resetForm(); onCreateAnother() }} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700">Create another school</button>
          <button type="button" onClick={onDone} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Done</button>
        </div>
      </section>
    )
  }

  return (
    <section aria-labelledby="create-school-heading" className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <h2 id="create-school-heading" className="mb-5 text-lg font-semibold text-gray-900">Create school</h2>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="school-name" className="mb-1 block text-sm font-medium text-gray-700">School name</label>
            <input id="school-name" value={name} required minLength={2} maxLength={120} onChange={(event) => {
              const value = event.target.value
              setName(value)
              if (!slugEdited) setSlug(suggestedSlug(value))
              setFormError('')
              onClearError()
            }} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500" />
            <p className="mt-1 text-xs text-gray-500">Use 2 to 120 characters.</p>
          </div>
          <div>
            <label htmlFor="school-slug" className="mb-1 block text-sm font-medium text-gray-700">Link name</label>
            <input id="school-slug" value={slug} required maxLength={40} onChange={(event) => {
              setSlug(event.target.value)
              setSlugEdited(true)
              setFormError('')
              onClearError()
            }} aria-describedby="school-link-preview school-slug-help" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500" />
            <p id="school-slug-help" className="mt-1 text-xs text-gray-500">Lowercase letters and numbers with single hyphens; 40 characters max.</p>
            <p id="school-link-preview" className="mt-1 break-all text-xs text-rose-700">{window.location.origin}/s/{normalizedSlug || 'link-name'}</p>
            {normalizedSlug && !slugValid && <p role="alert" className="mt-1 text-xs text-rose-700">Enter a valid, non-reserved link name.</p>}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="school-logo" className="mb-1 block text-sm font-medium text-gray-700">Logo (required)</label>
            <input id="school-logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoChange} className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200" />
            <p className="mt-1 text-xs text-gray-500">PNG, JPG or WebP, up to 2 MB.</p>
            {logoError && <p role="alert" className="mt-1 text-xs text-rose-700">{logoError}</p>}
            {logoPreview && <img src={logoPreview} alt="Selected school logo preview" className="mt-3 h-16 w-16 rounded-full border border-gray-200 object-cover" />}
          </div>
          <div>
            <label htmlFor="first-admin-name" className="mb-1 block text-sm font-medium text-gray-700">First admin's full name</label>
            <input id="first-admin-name" value={adminFullName} required onChange={(event) => { setAdminFullName(event.target.value); setFormError(''); onClearError() }} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500" />
          </div>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-gray-700">Feature plan</legend>
          <label htmlFor="new-school-plan" className="sr-only">Feature plan</label>
          <select id="new-school-plan" value={plan} onChange={(event) => {
            const value = event.target.value as PlanPreset | 'custom'
            setPlan(value)
            if (value !== 'custom') setSelectedFeatures(PLAN_PRESETS[value])
          }} className="mb-3 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 sm:max-w-md">
            {(['basic', 'standard', 'full'] as PlanPreset[]).map((preset) => <option key={preset} value={preset}>{planLabel(preset)}</option>)}
            <option value="custom">Custom</option>
          </select>
          <div className="grid gap-2 sm:grid-cols-2">
            {FEATURE_CATALOG.map((feature) => (
              <label key={feature.name} className="flex items-start gap-2 rounded-md bg-gray-50 px-3 py-2">
                <input type="checkbox" checked={selectedFeatures.includes(feature.name)} onChange={(event) => {
                  const next = event.target.checked
                    ? [...selectedFeatures, feature.name]
                    : selectedFeatures.filter((name) => name !== feature.name)
                  setSelectedFeatures(next)
                  setPlan('custom')
                }} className="mt-0.5 accent-rose-700" />
                <span>
                  <span className="block text-sm font-medium text-gray-800">{feature.label}</span>
                  <span className="block text-xs text-gray-500">{feature.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {(formError || serverError) && <p role="alert" className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{formError || serverError}</p>}
        <button type="submit" disabled={!canSubmit} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50">
          {isUploading || isSubmitting ? 'Creating…' : 'Create school'}
        </button>
      </form>
    </section>
  )
}

function CopyValue({ label, value, onCopy }: { label: string; value: string; onCopy: (value: string, label: string) => Promise<void> }) {
  return (
    <div className="min-w-0 rounded-md border border-gray-200 p-3">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <div className="mt-1 flex items-start justify-between gap-2">
        <p className="min-w-0 break-all text-sm text-gray-900">{value}</p>
        <button type="button" onClick={() => void onCopy(value, label)} className="flex-none rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">Copy</button>
      </div>
    </div>
  )
}
