-- Replace 404 Unsplash URLs; keep Rings on the original approved photo id.

update public.categories c
set
  category_image_url = v.url,
  image = v.url,
  updated_at = now()
from (
  values
    ('bangles', 'https://images.unsplash.com/photo-1596944924616-7b38e7cfac36?w=800&q=85&auto=format&fit=crop&crop=center'),
    ('bracelets', 'https://images.unsplash.com/photo-1721808085307-919cf89fe3fa?w=800&q=85&auto=format&fit=crop&crop=center'),
    ('coins', 'https://images.unsplash.com/photo-1601121141461-9d6647bca1ed?w=800&q=85&auto=format&fit=crop&crop=center'),
    ('gold-coins', 'https://images.unsplash.com/photo-1631982690223-8aa4be0a2497?w=800&q=85&auto=format&fit=crop&crop=center'),
    ('nose-pins', 'https://images.unsplash.com/photo-1611955167811-4711904bb9f8?w=800&q=85&auto=format&fit=crop&crop=center'),
    ('solitaires', 'https://images.unsplash.com/photo-1708222170603-12471477b1d9?w=800&q=85&auto=format&fit=crop&crop=center')
) as v(slug, url)
where coalesce(
  c.slug,
  lower(regexp_replace(replace(trim(c.name), chr(39), ''), '[^a-zA-Z0-9]+', '-', 'g'))
) = v.slug;
