-- Persistent application error logs.
-- Run this once in the Supabase SQL Editor before deploying the Edge Function.

create table if not exists public.error_logs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  error_type text not null,
  message text not null,
  page text,
  context jsonb,
  created_at timestamptz not null default now()
);

create index if not exists error_logs_created_at_idx
  on public.error_logs (created_at desc);

create index if not exists error_logs_school_id_idx
  on public.error_logs (school_id);

create index if not exists error_logs_error_type_idx
  on public.error_logs (error_type);

alter table public.error_logs enable row level security;

-- No client policies are created deliberately. The service role used by the
-- Edge Functions bypasses RLS; regular users cannot read or insert logs directly.
