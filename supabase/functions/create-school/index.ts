// Supabase Edge Function: create-school
// Platform owner only. Creates a school, sets its feature flags and creates its
// first admin login. The database trigger seeds classes, subjects, terms, grade
// scale, report fields and fee categories for the new school.
// Body: { name, slug, logo_url?, features?, admin_full_name }
// Returns the school and the admin's username and temporary password (shown once).
// Deploy with: supabase functions deploy create-school --project-ref <ref>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const STAFF_EMAIL_DOMAIN = 'staff.app'
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
const RESERVED_SLUGS: readonly string[] = [
  'platform',
  'api',
  's',
  'admin',
  'login',
  'assets',
  'app',
  'www',
]
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
// Tables the new-school trigger fills. Their school_id foreign keys have no cascade,
// so they must be emptied before a half-created school can be removed.
const SEEDED_TABLES: readonly string[] = [
  'classes',
  'subjects',
  'terms',
  'grade_scale',
  'progress_report_fields',
  'fee_categories',
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

function slugifyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '')
}

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let pw = ''
  for (let i = 0; i < 10; i++) {
    pw += chars[Math.floor(Math.random() * chars.length)]
  }
  return pw
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

async function cleanupSchool(schoolId: string) {
  for (const table of SEEDED_TABLES) {
    await supabaseAdmin.from(table).delete().eq('school_id', schoolId)
  }
  await supabaseAdmin.from('schools').delete().eq('id', schoolId)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const callerId = await requirePlatformAdmin(req.headers.get('Authorization'))
  if (!callerId) {
    return json({ error: 'Not authorized' }, 403)
  }

  let payload: {
    name?: string
    slug?: string
    logo_url?: string | null
    features?: unknown
    admin_full_name?: string
  }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const name = (payload.name ?? '').trim()
  const slug = (payload.slug ?? '').trim().toLowerCase()
  const adminFullName = (payload.admin_full_name ?? '').trim()
  const logoUrl = payload.logo_url ? String(payload.logo_url).trim() : null

  if (name.length < 2 || name.length > 120) {
    return json({ error: 'School name must be 2 to 120 characters' }, 400)
  }
  if (!SLUG_PATTERN.test(slug) || slug.length > 40 || RESERVED_SLUGS.includes(slug)) {
    return json(
      { error: 'Link name must use lowercase letters, numbers and single hyphens, and not be a reserved word' },
      400,
    )
  }
  if (logoUrl && !logoUrl.startsWith('https://res.cloudinary.com/')) {
    return json({ error: 'The logo must be uploaded through the app' }, 400)
  }
  const baseUsername = slugifyName(adminFullName)
  if (baseUsername === '') {
    return json({ error: 'The first admin needs a full name' }, 400)
  }

  const requested =
    payload.features && typeof payload.features === 'object' && !Array.isArray(payload.features)
      ? (payload.features as Record<string, unknown>)
      : {}
  for (const key of Object.keys(requested)) {
    if (!FEATURES.includes(key)) {
      return json({ error: `Unknown feature: ${key}` }, 400)
    }
  }
  const features: Record<string, boolean> = {}
  for (const key of FEATURES) {
    features[key] = requested[key] === true
  }

  const { data: slugClash } = await supabaseAdmin
    .from('schools')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()
  if (slugClash) {
    return json({ error: 'That link name is already used by another school' }, 409)
  }
  const { data: nameClash } = await supabaseAdmin
    .from('schools')
    .select('id')
    .eq('name', name)
    .maybeSingle()
  if (nameClash) {
    return json({ error: 'A school with that name already exists' }, 409)
  }

  // Usernames are unique across all schools: hopebande, hopebande2, hopebande3, ...
  let username = baseUsername
  let suffix = 1
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data: existing } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle()
    if (!existing) break
    suffix += 1
    username = `${baseUsername}${suffix}`
  }

  const { data: school, error: schoolError } = await supabaseAdmin
    .from('schools')
    .insert({ name, slug, logo_url: logoUrl })
    .select('id, name, slug, logo_url')
    .single()
  if (schoolError || !school) {
    return json({ error: schoolError?.message ?? 'Could not create the school' }, 500)
  }
  const schoolId = school.id as string

  const { error: featuresError } = await supabaseAdmin.from('school_features').upsert(
    { school_id: schoolId, features, updated_at: new Date().toISOString() },
    { onConflict: 'school_id' },
  )
  if (featuresError) {
    await cleanupSchool(schoolId)
    return json({ error: featuresError.message }, 500)
  }

  const temporaryPassword = generateTempPassword()
  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: `${username}@${STAFF_EMAIL_DOMAIN}`,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { role: 'admin', full_name: adminFullName },
  })
  if (createError || !created.user) {
    await cleanupSchool(schoolId)
    return json({ error: createError?.message ?? 'Could not create the admin login' }, 500)
  }

  const { error: profileError } = await supabaseAdmin.from('profiles').insert({
    id: created.user.id,
    full_name: adminFullName,
    username,
    role: 'admin',
    school_id: schoolId,
    must_change_password: true,
  })
  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(created.user.id)
    await cleanupSchool(schoolId)
    return json({ error: profileError.message }, 500)
  }

  return json({
    school,
    features,
    admin: { username, temporary_password: temporaryPassword },
  })
})
