-- Seed featured flag for verified active boutiques (Featured Boutiques Near You section)
UPDATE public.boutiques
SET
  is_featured = true,
  featured = true
WHERE is_verified = true
  AND is_active = true
  AND store_status = 'approved'
  AND is_featured = false
  AND (featured IS NULL OR featured = false);
