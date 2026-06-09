-- Canonical category hero image + backfill curated, unique URLs per jewellery type.

alter table if exists public.categories
  add column if not exists category_image_url text;

-- Keep legacy `image` in sync for older clients.
update public.categories
set category_image_url = image
where category_image_url is null
  and image is not null
  and trim(image) <> '';

-- Curated Unsplash URLs (unique per category, square crop).
-- Slugs match toSlug() from the CMS (name lowercased, spaces → hyphens).
update public.categories c
set
  category_image_url = v.url,
  image = v.url,
  updated_at = now()
from (
  values
    ('rings', 'https://images.unsplash.com/photo-1617038260897-41a1f14a8ca0?w=800&q=85&auto=format&fit=crop&crop=center'),
    ('bangles', 'https://images.unsplash.com/photo-1596944924616-7b38e7cfac36?w=800&q=85&auto=format&fit=crop&crop=center'),
    ('bracelets', 'https://images.unsplash.com/photo-1721808085307-919cf89fe3fa?w=800&q=85&auto=format&fit=crop&crop=center'),
    ('coins', 'https://images.unsplash.com/photo-1601121141461-9d6647bca1ed?w=800&q=85&auto=format&fit=crop&crop=center'),
    ('earrings', 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=800&q=85&auto=format&fit=crop&crop=center'),
    ('gold-coins', 'https://images.unsplash.com/photo-1631982690223-8aa4be0a2497?w=800&q=85&auto=format&fit=crop&crop=center'),
    ('mangalsutras', 'https://images.unsplash.com/photo-1617038220319-276d3cfab638?w=800&q=85&auto=format&fit=crop&crop=center'),
    ('mens-rings', 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=800&q=85&auto=format&fit=crop&crop=center'),
    ('necklaces', 'https://images.unsplash.com/photo-1602751584552-8ba73aad10e1?w=800&q=85&auto=format&fit=crop&crop=center'),
    ('nose-pins', 'https://images.unsplash.com/photo-1611955167811-4711904bb9f8?w=800&q=85&auto=format&fit=crop&crop=center'),
    ('pendants', 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=800&q=85&auto=format&fit=crop&crop=center'),
    ('solitaires', 'https://images.unsplash.com/photo-1708222170603-12471477b1d9?w=800&q=85&auto=format&fit=crop&crop=center')
) as v(slug, url)
where coalesce(
  c.slug,
  lower(
    regexp_replace(
      replace(trim(c.name), '''', ''),
      '[^a-zA-Z0-9]+',
      '-',
      'g'
    )
  )
) = v.slug;

comment on column public.categories.category_image_url is
  'Primary category card image URL (Collections grid, home, menu). Synced with legacy image column on CMS writes.';
