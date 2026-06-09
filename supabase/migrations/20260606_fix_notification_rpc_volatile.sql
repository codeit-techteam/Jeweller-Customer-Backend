-- Fix: STABLE functions cannot write. is_notification_type_enabled called ensure_notification_settings (INSERT).

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

-- Bulk attach recipients for admin campaigns (one round-trip, no per-user RPC from Node).
CREATE OR REPLACE FUNCTION public.attach_notification_recipients(
  p_notification_id uuid,
  p_user_ids uuid[],
  p_type text
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer;
BEGIN
  INSERT INTO public.notification_settings (user_id)
  SELECT uid FROM unnest(p_user_ids) AS uid
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_notifications (notification_id, user_id)
  SELECT p_notification_id, ns.user_id
  FROM public.notification_settings ns
  WHERE ns.user_id = ANY (p_user_ids)
    AND (
      (p_type IN ('offer', 'promotion', 'collection') AND ns.offers_enabled)
      OR (p_type IN ('appointment') AND ns.appointments_enabled)
      OR (p_type IN ('callback', 'support', 'gold_rate', 'profile') AND COALESCE(ns.support_enabled, true))
      OR (
        p_type NOT IN (
          'offer', 'promotion', 'collection', 'appointment',
          'callback', 'support', 'gold_rate', 'profile'
        )
        AND ns.system_enabled
      )
    )
  ON CONFLICT (notification_id, user_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_notification_type_enabled TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.attach_notification_recipients TO service_role;
