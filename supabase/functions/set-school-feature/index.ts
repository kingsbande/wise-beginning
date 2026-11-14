// Supabase Edge Function: set-school-feature
// Platform owner only. Merges a set of feature switches into one school's flags.
// Body: { school_id: string, features: { [featureName]: boolean } }
// Deploy with: supabase functions deploy set-school-feature --project-ref <ref>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const FEATURES: readonly string[] = [
  'attendance',
  'fees',
  'grades',
  'weekly_assessments',
  'curriculum_topics',
  'analytics',
  'weekly_reviews',
  'promotions',
  'progress_reports',
  'parent_portal',
  'staff_records',
  'sms_notifications',
]

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function requirePlatformAdmin(authHeader: string | null): Promise<string | null> {
  if (!authHeader) return null
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user },
  } = await userClient.auth.getUser()
  if (!user) return null

  const { data } = await supabaseAdmin
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  return data ? user.id : null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const adminId = await requirePlatformAdmin(req.headers.get('Authorization'))
  if (!adminId) {
    return json({ error: 'Not authorized' }, 403)
  }

  let payload: { school_id?: string; features?: unknown }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  if (!payload.school_id) {
    return json({ error: 'school_id is required' }, 400)
  }
  if (
    typeof payload.features !== 'object' ||
    payload.features === null ||
    Array.isArray(payload.features)
  ) {
    return json({ error: 'features must be an object of true/false values' }, 400)
  }

  const patch: Record<string, boolean> = {}
  for (const [key, value] of Object.entries(payload.features as Record<string, unknown>)) {
    if (!FEATURES.includes(key)) {
      return json({ error: `Unknown feature: ${key}` }, 400)
    }
    if (typeof value !== 'boolean') {
      return json({ error: `Feature ${key} must be true or false` }, 400)
    }
    patch[key] = value
  }
  if (Object.keys(patch).length === 0) {
    return json({ error: 'No features to change' }, 400)
  }

  const { data: school } = await supabaseAdmin
    .from('schools')
    .select('id')
    .eq('id', payload.school_id)
    .maybeSingle()
  if (!school) {
    return json({ error: 'School not found' }, 404)
  }

  const { data: existing } = await supabaseAdmin
    .from('school_features')
    .select('features')
    .eq('school_id', payload.school_id)
    .maybeSingle()

  const merged = { ...((existing?.features ?? {}) as Record<string, boolean>), ...patch }

  const { error } = await supabaseAdmin.from('school_features').upsert(
    {
      school_id: payload.school_id,
      features: merged,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'school_id' },
  )
  if (error) {
    return json({ error: error.message }, 500)
  }

  return json({ school_id: payload.school_id, features: merged })
})
