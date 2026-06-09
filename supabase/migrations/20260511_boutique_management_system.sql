alter table if exists public.boutiques
  add column if not exists slug text,
  add column if not exists logo_url text,
  add column if not exists banner_images jsonb not null default '[]'::jsonb,
  add column if not exists full_address text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists opening_time text,
  add column if not exists closing_time text,
  add column if not exists working_days jsonb not null default '[]'::jsonb,
  add column if not exists phone_number text,
  add column if not exists whatsapp_number text,
  add column if not exists instagram_url text,
  add column if not exists website_url text,
  add column if not exists reviews_count integer not null default 0,
  add column if not exists is_verified boolean not null default false,
  add column if not exists is_active boolean not null default true;

update public.boutiques
set
  slug = coalesce(slug, lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))),
  logo_url = coalesce(logo_url, image),
  full_address = coalesce(full_address, address, location),
  phone_number = coalesce(phone_number, phone, contact_number),
  whatsapp_number = coalesce(whatsapp_number, whatsapp),
  instagram_url = coalesce(instagram_url, instagram),
  is_verified = coalesce(is_verified, verified, false),
  is_active = coalesce(is_active, status <> 'inactive', true),
  reviews_count = coalesce(reviews_count, 0);

create unique index if not exists idx_boutiques_slug on public.boutiques(slug) where slug is not null;

create table if not exists public.boutique_collections (
  id uuid primary key default gen_random_uuid(),
  boutique_id uuid not null references public.boutiques(id) on delete cascade,
  name text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (boutique_id, slug)
);

create table if not exists public.boutique_product_links (
  boutique_id uuid not null references public.boutiques(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  collection_id uuid references public.boutique_collections(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (boutique_id, product_id)
);

create index if not exists idx_boutique_collections_boutique_id on public.boutique_collections(boutique_id);
create index if not exists idx_boutique_product_links_collection_id on public.boutique_product_links(collection_id);

insert into public.boutique_product_links (boutique_id, product_id)
select p.boutique_id, p.id
from public.products p
where p.boutique_id is not null
on conflict do nothing;
