alter table if exists public.products
add column if not exists description text,
add column if not exists status text default 'active',
add column if not exists trending boolean default false,
add column if not exists updated_at timestamptz default now(),
add column if not exists primary_image text,
add column if not exists video_url text;

update public.products
set trending = coalesce(trending, is_trending, false)
where trending is null;

update public.products
set is_trending = coalesce(is_trending, trending, false)
where is_trending is null;

alter table if exists public.products
  alter column is_trending set default false;

alter table if exists public.products
  alter column status set default 'active';

alter table if exists public.product_images
add column if not exists is_primary boolean default false,
add column if not exists created_at timestamptz default now(),
add column if not exists sort_order integer default 0;

create index if not exists idx_products_status on public.products(status);
create index if not exists idx_product_images_product_primary on public.product_images(product_id, is_primary);
