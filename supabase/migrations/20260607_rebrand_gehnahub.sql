-- Rebrand CMS seed copy from legacy placeholder branding to GehnaHub
UPDATE public.featured_sections
SET subtitle = 'Editorial story by GehnaHub'
WHERE slug = 'curated'
  AND subtitle ILIKE '%Luxe%';
