-- User-hidden appointments (My Appointments delete)
alter table if exists public.appointments
  add column if not exists deleted_at timestamptz;

create index if not exists idx_appointments_user_not_deleted
  on public.appointments (user_id, starts_at desc)
  where deleted_at is null;
