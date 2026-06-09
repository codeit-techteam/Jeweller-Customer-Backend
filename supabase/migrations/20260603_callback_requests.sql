-- Callback support requests (customer app + admin panel)

CREATE SEQUENCE IF NOT EXISTS callback_reference_seq START WITH 100001;

CREATE TABLE IF NOT EXISTS callback_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_id TEXT UNIQUE,
  customer_id UUID REFERENCES public.users_profile(id) ON DELETE SET NULL,
  customer_name TEXT,
  mobile_number TEXT NOT NULL,
  preferred_time_slot TEXT NOT NULL CHECK (
    preferred_time_slot IN ('morning', 'afternoon', 'evening')
  ),
  requirement TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'assigned', 'in_progress', 'completed', 'closed')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_callback_requests_status ON callback_requests(status);
CREATE INDEX IF NOT EXISTS idx_callback_requests_created_at ON callback_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_callback_requests_reference_id ON callback_requests(reference_id);
CREATE INDEX IF NOT EXISTS idx_callback_requests_customer_id ON callback_requests(customer_id);

CREATE OR REPLACE FUNCTION set_callback_reference_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.reference_id IS NULL OR btrim(NEW.reference_id) = '' THEN
    NEW.reference_id := 'CB-' || nextval('callback_reference_seq')::TEXT;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS callback_requests_before_insert ON callback_requests;
CREATE TRIGGER callback_requests_before_insert
  BEFORE INSERT ON callback_requests
  FOR EACH ROW
  EXECUTE FUNCTION set_callback_reference_id();

CREATE OR REPLACE FUNCTION callback_requests_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS callback_requests_before_update ON callback_requests;
CREATE TRIGGER callback_requests_before_update
  BEFORE UPDATE ON callback_requests
  FOR EACH ROW
  EXECUTE FUNCTION callback_requests_touch_updated_at();
