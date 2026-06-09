-- Poster frame for product videos (must match the uploaded video; never a random product image).
alter table public.products
  add column if not exists video_thumbnail text;
