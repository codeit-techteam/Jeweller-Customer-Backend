-- Super Admin analytics: event tracking, sessions, orders, engagement

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Orders (marketplace revenue tracking)
-- ---------------------------------------------------------------------------
create table if not exists public.platform_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users_profile(id) on delete set null,
  boutique_id uuid references public.boutiques(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  amount numeric not null default 0,
  status text not null default 'completed',
  created_at timestamptz not null default now()
);

create index if not exists idx_platform_orders_created_at
  on public.platform_orders (created_at desc);
create index if not exists idx_platform_orders_boutique_id
  on public.platform_orders (boutique_id);

-- ---------------------------------------------------------------------------
-- Unified analytics events
-- ---------------------------------------------------------------------------
create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  user_id uuid references public.users_profile(id) on delete set null,
  boutique_id uuid references public.boutiques(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  section_slug text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_analytics_events_type_created
  on public.analytics_events (event_type, created_at desc);
create index if not exists idx_analytics_events_boutique_created
  on public.analytics_events (boutique_id, created_at desc)
  where boutique_id is not null;
create index if not exists idx_analytics_events_product_created
  on public.analytics_events (product_id, created_at desc)
  where product_id is not null;
create index if not exists idx_analytics_events_user_created
  on public.analytics_events (user_id, created_at desc)
  where user_id is not null;

-- ---------------------------------------------------------------------------
-- User sessions (real-time presence + session duration)
-- ---------------------------------------------------------------------------
create table if not exists public.analytics_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users_profile(id) on delete cascade,
  city text,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  duration_seconds integer not null default 0
);

create index if not exists idx_analytics_sessions_last_seen
  on public.analytics_sessions (last_seen_at desc);
create index if not exists idx_analytics_sessions_user
  on public.analytics_sessions (user_id);

-- ---------------------------------------------------------------------------
-- Category / section engagement
-- ---------------------------------------------------------------------------
create table if not exists public.category_clicks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users_profile(id) on delete set null,
  category_id uuid references public.categories(id) on delete cascade,
  category_name text,
  created_at timestamptz not null default now()
);

create index if not exists idx_category_clicks_created
  on public.category_clicks (created_at desc);

create table if not exists public.section_engagements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users_profile(id) on delete set null,
  section_type text not null,
  section_slug text not null,
  section_title text,
  created_at timestamptz not null default now()
);

create index if not exists idx_section_engagements_type_created
  on public.section_engagements (section_type, created_at desc);

-- ---------------------------------------------------------------------------
-- Boutique contact clicks
-- ---------------------------------------------------------------------------
create table if not exists public.boutique_contact_clicks (
  id uuid primary key default gen_random_uuid(),
  boutique_id uuid not null references public.boutiques(id) on delete cascade,
  user_id uuid references public.users_profile(id) on delete set null,
  click_type text not null check (click_type in ('call', 'whatsapp')),
  source text,
  created_at timestamptz not null default now()
);

create index if not exists idx_boutique_contact_clicks_boutique
  on public.boutique_contact_clicks (boutique_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Product views (denormalized for fast aggregates; also logged in analytics_events)
-- ---------------------------------------------------------------------------
create table if not exists public.product_views (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  boutique_id uuid references public.boutiques(id) on delete set null,
  user_id uuid references public.users_profile(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_product_views_product_created
  on public.product_views (product_id, created_at desc);
create index if not exists idx_product_views_boutique_created
  on public.product_views (boutique_id, created_at desc);

create table if not exists public.boutique_visits (
  id uuid primary key default gen_random_uuid(),
  boutique_id uuid not null references public.boutiques(id) on delete cascade,
  user_id uuid references public.users_profile(id) on delete set null,
  source text,
  created_at timestamptz not null default now()
);

create index if not exists idx_boutique_visits_boutique_created
  on public.boutique_visits (boutique_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Backfill product_views / boutique_visits from recently_viewed (idempotent)
-- ---------------------------------------------------------------------------
-- Only backfill rows whose user_id exists in users_profile (skips dev/placeholder IDs).
insert into public.product_views (product_id, boutique_id, user_id, created_at)
select rv.product_id, p.boutique_id, up.id, rv.viewed_at
from public.recently_viewed rv
join public.products p on p.id = rv.product_id
join public.users_profile up on up.id::text = rv.user_id::text
where rv.product_id is not null
  and rv.user_id is not null
  and not exists (
    select 1 from public.product_views pv
    where pv.product_id = rv.product_id
      and pv.user_id = up.id
      and pv.created_at = rv.viewed_at
  );

insert into public.boutique_visits (boutique_id, user_id, created_at)
select rv.boutique_id, up.id, rv.viewed_at
from public.recently_viewed rv
join public.users_profile up on up.id::text = rv.user_id::text
where rv.boutique_id is not null
  and rv.user_id is not null
  and not exists (
    select 1 from public.boutique_visits bv
    where bv.boutique_id = rv.boutique_id
      and bv.user_id = up.id
      and bv.created_at = rv.viewed_at
  );

-- Orphan views (valid UUID shape but no users_profile row): keep counts without user_id.
insert into public.product_views (product_id, boutique_id, user_id, created_at)
select rv.product_id, p.boutique_id, null, rv.viewed_at
from public.recently_viewed rv
join public.products p on p.id = rv.product_id
where rv.product_id is not null
  and rv.user_id is not null
  and rv.user_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and not exists (select 1 from public.users_profile up where up.id::text = rv.user_id::text)
  and not exists (
    select 1 from public.product_views pv
    where pv.product_id = rv.product_id
      and pv.user_id is null
      and pv.created_at = rv.viewed_at
  );

insert into public.boutique_visits (boutique_id, user_id, created_at)
select rv.boutique_id, null, rv.viewed_at
from public.recently_viewed rv
where rv.boutique_id is not null
  and rv.user_id is not null
  and rv.user_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and not exists (select 1 from public.users_profile up where up.id::text = rv.user_id::text)
  and not exists (
    select 1 from public.boutique_visits bv
    where bv.boutique_id = rv.boutique_id
      and bv.user_id is null
      and bv.created_at = rv.viewed_at
  );

-- ---------------------------------------------------------------------------
-- Daily rollup view for platform charts (security invoker on PG15+)
-- ---------------------------------------------------------------------------
create or replace view public.analytics_daily_rollups as
select
  d::date as day,
  coalesce(u.cnt, 0)::bigint as new_users,
  coalesce(b.cnt, 0)::bigint as new_boutiques,
  coalesce(p.cnt, 0)::bigint as new_products,
  coalesce(a.cnt, 0)::bigint as appointments,
  coalesce(o.revenue, 0)::numeric as revenue,
  coalesce(o.order_count, 0)::bigint as orders
from generate_series(
  current_date - interval '90 days',
  current_date,
  interval '1 day'
) as d(day)
left join lateral (
  select count(*)::bigint as cnt
  from public.users_profile up
  where up.created_at::date = d::date
) u on true
left join lateral (
  select count(*)::bigint as cnt
  from public.boutiques bt
  where bt.created_at::date = d::date and bt.deleted_at is null
) b on true
left join lateral (
  select count(*)::bigint as cnt
  from public.products pr
  where pr.created_at::date = d::date
) p on true
left join lateral (
  select count(*)::bigint as cnt
  from public.appointments ap
  where coalesce(ap.starts_at, ap.created_at)::date = d::date
) a on true
left join lateral (
  select count(*)::bigint as order_count, coalesce(sum(amount), 0) as revenue
  from public.platform_orders po
  where po.created_at::date = d::date and po.status = 'completed'
) o on true;
