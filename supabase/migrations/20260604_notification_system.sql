-- Production notification system: notifications + recipients + settings
-- Migrates legacy flat `notifications` (user_id column) when present.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'notifications'
      AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.notifications RENAME TO notifications_legacy;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL DEFAULT 'system'
    CHECK (type IN (
      'offer', 'appointment', 'callback', 'system',
      'gold_rate', 'collection', 'promotion', 'profile',
      'order', 'lead', 'document', 'payment', 'approval'
    )),
  image_url text,
  action_type text DEFAULT 'none'
    CHECK (action_type IN (
      'none', 'offer', 'appointment', 'collection', 'boutique', 'url', 'order', 'callback'
    )),
  action_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notification_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notification_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.notification_settings (
  user_id uuid PRIMARY KEY,
  offers_enabled boolean NOT NULL DEFAULT true,
  appointments_enabled boolean NOT NULL DEFAULT true,
  reminders_enabled boolean NOT NULL DEFAULT true,
  system_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_recipients_user_read
  ON public.notification_recipients (user_id, is_read);

CREATE INDEX IF NOT EXISTS idx_notification_recipients_user_created
  ON public.notification_recipients (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_created
  ON public.notifications (created_at DESC);

-- Migrate legacy rows
DO $$
BEGIN
  IF to_regclass('public.notifications_legacy') IS NOT NULL THEN
    INSERT INTO public.notifications (
      id, title, message, type, image_url, action_type, action_id, metadata, created_at
    )
    SELECT
      n.id,
      COALESCE(n.title, 'Notification'),
      COALESCE(n.body, n.message, ''),
      CASE
        WHEN n.type IN ('offer', 'appointment', 'callback', 'system', 'gold_rate', 'collection', 'promotion', 'profile')
          THEN n.type
        WHEN n.type = 'lead' THEN 'lead'
        WHEN n.type = 'order' THEN 'order'
        WHEN n.type = 'approval' THEN 'approval'
        ELSE 'system'
      END,
      COALESCE((n.data ->> 'imageUri'), (n.data ->> 'image')),
      CASE
        WHEN (n.data ->> 'route') LIKE '%offer%' OR n.type = 'offer' THEN 'offer'
        WHEN (n.data ->> 'route') LIKE '%appointment%' OR n.type = 'appointment' THEN 'appointment'
        WHEN (n.data ->> 'route') LIKE '%collection%' THEN 'collection'
        WHEN (n.data ->> 'route') LIKE '%boutique%' THEN 'boutique'
        ELSE 'none'
      END,
      COALESCE(
        (n.data ->> 'offerId'),
        (n.data ->> 'appointmentId'),
        (n.data ->> 'collectionId'),
        (n.data ->> 'boutiqueId'),
        (n.data ->> 'orderId')
      ),
      COALESCE(n.data, '{}'::jsonb),
      COALESCE(n.created_at, now())
    FROM public.notifications_legacy n
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.notification_recipients (
      notification_id, user_id, is_read, read_at, created_at
    )
    SELECT
      n.id,
      n.user_id,
      COALESCE(n.is_read, false),
      CASE WHEN COALESCE(n.is_read, false) THEN COALESCE(n.created_at, now()) ELSE NULL END,
      COALESCE(n.created_at, now())
    FROM public.notifications_legacy n
    WHERE n.user_id IS NOT NULL
    ON CONFLICT (notification_id, user_id) DO NOTHING;

    DROP TABLE public.notifications_legacy;
  END IF;
END $$;

-- Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notification_recipients'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_recipients;
  END IF;
END $$;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_recipients_select_own ON public.notification_recipients;
CREATE POLICY notification_recipients_select_own ON public.notification_recipients
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS notification_recipients_update_own ON public.notification_recipients;
CREATE POLICY notification_recipients_update_own ON public.notification_recipients
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS notification_recipients_delete_own ON public.notification_recipients;
CREATE POLICY notification_recipients_delete_own ON public.notification_recipients
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS notifications_select_via_recipient ON public.notifications;
CREATE POLICY notifications_select_via_recipient ON public.notifications
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.notification_recipients r
      WHERE r.notification_id = notifications.id AND r.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS notification_settings_select_own ON public.notification_settings;
CREATE POLICY notification_settings_select_own ON public.notification_settings
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS notification_settings_upsert_own ON public.notification_settings;
CREATE POLICY notification_settings_upsert_own ON public.notification_settings
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.ensure_notification_settings(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notification_settings (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

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
  ELSIF p_type IN ('callback', 'gold_rate', 'profile') THEN
    RETURN s.reminders_enabled;
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
    FROM public.notification_recipients r
    JOIN public.notifications n ON n.id = r.notification_id
    WHERE r.user_id = p_user_id
      AND n.metadata ->> 'event_key' = v_event_key
    LIMIT 1;
    IF v_recipient_id IS NOT NULL THEN
      RETURN v_recipient_id;
    END IF;
  END IF;

  INSERT INTO public.notifications (
    title, message, type, image_url, action_type, action_id, metadata
  )
  VALUES (
    p_title,
    p_message,
    COALESCE(p_type, 'system'),
    p_image_url,
    COALESCE(p_action_type, 'none'),
    p_action_id,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_notification_id;

  INSERT INTO public.notification_recipients (notification_id, user_id)
  VALUES (v_notification_id, p_user_id)
  RETURNING id INTO v_recipient_id;

  RETURN v_recipient_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.deliver_notification TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_notification_settings TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_notification_type_enabled TO authenticated, service_role;
