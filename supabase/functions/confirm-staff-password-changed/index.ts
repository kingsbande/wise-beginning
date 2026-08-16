// Supabase Edge Function: confirm-staff-password-changed
//
// Same reasoning as confirm-parent-password-changed: this is the
// only way must_change_password gets cleared from the client side,
// deliberately narrow rather than a general "update your own
// profile" grant (profiles already has a broader self-update
// policy for avatar changes, but that's guarded by a trigger that
// clamps role/school_id — must_change_password isn't part of that
// trigger's clamp, so a dedicated function keeps this one flag's
// write path explicit and auditable).
//
// Deploy with: supabase functions deploy confirm-staff-password-changed

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
    .from('profiles')
    .update({ must_change_password: false })
    .eq('id', user.id)

  if (error) {
    return json({ error: error.message }, 500)
  }

  return json({ ok: true })
})
