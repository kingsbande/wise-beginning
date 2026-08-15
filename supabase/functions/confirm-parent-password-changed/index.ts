// Supabase Edge Function: confirm-parent-password-changed
//
// Called by a parent right after they set a new password via
// supabase.auth.updateUser(). This flips must_change_password to
// false on their own parent_accounts row.
//
// Deliberately narrow: this is the ONLY way that flag gets cleared
// from the client side. We don't grant parents a general UPDATE
// RLS policy on parent_accounts, because row-level policies can't
// restrict which columns are writable — a broad policy would let a
// parent also rewrite their own username or reactivate a
// deactivated account. This function can only ever do one specific
// thing, to the caller's own row, verified via their own JWT.
//
// Deploy with: supabase functions deploy confirm-parent-password-changed

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return json({ error: 'Not authorized' }, 401)
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user },
  } = await userClient.auth.getUser()

  if (!user) {
    return json({ error: 'Not authorized' }, 401)
  }

  const { error } = await supabaseAdmin
    .from('parent_accounts')
    .update({ must_change_password: false })
    .eq('id', user.id)

  if (error) {
    return json({ error: error.message }, 500)
  }

  return json({ ok: true })
})
