// Supabase Edge Function: toggle-staff-account-status
// Admin-only reversible staff deactivation/reactivation.

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
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

async function getCallerAdmin(authHeader: string | null) {
  if (!authHeader) return null
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabaseAdmin.from('profiles').select('school_id, role').eq('id', user.id).single()
  return profile?.role === 'admin' ? { id: user.id, school_id: profile.school_id } : null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const caller = await getCallerAdmin(req.headers.get('Authorization'))
  if (!caller) return json({ error: 'Not authorized' }, 401)

  let payload: { staff_id?: string; activate?: boolean }
  try { payload = await req.json() } catch { return json({ error: 'Invalid JSON body' }, 400) }
  if (!payload.staff_id || typeof payload.activate !== 'boolean') {
    return json({ error: 'staff_id and activate (boolean) are required' }, 400)
  }
  if (payload.staff_id === caller.id) return json({ error: 'You cannot change your own account status' }, 400)

  const { data: staff, error: staffError } = await supabaseAdmin
    .from('profiles')
    .select('id, school_id, role, is_active')
    .eq('id', payload.staff_id)
    .maybeSingle()
  if (staffError || !staff) return json({ error: 'Staff account not found' }, 404)
  if (staff.school_id !== caller.school_id) return json({ error: 'This account does not belong to your school' }, 403)
  if (staff.role !== 'teacher' && staff.role !== 'headteacher') return json({ error: 'Only staff accounts can be changed here' }, 400)

  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .update({ is_active: payload.activate })
    .eq('id', staff.id)
    .eq('school_id', caller.school_id)
  if (profileError) return json({ error: profileError.message }, 500)

  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(staff.id, {
    ban_duration: payload.activate ? 'none' : '876000h',
  })
  if (authError) {
    await supabaseAdmin.from('profiles').update({ is_active: !payload.activate }).eq('id', staff.id)
    return json({ error: `Account status was not changed: ${authError.message}` }, 500)
  }

  return json({ is_active: payload.activate })
})
