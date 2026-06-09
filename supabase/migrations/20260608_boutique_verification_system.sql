-- Boutique verification workflow: document review, admin controls, verification documents

DO $$ BEGIN
  CREATE TYPE public.boutique_verification_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.boutique_doc_type AS ENUM (
    'GST',
    'PAN',
    'ADDRESS_PROOF',
    'IDENTITY_PROOF',
    'BOUTIQUE_PHOTO'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.verification_doc_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.boutiques
  ADD COLUMN IF NOT EXISTS verification_status public.boutique_verification_status NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_note text,
  ADD COLUMN IF NOT EXISTS verification_rejected_reason text,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by uuid;

-- Backfill verification_status from legacy store_status
UPDATE public.boutiques
SET verification_status = CASE
  WHEN lower(coalesce(store_status, '')) = 'approved' THEN 'APPROVED'::public.boutique_verification_status
  WHEN lower(coalesce(store_status, '')) = 'rejected' THEN 'REJECTED'::public.boutique_verification_status
  ELSE 'PENDING'::public.boutique_verification_status
END
WHERE verification_status = 'PENDING';

-- Sync is_featured from legacy featured column
UPDATE public.boutiques
SET is_featured = featured
WHERE is_featured = false AND featured = true;

CREATE TABLE IF NOT EXISTS public.boutique_verification_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boutique_id uuid NOT NULL REFERENCES public.boutiques(id) ON DELETE CASCADE,
  jeweller_id uuid,
  doc_type public.boutique_doc_type NOT NULL,
  file_url text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  status public.verification_doc_status NOT NULL DEFAULT 'PENDING',
  reviewed_by uuid,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_boutique_verification_docs_boutique
  ON public.boutique_verification_documents(boutique_id);

CREATE INDEX IF NOT EXISTS idx_boutiques_verification_status
  ON public.boutiques(verification_status);

CREATE INDEX IF NOT EXISTS idx_boutiques_is_featured
  ON public.boutiques(is_featured);
