BEGIN;

CREATE TABLE IF NOT EXISTS public.provider_lifecycle_certifications (
  id UUID PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  service_id TEXT REFERENCES public.services(id) ON DELETE SET NULL,
  country TEXT NOT NULL DEFAULT 'IN' CHECK (country='IN'),
  mode TEXT NOT NULL CHECK (mode IN ('contract','external')),
  status TEXT NOT NULL CHECK (status IN ('passed','failed','blocked','awaiting_otp','completed','cancelled')),
  reserve_ok BOOLEAN NOT NULL DEFAULT FALSE,
  poll_ok BOOLEAN NOT NULL DEFAULT FALSE,
  completion_ok BOOLEAN NOT NULL DEFAULT FALSE,
  cancellation_ok BOOLEAN NOT NULL DEFAULT FALSE,
  reconciliation_ok BOOLEAN NOT NULL DEFAULT FALSE,
  cleanup_ok BOOLEAN NOT NULL DEFAULT FALSE,
  billable BOOLEAN NOT NULL DEFAULT FALSE,
  provider_activation_id TEXT,
  provider_service_code TEXT,
  observed_price_usd NUMERIC(12,6),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_code TEXT,
  error_message TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_lifecycle_certifications_provider
  ON public.provider_lifecycle_certifications(provider_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_provider_lifecycle_certifications_service
  ON public.provider_lifecycle_certifications(service_id, created_at DESC);

ALTER TABLE public.provider_lifecycle_certifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON TABLE public.provider_lifecycle_certifications FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON TABLE public.provider_lifecycle_certifications FROM authenticated;
  END IF;
END $$;

INSERT INTO schema_migrations(version)
VALUES ('045_provider_lifecycle_certifications')
ON CONFLICT (version) DO NOTHING;

COMMIT;