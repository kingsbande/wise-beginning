import { supabase } from './supabaseClient'
import type { FeatureName } from '../context/FeaturesContext'

export interface PlatformSchool {
  id: string
  name: string
  slug: string
  logo_url: string | null
  created_at: string
  has_flags_row: boolean
  features: Partial<Record<FeatureName, boolean>>
}

export interface CreateSchoolInput {
  name: string
  slug: string
  logo_url: string | null
  features: Record<FeatureName, boolean>
  admin_full_name: string
}

export interface CreateSchoolResult {
  school: { id: string; name: string; slug: string; logo_url: string | null }
  features: Record<string, boolean>
  admin: { username: string; temporary_password: string }
}

// Edge Functions return { error } on failure. Surface that message instead of a generic one.
async function call<T>(functionName: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(functionName, { body })
  if (error) {
    let message = error.message
    const response = (error as { context?: Response }).context
    if (response && typeof response.json === 'function') {
      try {
        const payload = (await response.json()) as { error?: string }
        if (payload?.error) message = payload.error
      } catch {
        // keep the default message
      }
    }
    throw new Error(message)
  }
  return data as T
}

export async function listSchools(): Promise<PlatformSchool[]> {
  const result = await call<{ schools: PlatformSchool[] }>('list-schools-features', {})
  return result.schools
}

export async function setSchoolFeatures(
  schoolId: string,
  features: Partial<Record<FeatureName, boolean>>,
): Promise<void> {
  await call('set-school-feature', { school_id: schoolId, features })
}

export async function createSchool(input: CreateSchoolInput): Promise<CreateSchoolResult> {
  return call<CreateSchoolResult>('create-school', { ...input })
}
