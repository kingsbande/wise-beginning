// Supabase Edge Function: delete-staff-account
// Admin-only permanent deletion with historical-reference preflight.

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

async function countReference(table: string, column: string, staffId: string) {
  const { count, error } = await supabaseAdmin.from(table).select('id', { count: 'exact', head: true }).eq(column, staffId)
  if (error) throw new Error(`${table}: ${error.message}`)
  return count ?? 0
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const caller = await getCallerAdmin(req.headers.get('Authorization'))
  if (!caller) return json({ error: 'Not authorized' }, 401)

  let payload: { staff_id?: string }
  try { payload = await req.json() } catch { return json({ error: 'Invalid JSON body' }, 400) }
  if (!payload.staff_id) return json({ error: 'staff_id is required' }, 400)
  if (payload.staff_id === caller.id) return json({ error: 'You cannot delete your own account' }, 400)

  const { data: staff, error: staffError } = await supabaseAdmin
    .from('profiles')
    .select('id, school_id, role, full_name')
    .eq('id', payload.staff_id)
    .maybeSingle()
  if (staffError || !staff) return json({ error: 'Staff account not found' }, 404)
  if (staff.school_id !== caller.school_id) return json({ error: 'This account does not belong to your school' }, 403)
  if (staff.role !== 'teacher' && staff.role !== 'headteacher') return json({ error: 'Only staff accounts can be deleted here' }, 400)

  const referenceChecks = [
    ['teacher_assignments', 'teacher_id', 'teaching assignments'],
    ['teacher_certifications', 'teacher_id', 'certifications'],
    ['teacher_details', 'id', 'staff details'],
    ['weekly_performance_reviews', 'teacher_id', 'weekly reviews'],
    ['curriculum_topics', 'teacher_id', 'curriculum topics'],
    ['classes', 'class_teacher_id', 'class-teacher assignments'],
    ['attendance_records', 'marked_by', 'attendance records'],
    ['fee_payments', 'recorded_by', 'fee payments'],
    ['grade_releases', 'released_by', 'grade releases'],
    ['grades', 'entered_by', 'grades'],
    ['progress_report_entries', 'entered_by', 'progress report entries'],
    ['student_status_history', 'changed_by', 'student status history'],
    ['students', 'created_by', 'student registrations'],
  ] as const

  const references: string[] = []
  try {
    for (const [table, column, label] of referenceChecks) {
      if (await countReference(table, column, staff.id) > 0) references.push(label)
    }
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not check account references' }, 500)
  }

  if (references.length > 0) {
    return json({
      error: 'This staff account cannot be deleted because it is referenced by existing records.',
      references,
    }, 409)
  }

  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(staff.id)
  if (deleteError) return json({ error: deleteError.message }, 500)

  return json({ deleted: true, full_name: staff.full_name })
})
