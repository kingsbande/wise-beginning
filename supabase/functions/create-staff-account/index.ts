// Supabase Edge Function: create-staff-account
//
// Admin-only. Builds a username from the staff member's own name
// (e.g. "Deliwe Makata" -> "deliwemakata", deduped globally as
// deliwemakata2, deliwemakata3, ... if taken), generates a
// temporary password, and creates the login under a synthetic
// email (username@staff.app) — the admin never has to collect or
// think about a real email address.
//
// Deploy with: supabase functions deploy create-staff-account

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const STAFF_EMAIL_DOMAIN = 'staff.app'

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

async function getCallerAdminProfile(authHeader: string | null) {
  if (!authHeader) return null
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user },
  } = await userClient.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('school_id, role')
    .eq('id', user.id)
    .single()

  // Strictly 'admin' — headteacher must NOT be able to create
  // accounts, per spec.
  if (!profile || profile.role !== 'admin') return null
  return profile as { school_id: string; role: string }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const profile = await getCallerAdminProfile(req.headers.get('Authorization'))
  if (!profile) {
    return json({ error: 'Not authorized' }, 401)
  }

  let payload: { full_name?: string; role?: 'teacher' | 'headteacher' }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  if (!payload.full_name || !payload.role) {
    return json({ error: 'full_name and role are required' }, 400)
  }

  if (payload.role !== 'teacher' && payload.role !== 'headteacher') {
    return json({ error: 'role must be "teacher" or "headteacher"' }, 400)
  }

  const baseUsername = slugifyName(payload.full_name)

  if (baseUsername === '') {
    return json({ error: 'full_name must contain at least one letter or number' }, 400)
  }

  // Dedupe globally (profiles.username is a global-unique column,
  // same reasoning as parent usernames): deliwemakata, deliwemakata2, ...
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

  const temporaryPassword = generateTempPassword()
  const syntheticEmail = `${username}@${STAFF_EMAIL_DOMAIN}`

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: syntheticEmail,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { role: payload.role, full_name: payload.full_name },
  })

  if (createError || !created.user) {
    return json({ error: createError?.message ?? 'Could not create staff account' }, 500)
  }

  const { error: insertError } = await supabaseAdmin.from('profiles').insert({
    id: created.user.id,
    full_name: payload.full_name,
    username,
    role: payload.role,
    school_id: profile.school_id,
    must_change_password: true,
  })

  if (insertError) {
    // Roll back the auth user so we don't leave an orphaned login
    await supabaseAdmin.auth.admin.deleteUser(created.user.id)
    return json({ error: insertError.message }, 500)
  }

  return json({ username, temporary_password: temporaryPassword })
})
