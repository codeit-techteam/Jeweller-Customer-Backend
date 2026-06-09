-- =====================================================
--  CMS / Dynamic Content Management
--
--  Purpose: Make every frontend section (Occasions, Trending Collections,
--  Categories, Hamburger "Shop For" menu, Featured Sections, Offers,
--  Gifts) admin-controllable with images, ordering, visibility, and
--  product attachments.
--
--  Idempotent so repeated runs (or production environments that already
--  have partial fields) work cleanly.
-- =====================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------
-- 1. Categories — add ordering, active flag, slug, subtitle.
-- ---------------------------------------------
alter table if exists public.categories
  add column if not exists name text;
alter table if exists public.categories
  add column if not exists image text;
alter table if exists public.categories
  add column if not exists slug text;
alter table if exists public.categories
  add column if not exists subtitle text;
alter table if exists public.categories
  add column if not exists sort_order integer not null default 0;
alter table if exists public.categories
  add column if not exists is_active boolean not null default true;
alter table if exists public.categories
  add column if not exists created_at timestamptz not null default now();
alter table if exists public.categories
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_categories_slug_unique
  on public.categories(slug)
  where slug is not null;
create index if not exists idx_categories_sort_order
  on public.categories(sort_order);
create index if not exists idx_categories_is_active
  on public.categories(is_active);

-- Join: categories <-> products (admin can attach products to a category)
create table if not exists public.category_products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (category_id, product_id)
);
create index if not exists idx_category_products_category on public.category_products(category_id);
create index if not exists idx_category_products_product on public.category_products(product_id);

-- ---------------------------------------------
-- 2. Collections — add description, banner, ordering, visibility, trending/featured flags.
-- ---------------------------------------------
-- Some legacy databases were initialised without `slug` on collections, so
-- ensure every column we index later exists first (idempotent).
alter table if exists public.collections
  add column if not exists slug text;
alter table if exists public.collections
  add column if not exists subtitle text;
alter table if exists public.collections
  add column if not exists image text;
alter table if exists public.collections
  add column if not exists description text;
alter table if exists public.collections
  add column if not exists banner_image text;
alter table if exists public.collections
  add column if not exists sort_order integer not null default 0;
alter table if exists public.collections
  add column if not exists is_active boolean not null default true;
alter table if exists public.collections
  add column if not exists is_trending boolean not null default false;
alter table if exists public.collections
  add column if not exists is_featured boolean not null default false;
alter table if exists public.collections
  add column if not exists created_at timestamptz not null default now();
alter table if exists public.collections
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_collections_sort_order on public.collections(sort_order);
create index if not exists idx_collections_is_active on public.collections(is_active);
create index if not exists idx_collections_is_trending on public.collections(is_trending);
create index if not exists idx_collections_is_featured on public.collections(is_featured);
create unique index if not exists idx_collections_slug_unique
  on public.collections(slug)
  where slug is not null;

create table if not exists public.collection_products (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (collection_id, product_id)
);
create index if not exists idx_collection_products_collection on public.collection_products(collection_id);
create index if not exists idx_collection_products_product on public.collection_products(product_id);

-- ---------------------------------------------
-- 3. Occasions — add ordering, visibility, description.
-- ---------------------------------------------
alter table if exists public.occasions
  add column if not exists subtitle text;
alter table if exists public.occasions
  add column if not exists image text;
alter table if exists public.occasions
  add column if not exists collection_slug text;
alter table if exists public.occasions
  add column if not exists description text;
alter table if exists public.occasions
  add column if not exists slug text;
alter table if exists public.occasions
  add column if not exists sort_order integer not null default 0;
alter table if exists public.occasions
  add column if not exists is_active boolean not null default true;
alter table if exists public.occasions
  add column if not exists created_at timestamptz not null default now();
alter table if exists public.occasions
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_occasions_sort_order on public.occasions(sort_order);
create index if not exists idx_occasions_is_active on public.occasions(is_active);
create unique index if not exists idx_occasions_slug_unique
  on public.occasions(slug)
  where slug is not null;

