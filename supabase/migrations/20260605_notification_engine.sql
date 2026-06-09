-- Enterprise notification engine: user_notifications, image column, push tokens, support settings

ALTER TABLE IF EXISTS public.notification_recipients RENAME TO user_notifications;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'image_url'
  ) THEN
    ALTER TABLE public.notifications RENAME COLUMN image_url TO image;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notification_settings' AND column_name = 'reminders_enabled'
  ) THEN
    ALTER TABLE public.notification_settings RENAME COLUMN reminders_enabled TO support_enabled;
  END IF;
END $$;

ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS push_enabled boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.user_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token text NOT NULL,
  platform text,
  provider text NOT NULL DEFAULT 'expo',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_user_push_tokens_user ON public.user_push_tokens (user_id);

ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_push_tokens_own ON public.user_push_tokens;
CREATE POLICY user_push_tokens_own ON public.user_push_tokens
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Realtime on user_notifications
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notification_recipients'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.notification_recipients;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'user_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.is_notification_type_enabled(p_user_id uuid, p_type text)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.notification_settings%ROWTYPE;
BEGIN
  PERFORM public.ensure_notification_settings(p_user_id);
  SELECT * INTO s FROM public.notification_settings WHERE user_id = p_user_id;

  IF p_type IN ('offer', 'promotion', 'collection') THEN
    RETURN s.offers_enabled;
  ELSIF p_type IN ('appointment') THEN
    RETURN s.appointments_enabled;
  ELSIF p_type IN ('callback', 'support', 'gold_rate', 'profile') THEN
    RETURN COALESCE(s.support_enabled, true);
  ELSE
    RETURN s.system_enabled;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.deliver_notification(
  p_user_id uuid,
  p_title text,
  p_message text,
  p_type text DEFAULT 'system',
  p_image_url text DEFAULT NULL,
  p_action_type text DEFAULT 'none',
  p_action_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification_id uuid;
  v_recipient_id uuid;
  v_event_key text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id required';
  END IF;

  IF NOT public.is_notification_type_enabled(p_user_id, COALESCE(p_type, 'system')) THEN
    RETURN NULL;
  END IF;

  v_event_key := NULLIF(trim(p_metadata ->> 'event_key'), '');
  IF v_event_key IS NOT NULL THEN
    SELECT r.id INTO v_recipient_id
    FROM public.user_notifications r
    JOIN public.notifications n ON n.id = r.notification_id
    WHERE r.user_id = p_user_id AND n.metadata ->> 'event_key' = v_event_key
    LIMIT 1;
    IF v_recipient_id IS NOT NULL THEN
      RETURN v_recipient_id;
    END IF;
  END IF;

  INSERT INTO public.notifications (title, message, type, image, action_type, action_id, metadata)
  VALUES (
    p_title, p_message, COALESCE(p_type, 'system'), p_image_url,
    COALESCE(p_action_type, 'none'), p_action_id, COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_notification_id;

  INSERT INTO public.user_notifications (notification_id, user_id)
  VALUES (v_notification_id, p_user_id)
  RETURNING id INTO v_recipient_id;

  RETURN v_recipient_id;
END;
$$;
