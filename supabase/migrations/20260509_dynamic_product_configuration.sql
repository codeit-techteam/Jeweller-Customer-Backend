-- Dynamic product CMS: configurable sizes, metals, discount, reviews, specs, price break-up, boutique link, tags

alter table public.products add column if not exists available_sizes jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists available_metals jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists discount_percentage numeric;
alter table public.products add column if not exists reviews_count integer default 0;
alter table public.products add column if not exists specifications jsonb not null default '{}'::jsonb;
alter table public.products add column if not exists price_breakup jsonb not null default '{}'::jsonb;
alter table public.products add column if not exists primary_boutique_id uuid references public.boutiques(id) on delete set null;

alter table public.products add column if not exists gender text;
alter table public.products add column if not exists occasion text;
alter table public.products add column if not exists style text;
alter table public.products add column if not exists collection_name text;

update public.products
set reviews_count = 0
where reviews_count is null;

create index if not exists idx_products_primary_boutique_id on public.products(primary_boutique_id);
