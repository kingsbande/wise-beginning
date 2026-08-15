// Supabase Edge Function: reset-parent-password
//
// Generates a new temporary password for a parent account, sets it
// via the admin API, and flags must_change_password again. Returns
// the new password so the admin can relay it to the parent.
//
// Deploy with: supabase functions deploy reset-parent-password

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

  let payload: { parent_account_id?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  if (!payload.parent_account_id) {
    return json({ error: 'parent_account_id is required' }, 400)
  }

  const { data: account, error: accountError } = await supabaseAdmin
    .from('parent_accounts')
    .select('id, school_id')
    .eq('id', payload.parent_account_id)
    .single()

  if (accountError || !account) {
    return json({ error: 'Parent account not found' }, 404)
  }

  if (account.school_id !== profile.school_id) {
    return json({ error: 'This account does not belong to your school' }, 403)
  }

  const newPassword = generateTempPassword()

  const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(account.id, {
    password: newPassword,
  })

  if (updateAuthError) {
    return json({ error: updateAuthError.message }, 500)
  }

  await supabaseAdmin
    .from('parent_accounts')
    .update({ must_change_password: true })
    .eq('id', account.id)

  return json({ temporary_password: newPassword })
})