create extension if not exists "pgcrypto";

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image text
);

create table if not exists public.boutiques (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text,
  rating double precision default 0,
  image text,
  primary_image text,
  video_url text,
  description text
);

alter table if exists public.boutiques
  add column if not exists verified boolean not null default false;

alter table if exists public.boutiques
  add column if not exists featured boolean not null default false;

alter table if exists public.boutiques
  add column if not exists status text not null default 'active';

alter table if exists public.boutiques
  add column if not exists contact_number text;

alter table if exists public.boutiques
  add column if not exists whatsapp text;

alter table if exists public.boutiques
  add column if not exists instagram text;

alter table if exists public.boutiques
  add column if not exists opening_hours text;

alter table if exists public.boutiques
  add column if not exists created_at timestamptz not null default now();

alter table if exists public.boutiques
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.boutiques
  add column if not exists deleted_at timestamptz;

create index if not exists idx_boutiques_status on public.boutiques(status);
create index if not exists idx_boutiques_featured on public.boutiques(featured);
create index if not exists idx_boutiques_deleted_at on public.boutiques(deleted_at);

create table if not exists public.admin_activity_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  boutique_id uuid references public.boutiques(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric not null,
  image text,
  featured_image text,
  thumbnail text,
  images jsonb not null default '[]'::jsonb,
  videos jsonb not null default '[]'::jsonb,
  media jsonb not null default '[]'::jsonb,
  category_id uuid references public.categories(id) on delete set null,
  boutique_id uuid references public.boutiques(id) on delete set null,
  description text,
  status text default 'active',
  trending boolean default false,
  rating double precision default 0,
  is_trending boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);

alter table if exists public.products
add column if not exists is_trending boolean not null default false;

alter table if exists public.products
add column if not exists description text;

alter table if exists public.products
add column if not exists rating double precision default 0;

alter table if exists public.products
add column if not exists created_at timestamptz not null default now();

alter table if exists public.products
add column if not exists status text default 'active';

alter table if exists public.products
add column if not exists trending boolean default false;

alter table if exists public.products
add column if not exists updated_at timestamptz default now();

alter table if exists public.products
add column if not exists primary_image text;

alter table if exists public.products
add column if not exists video_url text;

alter table if exists public.products
add column if not exists video_thumbnail text;

alter table if exists public.products
add column if not exists featured_image text;

alter table if exists public.products
add column if not exists thumbnail text;

alter table if exists public.products
add column if not exists images jsonb not null default '[]'::jsonb;

alter table if exists public.products
add column if not exists videos jsonb not null default '[]'::jsonb;

alter table if exists public.products
add column if not exists media jsonb not null default '[]'::jsonb;

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
alter table public.products add column if not exists owner_jeweller_id uuid references auth.users(id) on delete set null;
alter table public.products add column if not exists last_admin_action_at timestamptz;

create table if not exists public.product_flags (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  admin_id text not null,
  reason_code text not null,
  reason_text text,
  auto_resolve boolean not null default false,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text
);

create table if not exists public.product_suspensions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  admin_id text not null,
  reason_text text not null,
  suspended_at timestamptz not null default now(),
  reinstated_at timestamptz,
  reinstated_by text
);

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

create table if not exists public.product_edit_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  jeweller_id uuid not null,
  field_name text not null,
  old_value text,
  new_value text,
  changed_at timestamptz not null default now()
);

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  title text,
  subtitle text,
  image text,
  slug text unique,
  created_at timestamptz default now()
);

create table if not exists public.occasions (
  id uuid primary key default gen_random_uuid(),
  title text,
  subtitle text,
  image text,
  collection_slug text,
  created_at timestamptz default now()
);

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  image_url text,
  is_primary boolean default false,
  sort_order integer default 0,
  created_at timestamptz default now()
);

create table if not exists public.recently_viewed (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  product_id uuid references public.products(id) on delete set null,
  boutique_id uuid references public.boutiques(id) on delete set null,
  viewed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fk_recently_viewed_user'
      and conrelid = 'public.recently_viewed'::regclass
  ) then
    alter table public.recently_viewed
      add constraint fk_recently_viewed_user
      foreign key (user_id)
      references public.users_profile(id)
      on delete cascade;
  end if;
end $$;

create table if not exists public.audiences (
  id uuid primary key default gen_random_uuid(),
  title text,
  icon text,
  created_at timestamptz default now()
);

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  title text,
  subtitle text,
  badge text,
  image text,
  created_at timestamptz default now()
);

create table if not exists public.gift_collections (
  id uuid primary key default gen_random_uuid(),
  title text,
  image text,
  created_at timestamptz default now()
);

create table if not exists public.gold_plans (
  id uuid primary key default gen_random_uuid(),
  name text,
  description text,
  duration text,
  icon text,
  created_at timestamptz default now()
);

create table if not exists public.saved_boutiques (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  boutique_id uuid,
  created_at timestamptz default now()
);

create table if not exists public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  product_id uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  boutique_id uuid,
  date date,
  time text,
  type text,
  notes text,
  created_at timestamptz default now()
);

