// Supabase Edge Function: reset-staff-password
// Admin-only password reset for a teacher or headteacher in the same school.

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

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const maxValidByte = Math.floor(256 / chars.length) * chars.length
  let password = ''

  while (password.length < 10) {
    const bytes = crypto.getRandomValues(new Uint8Array(10 - password.length))
    for (const byte of bytes) {
      if (byte < maxValidByte) password += chars[byte % chars.length]
      if (password.length === 10) break
    }
  }

  return password
}

async function getCallerAdmin(authHeader: string | null) {
  if (!authHeader) return null

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return null

  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('id, school_id, role')
    .eq('id', user.id)
    .maybeSingle()
  if (error || profile?.role !== 'admin') return null

  return { id: profile.id, school_id: profile.school_id }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const caller = await getCallerAdmin(req.headers.get('Authorization'))
  if (!caller) return json({ error: 'Not authorized' }, 401)

  let payload: { staff_id?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  if (!payload.staff_id) return json({ error: 'staff_id is required' }, 400)
  if (payload.staff_id === caller.id) return json({ error: 'You cannot reset your own account here' }, 400)

  const { data: staff, error: staffError } = await supabaseAdmin
    .from('profiles')
    .select('id, school_id, role, username, must_change_password')
    .eq('id', payload.staff_id)
    .maybeSingle()
  if (staffError || !staff) return json({ error: 'Staff account not found' }, 404)
  if (staff.school_id !== caller.school_id) return json({ error: 'This account does not belong to your school' }, 403)
  if (staff.role !== 'teacher' && staff.role !== 'headteacher') {
    return json({ error: 'Only teacher and headteacher accounts can be reset here' }, 400)
  }
  if (!staff.username) return json({ error: 'This staff account has no username' }, 400)

  const { data: updatedProfile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .update({ must_change_password: true })
    .eq('id', staff.id)
    .eq('school_id', caller.school_id)
    .select('id')
    .maybeSingle()
  if (profileError || !updatedProfile) {
    return json({ error: profileError?.message ?? 'Could not require a password change' }, 500)
  }

  const temporaryPassword = generateTempPassword()
  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(staff.id, {
    password: temporaryPassword,
  })
  if (authError) {
    const { error: rollbackError } = await supabaseAdmin
      .from('profiles')
      .update({ must_change_password: staff.must_change_password })
      .eq('id', staff.id)
      .eq('school_id', caller.school_id)

    return json({
      error: rollbackError
        ? `Password reset failed: ${authError.message}. Could not restore the password-change flag: ${rollbackError.message}`
        : authError.message,
    }, 500)
  }

  return json({ username: staff.username, temporary_password: temporaryPassword })
})
