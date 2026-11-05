import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Check } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import {
  fetchAdminNotifications,
  markAdminNotificationRead,
} from '../../lib/adminNotificationsApi'
import { supabase } from '../../lib/supabaseClient'

const NOTIFICATIONS_QUERY_KEY = ['admin-notifications']

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function AdminNotificationCenter() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const containerRef = useRef<HTMLDivElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [realtimeError, setRealtimeError] = useState(false)

  const notificationsQuery = useQuery({
    queryKey: [...NOTIFICATIONS_QUERY_KEY, profile?.school_id, profile?.id],
    queryFn: fetchAdminNotifications,
    enabled: profile?.role === 'admin' && !!profile.id,
  })

  const markReadMutation = useMutation({
    mutationFn: markAdminNotificationRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY }),
  })

  useEffect(() => {
    if (!profile?.id || profile.role !== 'admin') return

    const channel = supabase
      .channel(`admin-notifications-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'admin_notifications',
          filter: `recipient_id=eq.${profile.id}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY })
        },
      )
      .subscribe((status) => {
        setRealtimeError(status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [profile?.id, profile?.role, queryClient])

  useEffect(() => {
    if (!isOpen) return

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const notifications = notificationsQuery.data?.items ?? []
  const unreadCount = notificationsQuery.data?.unreadCount ?? 0

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={isOpen}
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-200 transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-rose-500 px-1 text-center text-[10px] font-semibold leading-5 text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-800 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold">Notifications</h2>
            {unreadCount > 0 && <span className="text-xs text-slate-500">{unreadCount} unread</span>}
          </div>

          {realtimeError && (
            <p role="status" className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
              Live updates are unavailable. The list will refresh when reopened or reconnected.
            </p>
          )}
          {notificationsQuery.isLoading ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">Loading notifications...</p>
          ) : notificationsQuery.isError ? (
            <p role="alert" className="px-4 py-6 text-center text-sm text-rose-700">
              Notifications could not be loaded. Confirm the admin notification database migration is applied.
            </p>
          ) : notifications.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">You are all caught up.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto divide-y divide-slate-100">
              {notifications.map((notification) => (
                <li
                  key={notification.id}
                  className={`px-4 py-3 ${notification.read_at ? 'bg-white' : 'bg-rose-50/60'}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">{notification.title}</p>
                      <p className="mt-1 text-sm text-slate-600">{notification.message}</p>
                      <p className="mt-1.5 text-xs text-slate-400">{formatTime(notification.created_at)}</p>
                    </div>
                    {!notification.read_at && (
                      <button
                        type="button"
                        aria-label={`Mark "${notification.title}" as read`}
                        disabled={markReadMutation.isPending}
                        onClick={() => markReadMutation.mutate(notification.id)}
                        className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {markReadMutation.isError && (
            <p role="alert" className="border-t border-rose-100 px-4 py-2 text-xs text-rose-700">
              This notification could not be marked as read. Please try again.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
