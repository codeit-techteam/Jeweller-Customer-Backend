-- Marketplace-style Smart Engagement Notifications.
--
-- Adds banner image / target (product, collection, boutique, category, url) /
-- auto-generated deep link / CTA / rendering-style columns to the existing
-- `notifications` and `notification_rules` tables so the Customer App can
-- render rich, tappable notification cards (Myntra/Amazon/Flipkart style)
-- instead of plain text.
--
-- Purely additive: every new column is nullable or has a safe default, so
-- existing rows and existing delivery code paths keep working unchanged.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS thumbnail text,
  ADD COLUMN IF NOT EXISTS target_type text,
  ADD COLUMN IF NOT EXISTS target_id text,
  ADD COLUMN IF NOT EXISTS deep_link text,
  ADD COLUMN IF NOT EXISTS cta_text text,
  ADD COLUMN IF NOT EXISTS notification_style text NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS banner_color text,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notifications_target_type_check'
  ) THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_target_type_check
      CHECK (target_type IS NULL OR target_type IN ('none', 'product', 'collection', 'boutique', 'category', 'url'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notifications_priority_check'
  ) THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_priority_check
      CHECK (priority IN ('low', 'medium', 'high'));
  END IF;
END $$;

ALTER TABLE public.notification_rules
  ADD COLUMN IF NOT EXISTS thumbnail text,
  ADD COLUMN IF NOT EXISTS target_type text,
  ADD COLUMN IF NOT EXISTS target_id text,
  ADD COLUMN IF NOT EXISTS deep_link text,
  ADD COLUMN IF NOT EXISTS notification_style text NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS banner_color text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notification_rules_target_type_check'
  ) THEN
    ALTER TABLE public.notification_rules
      ADD CONSTRAINT notification_rules_target_type_check
      CHECK (target_type IS NULL OR target_type IN ('none', 'product', 'collection', 'boutique', 'category', 'url'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notifications_target ON public.notifications (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_notification_rules_target ON public.notification_rules (target_type, target_id);
