import { supabase } from './supabaseClient'

export type AdminNotificationEvent =
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

export interface AdminNotification {
  id: string
  event_type: AdminNotificationEvent['event_type']
  title: string
  message: string
  metadata: Record<string, string | number>
  created_at: string
  read_at: string | null
}

export interface AdminNotificationList {
  items: AdminNotification[]
  unreadCount: number
}

export async function fetchAdminNotifications(): Promise<AdminNotificationList> {
  const [notificationsResult, unreadResult] = await Promise.all([
    supabase
      .from('admin_notifications')
      .select('id, event_type, title, message, metadata, created_at, read_at')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('admin_notifications')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null),
  ])

  if (notificationsResult.error) throw notificationsResult.error
  if (unreadResult.error) throw unreadResult.error

  return {
    items: (notificationsResult.data ?? []) as AdminNotification[],
    unreadCount: unreadResult.count ?? 0,
  }
}

export async function markAdminNotificationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from('admin_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .is('read_at', null)

  if (error) throw error
}

export function notifyAdminEvent(event: AdminNotificationEvent): void {
  void supabase.functions
    .invoke('notify-admin-event', { body: event })
    .then(({ error }) => {
      if (error) console.error('Admin notification request failed:', error)
    })
    .catch((error: unknown) => console.error('Admin notification request failed:', error))
}
