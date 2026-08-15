// Supabase Edge Function: delete-parent-account
//
// Permanently removes the parent's login (auth.users row) and their
// parent_accounts row. Any students linked to this account have
// their parent_account_id cleared automatically (ON DELETE SET NULL
// on the students table), so student records are never deleted by
// this action — only the parent's login.
//
// Deploy with: supabase functions deploy delete-parent-account

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

  // Delete the DB row first — if this fails we haven't destroyed the login yet.
  const { error: deleteRowError } = await supabaseAdmin
    .from('parent_accounts')
    .delete()
    .eq('id', account.id)

  if (deleteRowError) {
    return json({ error: deleteRowError.message }, 500)
  }

  const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(account.id)

  if (deleteAuthError) {
    return json({ error: deleteAuthError.message }, 500)
  }

  return json({ deleted: true })
})