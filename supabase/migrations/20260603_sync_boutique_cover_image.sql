-- Keep legacy `image` column aligned with jeweller-uploaded `cover_image_url`
-- so joins that only select `image` still resolve covers correctly.
update boutiques
set
  image = cover_image_url,
  updated_at = coalesce(updated_at, now())
where deleted_at is null
  and (image is null or trim(image) = '')
  and cover_image_url is not null
  and trim(cover_image_url) <> '';
