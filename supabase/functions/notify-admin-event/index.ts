// Verifies completed school actions before creating in-app notifications for admins.
// Apply the matching migration and deploy with:
//   supabase functions deploy notify-admin-event
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

type EventPayload =
  | {
      event_type: 'grade_saved'
      class_id: string
      subject_id: string
      term_id: string
      assessment_type: 'midterm' | 'end_of_term'
    }
  | { event_type: 'grades_released'; class_id: string; term_id: string }
  | { event_type: 'attendance_saved'; class_id: string; date: string }
  | { event_type: 'topic_verified'; topic_id: string }

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

async function getCaller(authHeader: string | null) {
  if (!authHeader) return null

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: userError } = await userClient.auth.getUser()
  if (userError || !user) return null

  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('id, school_id, role, full_name, is_active')
    .eq('id', user.id)
    .single()

  if (error || !profile?.is_active) return null
  return {
    id: user.id,
    school_id: profile.school_id,
    role: profile.role,
    full_name: profile.full_name,
  }
}

async function getClass(classId: string, schoolId: string) {
  const { data, error } = await supabaseAdmin
    .from('classes')
    .select('id, name, school_id, class_teacher_id')
    .eq('id', classId)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (error) throw error
  return data
}

async function createNotification(
  schoolId: string,
  eventType: EventPayload['event_type'],
  title: string,
  message: string,
  metadata: Record<string, string | number>,
) {
  const { data: admins, error: adminsError } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('school_id', schoolId)
    .eq('role', 'admin')
    .eq('is_active', true)

  if (adminsError) throw adminsError
  if (!admins?.length) return

  const { error } = await supabaseAdmin.from('admin_notifications').insert(
    admins.map((admin) => ({
      school_id: schoolId,
      recipient_id: admin.id,
      event_type: eventType,
      title,
      message,
      metadata,
    })),
  )
  if (error) throw error
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const caller = await getCaller(req.headers.get('Authorization'))
  if (!caller) return json({ error: 'Not authorized' }, 401)

  let payload: EventPayload
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  if (!payload || typeof payload !== 'object' || typeof payload.event_type !== 'string') {
    return json({ error: 'Invalid notification event' }, 400)
  }

  try {
    if (payload.event_type === 'grade_saved') {
      if (!payload.class_id || !payload.subject_id || !payload.term_id
        || !['midterm', 'end_of_term'].includes(payload.assessment_type)) {
        return json({ error: 'Grade event details are incomplete' }, 400)
      }

      const classRow = await getClass(payload.class_id, caller.school_id)
      if (!classRow) return json({ error: 'Class not found' }, 404)

      const { data: grades, error: gradesError } = await supabaseAdmin
        .from('grades')
        .select('student_id, students!inner(class_id)')
        .eq('entered_by', caller.id)
        .eq('subject_id', payload.subject_id)
        .eq('term_id', payload.term_id)
        .eq('assessment_type', payload.assessment_type)
        .eq('students.class_id', payload.class_id)

      if (gradesError) throw gradesError
      if (!grades?.length) return json({ error: 'No matching saved grades were found' }, 403)

      const [{ data: subject, error: subjectError }, { data: term, error: termError }] = await Promise.all([
        supabaseAdmin.from('subjects').select('name').eq('id', payload.subject_id).eq('school_id', caller.school_id).maybeSingle(),
        supabaseAdmin.from('terms').select('name, academic_year').eq('id', payload.term_id).eq('school_id', caller.school_id).maybeSingle(),
      ])
      if (subjectError) throw subjectError
      if (termError) throw termError
      if (!subject || !term) return json({ error: 'Subject or term not found' }, 404)

      await createNotification(
        caller.school_id,
        payload.event_type,
        'Grades saved',
        `${caller.full_name} saved grades for ${classRow.name} — ${subject.name} (${term.name}, ${term.academic_year}).`,
        {
          class_id: payload.class_id,
          subject_id: payload.subject_id,
          term_id: payload.term_id,
          assessment_type: payload.assessment_type,
        },
      )
      return json({ ok: true })
    }

    if (payload.event_type === 'grades_released') {
      if (!payload.class_id || !payload.term_id) return json({ error: 'Release details are incomplete' }, 400)
      const classRow = await getClass(payload.class_id, caller.school_id)
      if (!classRow) return json({ error: 'Class not found' }, 404)

      const { data: release, error: releaseError } = await supabaseAdmin
        .from('grade_releases')
        .select('class_id')
        .eq('class_id', payload.class_id)
        .eq('term_id', payload.term_id)
        .eq('released_by', caller.id)
        .maybeSingle()
      if (releaseError) throw releaseError
      if (!release) return json({ error: 'No matching grade release was found' }, 403)

      const { data: term, error: termError } = await supabaseAdmin
        .from('terms')
        .select('name, academic_year')
        .eq('id', payload.term_id)
        .eq('school_id', caller.school_id)
        .maybeSingle()
      if (termError) throw termError
      if (!term) return json({ error: 'Term not found' }, 404)

      await createNotification(
        caller.school_id,
        payload.event_type,
        'Grades released',
        `Grades for ${classRow.name} were released for ${term.name}, ${term.academic_year}.`,
        { class_id: payload.class_id, term_id: payload.term_id },
      )
      return json({ ok: true })
    }

    if (payload.event_type === 'attendance_saved') {
      if (!payload.class_id || !/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) {
        return json({ error: 'Attendance details are incomplete' }, 400)
      }
      const classRow = await getClass(payload.class_id, caller.school_id)
      if (!classRow) return json({ error: 'Class not found' }, 404)

      if (caller.role !== 'admin') {
        const { data: assignment, error: assignmentError } = await supabaseAdmin
          .from('teacher_assignments')
          .select('id')
          .eq('teacher_id', caller.id)
          .eq('class_id', payload.class_id)
          .eq('school_id', caller.school_id)
          .limit(1)
          .maybeSingle()
        if (assignmentError) throw assignmentError
        if (classRow.class_teacher_id !== caller.id && !assignment) {
          return json({ error: 'Not authorized for this class' }, 403)
        }
      }

      await createNotification(
        caller.school_id,
        payload.event_type,
        'Attendance updated',
        `${caller.full_name} updated attendance for ${classRow.name} on ${payload.date}.`,
        { class_id: payload.class_id, date: payload.date },
      )
      return json({ ok: true })
    }

    if (payload.event_type === 'topic_verified') {
      if (!payload.topic_id) return json({ error: 'Topic details are incomplete' }, 400)

      const { data: topic, error: topicError } = await supabaseAdmin
        .from('curriculum_topics')
        .select('id, school_id, class_id, title, approval_status, reviewed_by')
        .eq('id', payload.topic_id)
        .eq('school_id', caller.school_id)
        .eq('approval_status', 'verified')
        .eq('reviewed_by', caller.id)
        .maybeSingle()
      if (topicError) throw topicError
      if (!topic) return json({ error: 'No matching verified topic was found' }, 403)

      const classRow = await getClass(topic.class_id, caller.school_id)
      if (!classRow) return json({ error: 'Class not found' }, 404)
      await createNotification(
        caller.school_id,
        payload.event_type,
        'Curriculum topic verified',
        `${caller.full_name} verified "${topic.title}" for ${classRow.name}.`,
        { topic_id: topic.id, class_id: topic.class_id },
      )
      return json({ ok: true })
    }

    return json({ error: 'Unsupported notification event' }, 400)
  } catch (error) {
    console.error('Admin notification event failed:', error)
    return json({ error: 'The notification could not be created' }, 500)
  }
})
