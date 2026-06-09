-- Gallery column (kept in sync with banner_images in API)
alter table public.boutiques
  add column if not exists gallery_images jsonb not null default '[]'::jsonb;

update public.boutiques b
set gallery_images = b.banner_images
where jsonb_typeof(coalesce(b.banner_images, '[]'::jsonb)) = 'array'
  and jsonb_array_length(coalesce(b.banner_images, '[]'::jsonb)) > 0
  and (
    jsonb_typeof(coalesce(b.gallery_images, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(b.gallery_images, '[]'::jsonb)) = 0
  );

-- Fix common collection slug / label typos so filters align with product categories
update public.boutique_collections
set slug = 'earrings'
where lower(trim(slug)) in ('earings', 'earing');

update public.boutique_collections
set name = 'Earrings'
where lower(trim(name)) = 'earings';

-- Authenticated client uploads to boutique-images; public read for app URLs
drop policy if exists "boutique_images_public_select" on storage.objects;
create policy "boutique_images_public_select"
  on storage.objects for select
  to public
  using (bucket_id = 'boutique-images');

drop policy if exists "boutique_images_authenticated_insert" on storage.objects;
create policy "boutique_images_authenticated_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'boutique-images');

drop policy if exists "boutique_images_authenticated_update" on storage.objects;
create policy "boutique_images_authenticated_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'boutique-images')
  with check (bucket_id = 'boutique-images');

drop policy if exists "boutique_images_authenticated_delete" on storage.objects;
create policy "boutique_images_authenticated_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'boutique-images');
