-- Allow support notifications + ensure realtime works for support_messages

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (
  type IN (
    'offer', 'appointment', 'callback', 'system', 'support',
    'gold_rate', 'collection', 'promotion', 'profile',
    'order', 'lead', 'document', 'payment', 'approval'
  )
);

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_action_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_action_type_check CHECK (
  action_type IN (
    'none', 'offer', 'appointment', 'collection', 'boutique', 'url', 'order', 'callback', 'support'
  )
);

ALTER TABLE public.support_messages REPLICA IDENTITY FULL;
