-- Staff account lifecycle migration.
-- Run once in the Supabase SQL Editor. This preserves all existing profiles
-- and marks them active by default.

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.is_active IS
    'Whether the staff account may sign in. Deactivation preserves staff history.';