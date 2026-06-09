-- Repair script: run in Supabase SQL Editor if 20260612_product_governance.sql
-- failed on the owner_jeweller_id backfill (FK 23503).
-- Safe to re-run: uses IF NOT EXISTS / idempotent updates.

-- 1) Ensure columns exist (no-op if already applied)
alter table public.products
  add column if not exists owner_jeweller_id uuid references auth.users(id) on delete set null,
  add column if not exists last_admin_action_at timestamptz;

-- 2) Backfill only when jeweller_user_id exists in auth.users
update public.products p
set owner_jeweller_id = b.jeweller_user_id
from public.boutiques b
inner join auth.users u on u.id = b.jeweller_user_id
where p.boutique_id = b.id
  and b.jeweller_user_id is not null
  and p.owner_jeweller_id is null;

-- 3) Normalize legacy product status values
update public.products set status = 'ACTIVE' where lower(coalesce(status, '')) = 'active';
update public.products set status = 'DRAFT' where lower(coalesce(status, '')) = 'draft';
update public.products set status = 'ARCHIVED' where lower(coalesce(status, '')) = 'archived';

alter table public.products
  alter column status set default 'ACTIVE';

-- 4) Governance tables (skipped if original script failed mid-run)
create table if not exists public.product_flags (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  admin_id text not null,
  reason_code text not null check (reason_code in ('PRICE_SUSPICIOUS', 'IMAGE_VIOLATION', 'DESCRIPTION_MISLEADING', 'OTHER')),
  reason_text text,
  auto_resolve boolean not null default false,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text
);

create index if not exists idx_product_flags_product_unresolved
  on public.product_flags (product_id)
  where resolved_at is null;

create table if not exists public.product_suspensions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  admin_id text not null,
  reason_text text not null,
  suspended_at timestamptz not null default now(),
  reinstated_at timestamptz,
  reinstated_by text
);

create index if not exists idx_product_suspensions_product_active
  on public.product_suspensions (product_id)
  where reinstated_at is null;

create table if not exists public.product_correction_requests (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  admin_id text not null,
  field_name text not null,
  message text not null,
  auto_resolve boolean not null default false,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz
);

create index if not exists idx_product_correction_requests_product_open
  on public.product_correction_requests (product_id)
  where resolved_at is null;

create table if not exists public.product_edit_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  jeweller_id uuid not null,
  field_name text not null,
  old_value text,
  new_value text,
  changed_at timestamptz not null default now()
);

create index if not exists idx_product_edit_history_product_changed
  on public.product_edit_history (product_id, changed_at desc);

create index if not exists idx_product_edit_history_jeweller
  on public.product_edit_history (jeweller_id, changed_at desc);

-- 5) Optional: find boutiques with orphaned jeweller_user_id (for manual cleanup)
-- select b.id, b.name, b.jeweller_user_id
-- from public.boutiques b
-- where b.jeweller_user_id is not null
--   and not exists (select 1 from auth.users u where u.id = b.jeweller_user_id);
