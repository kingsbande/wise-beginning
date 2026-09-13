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

async function getAuthenticatedUser(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return null

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user },
  } = await userClient.auth.getUser()

  return user
}

async function getSchoolId(userId: string): Promise<string | null> {
  const { data: staffProfile } = await supabaseAdmin
    .from('profiles')
    .select('school_id')
    .eq('id', userId)
    .maybeSingle()

  if (staffProfile?.school_id) return staffProfile.school_id

  const { data: parentAccount } = await supabaseAdmin
    .from('parent_accounts')
    .select('school_id')
    .eq('id', userId)
    .maybeSingle()

  return parentAccount?.school_id ?? null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const user = await getAuthenticatedUser(req)
  if (!user) return json({ error: 'Not authorized' }, 401)

  let payload: {
    error_type?: string
    message?: string
    page?: string
    context?: Record<string, unknown>
  }

  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const errorType = payload.error_type?.trim()
  const message = payload.message?.trim()
  if (!errorType || !message) {
    return json({ error: 'error_type and message are required' }, 400)
  }

  const { error } = await supabaseAdmin.from('error_logs').insert({
    school_id: await getSchoolId(user.id),
    user_id: user.id,
    error_type: errorType.slice(0, 100),
    message: message.slice(0, 2000),
    page: payload.page?.trim().slice(0, 500) ?? null,
    context: payload.context ?? null,
  })

  if (error) {
    console.error('Could not persist application error log:', error)
    return json({ error: 'Could not save error log' }, 500)
  }

  return json({ ok: true })
})
