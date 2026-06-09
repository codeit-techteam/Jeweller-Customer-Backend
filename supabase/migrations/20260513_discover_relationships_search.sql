-- Discover screen: relationship cards, ordered trending products, search history.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. Relationship sections ("Shop by relationship" cards)
-- ---------------------------------------------------------------------------
create table if not exists public.relationship_sections (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text,
  slug text not null,
  image text,
  collection_slug text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_relationship_sections_slug_unique
  on public.relationship_sections (slug);

create index if not exists idx_relationship_sections_sort_order
  on public.relationship_sections (sort_order);

create index if not exists idx_relationship_sections_is_active
  on public.relationship_sections (is_active);

create table if not exists public.relationship_products (
  id uuid primary key default gen_random_uuid(),
  relationship_section_id uuid not null references public.relationship_sections (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (relationship_section_id, product_id)
);

create index if not exists idx_relationship_products_section
  on public.relationship_products (relationship_section_id);

create index if not exists idx_relationship_products_product
  on public.relationship_products (product_id);

insert into public.relationship_sections (title, subtitle, slug, collection_slug, sort_order)
values
  ('For Her', 'CURATED ELEGANCE', 'for-her', 'women', 10),
  ('For Him', 'REFINED STRENGTH', 'for-him', 'men', 20),
  ('For Kids', 'WHIMSICAL JOY', 'for-kids', 'kids', 30)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Discover "Product right now" — manually ordered featured products
-- ---------------------------------------------------------------------------
create table if not exists public.featured_products (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (product_id)
);

create index if not exists idx_featured_products_sort_order
  on public.featured_products (sort_order);

create index if not exists idx_featured_products_is_active
  on public.featured_products (is_active);

-- ---------------------------------------------------------------------------
-- 3. Search history (per user, deduped on write in application layer)
-- ---------------------------------------------------------------------------
create table if not exists public.search_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users_profile (id) on delete cascade,
  keyword text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_search_history_user_created
  on public.search_history (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. Touch updated_at on relationship_sections
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_relationship_sections_touch_updated_at'
  ) then
    create trigger trg_relationship_sections_touch_updated_at
      before update on public.relationship_sections
      for each row execute function public.touch_updated_at();
  end if;
end $$;
