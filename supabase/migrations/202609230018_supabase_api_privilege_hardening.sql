-- INBOX9: explicit Supabase API privilege hardening.
-- Browser traffic uses the Node /api/* boundary, not PostgREST.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon';
    EXECUTE 'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
  END IF;
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated';
    END IF;
  END IF;
END
$$;

ALTER FUNCTION public.prevent_wallet_ledger_mutation()
  SET search_path = pg_catalog, public;
ALTER FUNCTION public.verify_wallet_balance_after_ledger_insert()
  SET search_path = pg_catalog, public;

CREATE INDEX IF NOT EXISTS idx_payment_recon_actor_user
  ON public.payment_reconciliation_events(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_provider_operations_provider
  ON public.provider_operations(provider_id);
CREATE INDEX IF NOT EXISTS idx_recharge_flagged_by
  ON public.recharge_requests(flagged_by);
CREATE INDEX IF NOT EXISTS idx_routes_provider
  ON public.service_provider_routes(provider_id);
CREATE INDEX IF NOT EXISTS idx_wallet_recon_issues_run
  ON public.wallet_reconciliation_issues(run_id);

DROP INDEX IF EXISTS public.idx_sessions_expires_at;

INSERT INTO schema_migrations(version)
VALUES ('018_supabase_api_privilege_hardening')
ON CONFLICT DO NOTHING;

COMMIT;
