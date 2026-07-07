-- Smart Engagement Notifications: proactive notification rule engine.
-- Adds a configurable rules table for the admin-managed engagement templates
-- (New Product, Price Drop, New Collection, Nearby Boutique, Trending Product,
-- Festival Campaign, Wishlist Reminder, Appointment Reminder, Recently Viewed
-- Reminder, Boutique Recommendation). Does not modify existing notification
-- tables/RPCs.

create table if not exists public.notification_rules (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  type text not null check (type in (
    'new_product',
    'price_drop',
    'new_collection',
    'nearby_boutique',
    'trending_product',
    'festival_campaign',
    'wishlist_reminder',
    'appointment_reminder',
    'recently_viewed_reminder',
    'boutique_recommendation'
  )),
  trigger_event text not null,
  enabled boolean not null default true,
  target_audience jsonb not null default '{"mode":"all"}'::jsonb,
  template jsonb not null default '{}'::jsonb,
  cta_text text,
  cta_link text,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  created_by text,
  last_sent_at timestamptz,
  total_sent_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_notification_rules_type on public.notification_rules (type);
create index if not exists idx_notification_rules_enabled on public.notification_rules (enabled);

-- Needed for the "City" targeting mode — no city column exists on
-- users_profile today. Nullable; backfill/collection is a follow-up.
alter table public.users_profile add column if not exists city text;
create index if not exists idx_users_profile_city on public.users_profile (city);

drop trigger if exists set_notification_rules_updated_at on public.notification_rules;
create or replace function public.set_notification_rules_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_notification_rules_updated_at
before update on public.notification_rules
for each row execute function public.set_notification_rules_updated_at();

insert into public.notification_rules
  (title, description, type, trigger_event, target_audience, template, cta_text, cta_link, priority)
select * from (values
  (
    'New Product Launch',
    'Notify customers who viewed, searched, or wishlisted similar products when a boutique uploads a new product.',
    'new_product',
    'product.created',
    '{"mode":"category_interested"}'::jsonb,
    '{"title":"✨ New Arrival","message":"A new {{productName}} has been added by {{boutiqueName}}."}'::jsonb,
    'Explore Now',
    '/product/{{productId}}',
    'medium'
  ),
  (
    'Price Drop Alert',
    'Notify customers who viewed, wishlisted, or searched a product when its price decreases.',
    'price_drop',
    'product.price_updated',
    '{"mode":"wishlist_users"}'::jsonb,
    '{"title":"Price Drop","message":"{{productName}} price reduced by {{discountPercent}}%."}'::jsonb,
    'View Offer',
    '/product/{{productId}}',
    'high'
  ),
  (
    'New Collection Alert',
    'Notify interested customers when the admin creates a new collection.',
    'new_collection',
    'collection.created',
    '{"mode":"category_interested"}'::jsonb,
    '{"title":"New Collection","message":"{{collectionName}} is now live."}'::jsonb,
    'Explore Collection',
    '/collection/{{collectionSlug}}',
    'medium'
  ),
  (
    'Nearby Boutique Joined',
    'Notify customers from the same city when a new boutique is approved.',
    'nearby_boutique',
    'boutique.approved',
    '{"mode":"city"}'::jsonb,
    '{"title":"New Boutique Near You","message":"A new jewellery boutique has joined near you."}'::jsonb,
    'Explore Boutique',
    '/boutique/{{boutiqueId}}',
    'medium'
  ),
  (
    'Trending Product Alert',
    'Notify customers when a product becomes top trending by views, wishlists, or searches.',
    'trending_product',
    'product.trending',
    '{"mode":"all"}'::jsonb,
    '{"title":"Trending Now","message":"{{productName}} are trending today."}'::jsonb,
    'View Product',
    '/product/{{productId}}',
    'medium'
  ),
  (
    'Festival Campaign',
    'Manually launched festival or offer campaign.',
    'festival_campaign',
    'admin.manual',
    '{"mode":"all"}'::jsonb,
    '{"title":"{{campaignTitle}}","message":"{{campaignMessage}}"}'::jsonb,
    'Shop Now',
    '/offers',
    'high'
  ),
  (
    'Wishlist Reminder',
    'Remind customers about wishlist items not visited for 7 days.',
    'wishlist_reminder',
    'wishlist.inactive_7d',
    '{"mode":"wishlist_users"}'::jsonb,
    '{"title":"Still on your mind?","message":"You still have {{productName}} in your Wishlist."}'::jsonb,
    'View Now',
    '/wishlist',
    'low'
  ),
  (
    'Appointment Reminder',
    'Remind customers 24 hours before their booked appointment.',
    'appointment_reminder',
    'appointment.starts_in_24h',
    '{"mode":"selected"}'::jsonb,
    '{"title":"Reminder","message":"Your appointment at {{boutiqueName}} is tomorrow."}'::jsonb,
    'View Appointment',
    '/appointments/{{appointmentId}}',
    'high'
  ),
  (
    'Recently Viewed Reminder',
    'Nudge customers who viewed the same product multiple times but did not book.',
    'recently_viewed_reminder',
    'product.viewed_repeatedly',
    '{"mode":"selected"}'::jsonb,
    '{"title":"Still interested?","message":"{{productName}} is waiting for you."}'::jsonb,
    'View Product',
    '/product/{{productId}}',
    'low'
  ),
  (
    'Boutique Recommendation',
    'Recommend the boutique with the highest inventory in the customer''s most-browsed category.',
    'boutique_recommendation',
    'behavior.category_affinity',
    '{"mode":"category_interested"}'::jsonb,
    '{"title":"Recommended Boutique","message":"{{boutiqueName}} has new {{categoryName}} arrivals."}'::jsonb,
    'Visit Boutique',
    '/boutique/{{boutiqueId}}',
    'low'
  )
) as seed(title, description, type, trigger_event, target_audience, template, cta_text, cta_link, priority)
where not exists (select 1 from public.notification_rules existing where existing.type = seed.type);
