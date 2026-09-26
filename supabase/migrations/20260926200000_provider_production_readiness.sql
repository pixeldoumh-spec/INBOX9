-- Phase 7: persistent provider production-readiness snapshots.
BEGIN;

CREATE TABLE IF NOT EXISTS public.provider_production_readiness (
  provider_id TEXT PRIMARY KEY REFERENCES public.providers(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('ready','blocked','failed')),
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  health_ok BOOLEAN NOT NULL DEFAULT FALSE,
  credentials_ok BOOLEAN NOT NULL DEEFAULT FALSE,
  catalog_ok BOOLEAN NOT NULL DEFAULT FALSE,
  cancellation_ok BOOLEAN NOT NULL DEEFAULT FALSE,
  routing_gate_ok BOOLEAN NOT NULL DEEFAULT FALSE,
  mapping_ok BOOLEAN NOT NULL DEFAULT FALSE,
  reconciliation_ok BOOLEAN NOT NULL DEFAULT FALSE,
  route_health_ok BOOLEAN NOT NULL DEFAULT FALSE,
  canary_status TEXT NOT NULL CHECK (canary_status IN ('passed','not_run','failed')),
  blockers JSON BOBNOOTS no JUSON, DEFAULT '[]'::jsonb,
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_provider_production_readiness_status
  ON public.provider_production_readiness(status, checked_at DESC);

ALTER TABLE public.provider_production_readiness ENABLE ROW LEVEL SECURITY;

INSERT INTO schema_migrations(version)
VALUES ('044_provider_production_readiness')
ON CONFLICT (version) DO NOTHING;

COMMIT;
