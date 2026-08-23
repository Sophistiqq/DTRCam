-- Seed initial test employees and admins
-- Run automatically during `supabase db reset` or `supabase db push`

-- Insert Test Employee (1001 / Juan Dela Cruz)
insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  'a0000000-0000-0000-0000-000000001001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  '1001@dtrcam.internal',
  crypt('jdc@1001', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"employee_no":"1001","full_name":"Juan Dela Cruz","role":"employee"}',
  now(),
  now()
)
on conflict (id) do nothing;

insert into public.profiles (id, employee_no, full_name, role, is_active)
values (
  'a0000000-0000-0000-0000-000000001001',
  '1001',
  'Juan Dela Cruz',
  'employee',
  true
)
on conflict (employee_no) do nothing;


-- Insert Test Admin (9999 / System Admin)
insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  'a0000000-0000-0000-0000-000000009999',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  '9999@dtrcam.internal',
  crypt('admin@9999', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"employee_no":"9999","full_name":"System Admin","role":"admin"}',
  now(),
  now()
)
on conflict (id) do nothing;

insert into public.profiles (id, employee_no, full_name, role, is_active)
values (
  'a0000000-0000-0000-0000-000000009999',
  '9999',
  'System Admin',
  'admin',
  true
)
on conflict (employee_no) do nothing;
