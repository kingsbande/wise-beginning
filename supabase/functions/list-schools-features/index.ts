// Supabase Edge Function: list-schools-features
// Platform owner only. Returns every school with its logo and feature flags.
// Deploy with: supabase functions deploy list-schools-features --project-ref <ref>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

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

  const [schoolsResult, flagsResult] = await Promise.all([
    supabaseAdmin
      .from('schools')
      .select('id, name, slug, logo_url, created_at')
      .order('created_at', { ascending: false }),
    supabaseAdmin.from('school_features').select('school_id, features'),
  ])

  if (schoolsResult.error) {
    return json({ error: schoolsResult.error.message }, 500)
  }
  if (flagsResult.error) {
    return json({ error: flagsResult.error.message }, 500)
  }

  const flagsBySchool = new Map<string, Record<string, boolean>>()
  for (const row of flagsResult.data ?? []) {
    flagsBySchool.set(row.school_id as string, (row.features ?? {}) as Record<string, boolean>)
  }

  const schools = (schoolsResult.data ?? []).map((school: Record<string, unknown>) => ({
    id: school.id as string,
    name: school.name as string,
    slug: school.slug as string,
    logo_url: (school.logo_url ?? null) as string | null,
    created_at: school.created_at as string,
    has_flags_row: flagsBySchool.has(school.id as string),
    features: flagsBySchool.get(school.id as string) ?? {},
  }))

  return json({ schools })
})
