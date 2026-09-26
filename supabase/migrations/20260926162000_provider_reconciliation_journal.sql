-- Phase 6: durable provider reconciliation journal.
-- Server-side operational evidence only; public/API roles remain restricted by existing privilege hardening.

CREATE TABLE IF NOT EXISTS public.provider_reconciliation_runs (
  id TEXT PRIMARY KEY,
  trigger TEXT NOT NULL CHECK (trigger IN ('cron','admin','manual','system')),
  status TEXT NOT NULL CHECK (status IN ('Running','Succeeded','Failed','Partial')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  processed_count INTEGER NOT NULL DEFAULT 0,
  succeeded_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.provider_reconciliation_events (
  id BIGSERIAL PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES public.provider_reconciliation_runs(id) ON DELETE CASCADE,
  operation_id TEXT REFERENCES public.provider_operations(id) ON DELETE SET NULL,
  activation_id TEXT REFERENCES public.activations(id) ON DELETE SET NULL,
  provider_id TEXT REFERENCES public.providers(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('status_sync','cancel','compensate','orphan_review','stock_reconcile')),
  outcome TEXT NOT NULL CHECK (outcome IN ('succeeded','failed','needs_review','skipped')),
  retryable BOOLEAN NOT NULL DEFAULT FALSE,
  provider_status TEXT,
  provider_activation_id TEXT,
  error_code TEXT,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_recon_runs_started ON public.provider_reconciliation_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_recon_runs_status ON public.provider_reconciliation_runs(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_recon_events_run ON public.provider_reconciliation_events(run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_recon_events_activation ON public.provider_reconciliation_events(activation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_recon_events_review ON public.provider_reconciliation_events(outcome, created_at DESC);

INSERT INTO schema_migrations(version)
VALUES ('043_provider_reconciliation_journal')
ON CONFLICT DO NOTHING;
