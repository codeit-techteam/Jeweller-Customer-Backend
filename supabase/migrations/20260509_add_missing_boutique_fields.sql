alter table if exists public.boutiques
add column if not exists description text,
add column if not exists verified boolean default false,
add column if not exists featured boolean default false,
add column if not exists phone text,
add column if not exists address text,
add column if not exists owner_name text;
