-- Migration: 20260824000000_devices_unique_employee.sql
-- Add UNIQUE constraint on devices.employee_id for upsert support

alter table public.devices add constraint devices_employee_id_unique unique (employee_id);
