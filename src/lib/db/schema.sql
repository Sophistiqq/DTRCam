-- 1. Enable pgcrypto / extensions if needed
create extension if not exists "pgcrypto";

-- 2. profiles: extends Supabase auth.users
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  employee_no text not null unique,
  full_name text not null,
  role text not null check (role in ('employee', 'admin')),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- 3. punches
create table if not exists public.punches (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id),
  work_date date not null,
  punch_type text not null check (punch_type in ('in', 'out')),
  captured_at timestamptz not null,
  received_at timestamptz not null default now(),
  trusted_clock_epoch bigint,
  lat double precision,
  lng double precision,
  gps_accuracy_m double precision,
  location_source text not null check (location_source in ('gps', 'manual')),
  location_text text,
  address_enriched text,
  photo_path text,
  thumb_path text,
  payload_sha256 text not null,
  prev_hash text,
  row_hash text,
  status text not null default 'accepted' check (status in ('accepted', 'late_sync', 'quarantined', 'superseded')),
  anomaly_flags jsonb not null default '{}'::jsonb,
  quarantine_reason text,
  synced_device_id uuid,
  created_at timestamptz not null default now()
);

-- 4. devices
create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id),
  model text,
  os text,
  last_seen_at timestamptz not null default now(),
  clock_offset_ms integer not null default 0
);

-- 5. api_keys
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  key_hash text not null unique,
  is_active boolean not null default true,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

-- 6. audit_log
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor uuid references public.profiles(id),
  action text not null,
  entity text not null,
  entity_id text,
  detail jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);

-- 7. daily_summary
create table if not exists public.daily_summary (
  employee_id uuid not null references public.profiles(id),
  work_date date not null,
  first_in_at timestamptz,
  last_out_at timestamptz,
  location_in text,
  location_out text,
  status text not null default 'absent' check (status in ('complete', 'missing_out', 'absent')),
  built_at timestamptz not null default now(),
  primary key (employee_id, work_date)
);

-- 8. Indexes
create index if not exists punches_employee_work_date on public.punches (employee_id, work_date, punch_type);
create index if not exists punches_status on public.punches (status);
create index if not exists punches_captured_at on public.punches (captured_at);
create index if not exists audit_log_actor on public.audit_log (actor, at);
create index if not exists daily_summary_date on public.daily_summary (work_date);

-- 9. RLS
alter table public.profiles enable row level security;
alter table public.punches enable row level security;
alter table public.devices enable row level security;
alter table public.api_keys enable row level security;
alter table public.audit_log enable row level security;
alter table public.daily_summary enable row level security;

-- profiles: users can read own row; admins read all
create policy "profiles_self_read" on public.profiles for select
  using (auth.uid() = id);
create policy "profiles_admin_read" on public.profiles for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "profiles_admin_write" on public.profiles for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- punches: employees read own; admins read all; ingest via service role
create policy "punches_self_read" on public.punches for select
  using (auth.uid() = employee_id);
create policy "punches_admin_read" on public.punches for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- daily_summary: employees read own; admins read all
create policy "summary_self_read" on public.daily_summary for select
  using (auth.uid() = employee_id);
create policy "summary_admin_read" on public.daily_summary for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
