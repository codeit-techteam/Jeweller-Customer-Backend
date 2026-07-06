-- Analytics query performance indexes for drill-down and aggregation workloads

create index if not exists idx_product_views_boutique_day
  on public.product_views (boutique_id, created_at desc);

create index if not exists idx_product_views_product_day
  on public.product_views (product_id, created_at desc);

create index if not exists idx_wishlist_items_user_created
  on public.wishlist_items (user_id, created_at desc);

create index if not exists idx_recently_viewed_user_viewed
  on public.recently_viewed (user_id, viewed_at desc);

create index if not exists idx_appointments_user_created
  on public.appointments (user_id, created_at desc);