create table if not exists public.occasion_products (
  id uuid primary key default gen_random_uuid(),
  occasion_id uuid not null references public.occasions(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (occasion_id, product_id)
);
create index if not exists idx_occasion_products_occasion on public.occasion_products(occasion_id);
create index if not exists idx_occasion_products_product on public.occasion_products(product_id);

-- ---------------------------------------------
-- 4. Menu Categories — hamburger "Shop For" rows (Women, Men, Kids, Offers, Gifts ...).
-- ---------------------------------------------
create table if not exists public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null,
  icon text,
  image text,
  badge text,
  collection_slug text,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists idx_menu_categories_slug_unique on public.menu_categories(slug);
create index if not exists idx_menu_categories_sort_order on public.menu_categories(sort_order);
create index if not exists idx_menu_categories_is_active on public.menu_categories(is_active);

create table if not exists public.menu_category_products (
  id uuid primary key default gen_random_uuid(),
  menu_category_id uuid not null references public.menu_categories(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (menu_category_id, product_id)
);
create index if not exists idx_menu_category_products_menu on public.menu_category_products(menu_category_id);
create index if not exists idx_menu_category_products_product on public.menu_category_products(product_id);

-- Seed the default Shop For rows so the existing frontend stays populated
-- the moment the migration runs (admin can then add/edit them freely).
insert into public.menu_categories (title, slug, icon, badge, collection_slug, sort_order)
values
  ('Women',         'women',  'woman',           null,  'women', 10),
  ('Men',           'men',    'man',             null,  'men',   20),
  ('Kids & infants','kids',   'child-care',      null,  'kids',  30),
  ('Offers',        'offers', 'local-offer',     'NEW', 'offers',40),
  ('Gifts',         'gifts',  'card-giftcard',   null,  'gifts', 50)
on conflict (slug) do nothing;

-- ---------------------------------------------
-- 5. Featured Sections — admin-defined product carousels
--    (e.g. "Trending Now", "Featured Products", "Recommended", "Curated").
-- ---------------------------------------------
create table if not exists public.featured_sections (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null,
  subtitle text,
  description text,
  banner_image text,
  layout text not null default 'grid',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists idx_featured_sections_slug_unique on public.featured_sections(slug);
create index if not exists idx_featured_sections_sort_order on public.featured_sections(sort_order);
create index if not exists idx_featured_sections_is_active on public.featured_sections(is_active);

create table if not exists public.featured_section_products (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.featured_sections(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (section_id, product_id)
);
create index if not exists idx_featured_section_products_section on public.featured_section_products(section_id);
create index if not exists idx_featured_section_products_product on public.featured_section_products(product_id);

-- Seed default sections so the home screen has a "Trending Now" rail
-- without manual setup; admins can rename/disable as they please.
insert into public.featured_sections (title, slug, subtitle, layout, sort_order)
values
  ('Trending Now',       'trending-now',       'The season''s most-loved pieces',  'grid', 10),
  ('Featured Products',  'featured-products',  'Hand-picked by our curators',      'grid', 20),
  ('Recommended For You','recommended',        'Inspired by your wishlist',        'rail', 30),
  ('Curated',            'curated',            'Editorial story by GehnaHub',     'rail', 40)
on conflict (slug) do nothing;

-- ---------------------------------------------
-- 6. Offers — banner, discount text, expiry, ordering, status.
-- ---------------------------------------------
alter table if exists public.offers
  add column if not exists title text;
alter table if exists public.offers
  add column if not exists subtitle text;
alter table if exists public.offers
  add column if not exists badge text;
alter table if exists public.offers
  add column if not exists image text;
alter table if exists public.offers
  add column if not exists description text;
alter table if exists public.offers
  add column if not exists slug text;
alter table if exists public.offers
  add column if not exists discount_text text;
alter table if exists public.offers
  add column if not exists banner_image text;
alter table if exists public.offers
  add column if not exists cta_label text;
alter table if exists public.offers
  add column if not exists cta_target text;
alter table if exists public.offers
  add column if not exists starts_at timestamptz;
alter table if exists public.offers
  add column if not exists expires_at timestamptz;
alter table if exists public.offers
  add column if not exists sort_order integer not null default 0;
alter table if exists public.offers
  add column if not exists is_active boolean not null default true;
alter table if exists public.offers
  add column if not exists created_at timestamptz not null default now();
alter table if exists public.offers
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_offers_slug_unique on public.offers(slug) where slug is not null;
create index if not exists idx_offers_sort_order on public.offers(sort_order);
create index if not exists idx_offers_is_active on public.offers(is_active);
create index if not exists idx_offers_expires_at on public.offers(expires_at);

create table if not exists public.offer_products (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (offer_id, product_id)
);
create index if not exists idx_offer_products_offer on public.offer_products(offer_id);
create index if not exists idx_offer_products_product on public.offer_products(product_id);

create table if not exists public.offer_collections (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete cascade,
  collection_id uuid not null references public.collections(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (offer_id, collection_id)
);
create index if not exists idx_offer_collections_offer on public.offer_collections(offer_id);
create index if not exists idx_offer_collections_collection on public.offer_collections(collection_id);

-- ---------------------------------------------
-- 7. Gift collections — add description, ordering, status, banner.
-- ---------------------------------------------
alter table if exists public.gift_collections
  add column if not exists title text;
alter table if exists public.gift_collections
  add column if not exists image text;
alter table if exists public.gift_collections
  add column if not exists slug text;
alter table if exists public.gift_collections
  add column if not exists subtitle text;
alter table if exists public.gift_collections
  add column if not exists description text;
alter table if exists public.gift_collections
  add column if not exists banner_image text;
alter table if exists public.gift_collections
  add column if not exists sort_order integer not null default 0;
alter table if exists public.gift_collections
  add column if not exists is_active boolean not null default true;
alter table if exists public.gift_collections
  add column if not exists created_at timestamptz not null default now();
alter table if exists public.gift_collections
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_gift_collections_slug_unique on public.gift_collections(slug) where slug is not null;
create index if not exists idx_gift_collections_sort_order on public.gift_collections(sort_order);
create index if not exists idx_gift_collections_is_active on public.gift_collections(is_active);

create table if not exists public.gift_collection_products (
  id uuid primary key default gen_random_uuid(),
  gift_collection_id uuid not null references public.gift_collections(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (gift_collection_id, product_id)
);
create index if not exists idx_gift_collection_products_collection on public.gift_collection_products(gift_collection_id);
create index if not exists idx_gift_collection_products_product on public.gift_collection_products(product_id);

-- ---------------------------------------------
-- 8. Touch trigger to keep updated_at fresh on writes (best effort, optional).
-- ---------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t record;
  trg_name text;
begin
  for t in
    select unnest(array[
      'categories',
      'collections',
      'occasions',
      'menu_categories',
      'featured_sections',
      'offers',
      'gift_collections'
    ]) as tbl
  loop
    trg_name := format('trg_%s_touch_updated_at', t.tbl);
    if not exists (
      select 1 from pg_trigger
      where tgname = trg_name
    ) then
      execute format(
        'create trigger %I before update on public.%I for each row execute function public.touch_updated_at()',
        trg_name,
        t.tbl
      );
    end if;
  end loop;
end $$;
