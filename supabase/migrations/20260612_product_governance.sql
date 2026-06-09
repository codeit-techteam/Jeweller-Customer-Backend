-- Product edit governance: jeweller ownership, admin oversight, audit trail

-- Extend products with ownership and governance timestamps
alter table public.products
  add column if not exists owner_jeweller_id uuid references auth.users(id) on delete set null,
  add column if not exists last_admin_action_at timestamptz;

-- Backfill owner from boutique jeweller (skip orphaned jeweller_user_id values
-- that are not present in auth.users — avoids FK violation 23503)
update public.products p
set owner_jeweller_id = b.jeweller_user_id
from public.boutiques b
inner join auth.users u on u.id = b.jeweller_user_id
where p.boutique_id = b.id
  and b.jeweller_user_id is not null
  and p.owner_jeweller_id is null;

-- Normalize legacy status values to governance enum (uppercase)
update public.products set status = 'ACTIVE' where lower(coalesce(status, '')) = 'active';
update public.products set status = 'DRAFT' where lower(coalesce(status, '')) = 'draft';
update public.products set status = 'ARCHIVED' where lower(coalesce(status, '')) = 'archived';

alter table public.products
  alter column status set default 'ACTIVE';

-- product_flags: admin flags a product for jeweller resolution
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

-- product_suspensions: admin suspends product from customer app
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

-- product_correction_requests: admin asks jeweller to fix a specific field
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

-- product_edit_history: jeweller edit audit trail
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
