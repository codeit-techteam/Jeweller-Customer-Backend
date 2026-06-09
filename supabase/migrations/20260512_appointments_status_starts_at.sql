-- Listing UX: status + sortable instant for My Appointments
alter table if exists public.appointments
  add column if not exists status text not null default 'upcoming';

alter table if exists public.appointments
  add column if not exists starts_at timestamptz;

-- Backfill starts_at from date (noon UTC) when missing; admin/booking flows can set precisely later.
update public.appointments a
set starts_at = coalesce(
  a.starts_at,
  (a.date::text || 'T12:00:00Z')::timestamptz
)
where a.starts_at is null and a.date is not null;

create index if not exists idx_appointments_user_starts
  on public.appointments (user_id, starts_at desc);
