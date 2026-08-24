-- Migration: 20260824000001_drop_devices.sql
-- Remove devices table and synced_device_id column (dead data)

-- Drop devices table (no reads anywhere)
drop table if exists public.devices cascade;

-- Drop synced_device_id from punches (references devices, never read)
alter table public.punches drop column if exists synced_device_id;
