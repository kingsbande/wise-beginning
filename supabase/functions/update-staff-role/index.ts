// Supabase Edge Function: update-staff-role
// Admin-only role changes between teacher and headteacher.

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
  return profile?.role === 'admin' ? { school_id: profile.school_id } : null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const caller = await getCallerAdmin(req.headers.get('Authorization'))
  if (!caller) return json({ error: 'Not authorized' }, 401)

  let payload: { staff_id?: string; role?: string }
  try { payload = await req.json() } catch { return json({ error: 'Invalid JSON body' }, 400) }
  if (!payload.staff_id || (payload.role !== 'teacher' && payload.role !== 'headteacher')) {
    return json({ error: 'staff_id and a valid staff role are required' }, 400)
  }

  const { data: staff, error: staffError } = await supabaseAdmin
    .from('profiles')
    .select('id, school_id, role')
    .eq('id', payload.staff_id)
    .maybeSingle()
  if (staffError || !staff) return json({ error: 'Staff account not found' }, 404)
  if (staff.school_id !== caller.school_id) return json({ error: 'This account does not belong to your school' }, 403)
  if (staff.role !== 'teacher' && staff.role !== 'headteacher') return json({ error: 'Only teacher and headteacher roles can be changed here' }, 400)

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('profiles')
    .update({ role: payload.role })
    .eq('id', staff.id)
    .eq('school_id', caller.school_id)
    .eq('role', staff.role)
    .select('role')
    .maybeSingle()
  if (updateError) return json({ error: updateError.message }, 500)
  if (!updated) return json({ error: 'Staff role changed concurrently. Refresh and try again.' }, 409)

  return json({ role: updated.role })
})