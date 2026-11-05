CREATE TABLE public.admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (
    event_type IN ('grade_saved', 'grades_released', 'attendance_saved', 'topic_verified')
  ),
  title text NOT NULL,
  message text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

CREATE INDEX admin_notifications_recipient_created_idx
  ON public.admin_notifications (recipient_id, created_at DESC);

CREATE INDEX admin_notifications_unread_idx
  ON public.admin_notifications (recipient_id, created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_notifications_select_own
  ON public.admin_notifications
  FOR SELECT
  TO authenticated
  USING (
    recipient_id = auth.uid()
    AND school_id = public.user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.profiles profile
      WHERE profile.id = auth.uid()
        AND profile.school_id = admin_notifications.school_id
        AND profile.role = 'admin'
    )
  );

CREATE POLICY admin_notifications_update_own
  ON public.admin_notifications
  FOR UPDATE
  TO authenticated
  USING (
    recipient_id = auth.uid()
    AND school_id = public.user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.profiles profile
      WHERE profile.id = auth.uid()
        AND profile.school_id = admin_notifications.school_id
        AND profile.role = 'admin'
    )
  )
  WITH CHECK (
    recipient_id = auth.uid()
    AND school_id = public.user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.profiles profile
      WHERE profile.id = auth.uid()
        AND profile.school_id = admin_notifications.school_id
        AND profile.role = 'admin'
    )
  );

GRANT SELECT ON public.admin_notifications TO authenticated;
GRANT UPDATE (read_at) ON public.admin_notifications TO authenticated;
GRANT ALL ON public.admin_notifications TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'admin_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_notifications;
  END IF;
END;
$$;