create table if not exists public.users_profile (
  id uuid primary key default gen_random_uuid(),
  full_name text,
  email text,
  phone text unique,
  profile_image text,
  created_at timestamptz default now()
);

-- Dev-auth compatibility: if a previous version created FK to auth.users, remove it.
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.users_profile'::regclass
      and contype = 'f'
  loop
    execute format('alter table public.users_profile drop constraint if exists %I', c.conname);
  end loop;
end $$;

alter table public.users_profile
  alter column id set default gen_random_uuid();

alter table public.users_profile
  add column if not exists profile_image text;

-- If older column exists, keep data and align name
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'users_profile'
      and column_name = 'avatar_url'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'users_profile'
      and column_name = 'profile_image'
  ) then
    alter table public.users_profile add column profile_image text;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'users_profile'
      and column_name = 'avatar_url'
  ) then
    update public.users_profile
      set profile_image = coalesce(profile_image, avatar_url)
      where profile_image is null;
    alter table public.users_profile drop column avatar_url;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_saved_boutique'
      and conrelid = 'public.saved_boutiques'::regclass
  ) then
    alter table public.saved_boutiques
      add constraint fk_saved_boutique
      foreign key (boutique_id)
      references public.boutiques(id)
      on delete cascade;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'wishlist_items_user_id_fkey'
      and conrelid = 'public.wishlist_items'::regclass
  ) then
    alter table public.wishlist_items
      drop constraint wishlist_items_user_id_fkey;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conname = 'fk_wishlist_items_user'
      and conrelid = 'public.wishlist_items'::regclass
  ) then
    alter table public.wishlist_items
      drop constraint fk_wishlist_items_user;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'wishlist_items_user_id_fkey'
      and conrelid = 'public.wishlist_items'::regclass
  ) then
    alter table public.wishlist_items
      add constraint wishlist_items_user_id_fkey
      foreign key (user_id)
      references public.users_profile(id)
      on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fk_wishlist_items_product'
      and conrelid = 'public.wishlist_items'::regclass
  ) then
    alter table public.wishlist_items
      add constraint fk_wishlist_items_product
      foreign key (product_id)
      references public.products(id)
      on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fk_saved_boutiques_user'
      and conrelid = 'public.saved_boutiques'::regclass
  ) then
    alter table public.saved_boutiques
      add constraint fk_saved_boutiques_user
      foreign key (user_id)
      references public.users_profile(id)
      on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_appointment_boutique'
      and conrelid = 'public.appointments'::regclass
  ) then
    alter table public.appointments
      add constraint fk_appointment_boutique
      foreign key (boutique_id)
      references public.boutiques(id)
      on delete cascade;
  end if;
end $$;

create index if not exists idx_products_category_id on public.products(category_id);
create index if not exists idx_products_boutique_id on public.products(boutique_id);
create index if not exists idx_products_primary_boutique_id on public.products(primary_boutique_id);
create index if not exists idx_products_is_trending on public.products(is_trending);
create index if not exists idx_product_images_product_id on public.product_images(product_id);
create index if not exists idx_recently_viewed_user_id on public.recently_viewed(user_id);
create index if not exists idx_recently_viewed_product_id on public.recently_viewed(product_id);
create index if not exists idx_recently_viewed_boutique_id on public.recently_viewed(boutique_id);
create unique index if not exists idx_recently_viewed_unique_triplet
  on public.recently_viewed(user_id, coalesce(product_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(boutique_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists idx_saved_boutiques_user_id on public.saved_boutiques(user_id);
create index if not exists idx_saved_boutiques_boutique_id on public.saved_boutiques(boutique_id);
create index if not exists idx_wishlist_items_user_id on public.wishlist_items(user_id);
create index if not exists idx_wishlist_items_product_id on public.wishlist_items(product_id);
create index if not exists idx_appointments_user_id on public.appointments(user_id);
create index if not exists idx_appointments_boutique_id on public.appointments(boutique_id);

alter table if exists public.saved_boutiques
  alter column user_id set not null;

alter table if exists public.saved_boutiques
  alter column boutique_id set not null;

create unique index if not exists idx_saved_boutiques_unique_pair
  on public.saved_boutiques(user_id, boutique_id);

create unique index if not exists idx_wishlist_items_unique_user_product
  on public.wishlist_items(user_id, product_id);

alter table if exists public.saved_boutiques
  enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'saved_boutiques'
      and policyname = 'Users can view own saved boutiques'
  ) then
    create policy "Users can view own saved boutiques"
      on public.saved_boutiques
      for select
      using (user_id = auth.uid());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'saved_boutiques'
      and policyname = 'Authenticated users can save boutiques'
  ) then
    create policy "Authenticated users can save boutiques"
      on public.saved_boutiques
      for insert
      with check (user_id = auth.uid());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'saved_boutiques'
      and policyname = 'Users can delete own saved boutiques'
  ) then
    create policy "Users can delete own saved boutiques"
      on public.saved_boutiques
      for delete
      using (user_id = auth.uid());
  end if;
end $$;
