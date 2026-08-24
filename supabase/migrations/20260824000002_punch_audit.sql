-- Migration: 20260824000002_punch_audit.sql
-- Immutable append-only audit trail for every punch event.
-- Records full context at ingest time and on admin actions.

create table if not exists public.punch_audit (
  id uuid primary key default gen_random_uuid(),
  punch_id uuid not null,
  employee_id uuid not null references public.profiles(id),
  employee_no text not null,
  employee_name text not null,
  punch_type text not null,
  work_date date not null,
  captured_at timestamptz not null,
  received_at timestamptz not null,
  location_source text,
  lat double precision,
  lng double precision,
  gps_accuracy_m double precision,
  location_text text,
  photo_path text,
  payload_sha256 text not null,
  prev_hash text,
  row_hash text,
  status text not null,
  anomaly_flags jsonb not null default '{}'::jsonb,
  quarantine_reason text,
  source text not null default 'ingest' check (source in ('ingest', 'admin_force_accept', 'admin_discard')),
  admin_actor_id uuid references public.profiles(id),
  admin_note text,
  created_at timestamptz not null default now()
);

create index if not exists punch_audit_punch_id on public.punch_audit (punch_id);
create index if not exists punch_audit_employee on public.punch_audit (employee_id, created_at);
create index if not exists punch_audit_status on public.punch_audit (status);
create index if not exists punch_audit_created_at on public.punch_audit (created_at);

alter table public.punch_audit enable row level security;
create policy "punch_audit_admin_read" on public.punch_audit for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
