-- GehnaHub production support chat: conversations, messages, agents, ratings, typing, realtime

CREATE SEQUENCE IF NOT EXISTS support_ticket_seq START WITH 100001;

CREATE TABLE IF NOT EXISTS public.support_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text UNIQUE,
  status text NOT NULL DEFAULT 'online' CHECK (status IN ('online', 'away', 'offline')),
  department text NOT NULL DEFAULT 'concierge',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  customer_name text,
  ticket_number text UNIQUE,
  status text NOT NULL DEFAULT 'open' CHECK (
    status IN (
      'open',
      'assigned',
      'in_progress',
      'waiting_for_customer',
      'resolved',
      'closed'
    )
  ),
  assigned_agent_id uuid REFERENCES public.support_agents(id) ON DELETE SET NULL,
  last_message text,
  last_message_at timestamptz,
  internal_notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.support_conversations(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('customer', 'agent', 'system')),
  sender_id uuid,
  message text,
  message_type text NOT NULL DEFAULT 'text' CHECK (
    message_type IN (
      'text',
      'image',
      'pdf',
      'voice',
      'appointment_card',
      'callback_card',
      'system'
    )
  ),
  attachment_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  delivery_status text NOT NULL DEFAULT 'sent' CHECK (
    delivery_status IN ('sent', 'delivered', 'read')
  ),
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_conversation_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL UNIQUE REFERENCES public.support_conversations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating >= 1 AND rating <= 5),
  feedback text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_typing_presence (
  conversation_id uuid NOT NULL REFERENCES public.support_conversations(id) ON DELETE CASCADE,
  participant_type text NOT NULL CHECK (participant_type IN ('customer', 'agent')),
  participant_id uuid,
  is_typing boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, participant_type)
);

CREATE INDEX IF NOT EXISTS idx_support_conversations_customer ON public.support_conversations(customer_id);
CREATE INDEX IF NOT EXISTS idx_support_conversations_status ON public.support_conversations(status);
CREATE INDEX IF NOT EXISTS idx_support_conversations_updated ON public.support_conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_messages_conversation ON public.support_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_support_agents_status ON public.support_agents(status);

INSERT INTO public.support_agents (name, email, status, department)
VALUES ('GehnaHub Support', 'support@gehnahub.com', 'online', 'concierge')
ON CONFLICT (email) DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_support_ticket_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ticket_number IS NULL OR btrim(NEW.ticket_number) = '' THEN
    NEW.ticket_number := 'SUP-' || nextval('support_ticket_seq')::text;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS support_conversations_before_insert ON public.support_conversations;
CREATE TRIGGER support_conversations_before_insert
  BEFORE INSERT ON public.support_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_support_ticket_number();

CREATE OR REPLACE FUNCTION public.support_conversations_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS support_conversations_before_update ON public.support_conversations;
CREATE TRIGGER support_conversations_before_update
  BEFORE UPDATE ON public.support_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.support_conversations_touch_updated_at();

CREATE OR REPLACE FUNCTION public.support_messages_touch_conversation()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.support_conversations
  SET
    last_message = COALESCE(NEW.message, NEW.message_type),
    last_message_at = NEW.created_at,
    updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS support_messages_after_insert ON public.support_messages;
CREATE TRIGGER support_messages_after_insert
  AFTER INSERT ON public.support_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.support_messages_touch_conversation();

-- Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'support_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'support_conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_conversations;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'support_typing_presence'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_typing_presence;
  END IF;
END $$;

ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_conversation_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_typing_presence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_conversations_customer ON public.support_conversations;
CREATE POLICY support_conversations_customer ON public.support_conversations
  FOR ALL TO authenticated
  USING (auth.uid() = customer_id)
  WITH CHECK (auth.uid() = customer_id);

DROP POLICY IF EXISTS support_messages_customer ON public.support_messages;
CREATE POLICY support_messages_customer ON public.support_messages
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.support_conversations c
      WHERE c.id = conversation_id AND c.customer_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.support_conversations c
      WHERE c.id = conversation_id AND c.customer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS support_ratings_customer ON public.support_conversation_ratings;
CREATE POLICY support_ratings_customer ON public.support_conversation_ratings
  FOR ALL TO authenticated
  USING (auth.uid() = customer_id)
  WITH CHECK (auth.uid() = customer_id);

DROP POLICY IF EXISTS support_typing_customer ON public.support_typing_presence;
CREATE POLICY support_typing_customer ON public.support_typing_presence
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.support_conversations c
      WHERE c.id = conversation_id AND c.customer_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.support_conversations c
      WHERE c.id = conversation_id AND c.customer_id = auth.uid()
    )
  );
