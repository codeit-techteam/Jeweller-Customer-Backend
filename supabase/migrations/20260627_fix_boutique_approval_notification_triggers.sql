-- Fix boutique approval/rejection triggers that referenced legacy notifications(user_id, body, data).
-- Use deliver_notification() which writes to notifications + user_notifications.

ALTER TABLE public.boutiques
  ADD COLUMN IF NOT EXISTS store_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS is_onboarding_done boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_self_managed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS member_id text,
  ADD COLUMN IF NOT EXISTS jeweller_user_id uuid,
  ADD COLUMN IF NOT EXISTS owner_name text,
  ADD COLUMN IF NOT EXISTS store_tagline text,
  ADD COLUMN IF NOT EXISTS cover_image_url text,
  ADD COLUMN IF NOT EXISTS gallery_images jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.notify_jeweller_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.store_status = 'approved'
     AND OLD.store_status IS DISTINCT FROM 'approved'
     AND NEW.jeweller_user_id IS NOT NULL
  THEN
    PERFORM public.deliver_notification(
      NEW.jeweller_user_id,
      '🎉 Store Approved!',
      'Your store is now live on GehnaHub. Customers can now find and visit you.',
      'approval',
      NULL,
      'boutique',
      NEW.id::text,
      jsonb_build_object(
        'boutiqueId', NEW.id,
        'event_key', 'boutique_store_approved:' || NEW.id::text
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_jeweller_on_rejection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.store_status = 'rejected'
     AND OLD.store_status IS DISTINCT FROM 'rejected'
     AND NEW.jeweller_user_id IS NOT NULL
  THEN
    PERFORM public.deliver_notification(
      NEW.jeweller_user_id,
      'Store Review Update',
      'Your store was not approved. Please check admin feedback and resubmit.',
      'approval',
      NULL,
      'boutique',
      NEW.id::text,
      jsonb_build_object(
        'boutiqueId', NEW.id,
        'event_key', 'boutique_store_rejected:' || NEW.id::text
      )
    );
  END IF;
  RETURN NEW;
END;
$$;
