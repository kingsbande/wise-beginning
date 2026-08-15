// Supabase Edge Function: create-parent-account
//
// Given a student_id, this:
//   1. Verifies the caller is an admin, and that the student belongs
//      to the caller's own school (never lets an admin create an
//      account using another school's student).
//   2. Builds a username from the STUDENT's name (e.g. "Hope Bande"
//      -> "hopebande"), deduping globally with a trailing number if
//      taken (hopebande, hopebande2, hopebande3, ...). Usernames are
//      globally unique across all schools, not just within one.
//   3. Generates a temporary password.
//   4. Creates the auth.users row via the admin API (email is a
//      synthetic, never-emailed address — username@parents.app).
//   5. Inserts the parent_accounts row and links it to the student.
//
// Returns { username, temporary_password } so the admin can relay
// them to the parent directly (in person, by phone, on paper —
// whatever the school already does).
//
// Deploy with: supabase functions deploy create-parent-account

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

// "Hope Bande" -> "hopebande" — lowercase, letters/numbers only, no
// separators at all (not even the dots we used to use).
function slugifyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '')
}

function generateTempPassword(): string {
  // Avoids visually ambiguous characters (0/O, 1/l/I) since this
  // gets read aloud or copied down by hand.
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

  let payload: { student_id?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  if (!payload.student_id) {
    return json({ error: 'student_id is required' }, 400)
  }

  const { data: student, error: studentError } = await supabaseAdmin
    .from('students')
    .select('id, full_name, parent_name, parent_phone, school_id, parent_account_id')
    .eq('id', payload.student_id)
    .single()

  if (studentError || !student) {
    return json({ error: 'Student not found' }, 404)
  }

  if (student.school_id !== profile.school_id) {
    return json({ error: 'Student does not belong to your school' }, 403)
  }

  if (student.parent_account_id) {
    return json({ error: 'This student already has a linked parent account' }, 409)
  }

  const baseUsername = slugifyName(student.full_name)

  // Dedupe globally (usernames are unique across the whole app, not
  // just within a school): hopebande, hopebande2, hopebande3, ...
  let username = baseUsername
  let suffix = 1
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data: existing } = await supabaseAdmin
      .from('parent_accounts')
      .select('id')
      .eq('username', username)
      .maybeSingle()

    if (!existing) break
    suffix += 1
    username = `${baseUsername}${suffix}`
  }

  const temporaryPassword = generateTempPassword()
  const syntheticEmail = `${username}@parents.app`

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: syntheticEmail,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { role: 'parent', full_name: student.parent_name },
  })

  if (createError || !created.user) {
    return json({ error: createError?.message ?? 'Could not create parent account' }, 500)
  }

  const { error: insertError } = await supabaseAdmin.from('parent_accounts').insert({
    id: created.user.id,
    school_id: profile.school_id,
    full_name: student.parent_name,
    username,
    phone: student.parent_phone,
    must_change_password: true,
  })

  if (insertError) {
    // Roll back the auth user so we don't leave an orphaned login
    await supabaseAdmin.auth.admin.deleteUser(created.user.id)
    return json({ error: insertError.message }, 500)
  }

  await supabaseAdmin
    .from('students')
    .update({ parent_account_id: created.user.id })
    .eq('id', student.id)

  return json({ username, temporary_password: temporaryPassword })
})
