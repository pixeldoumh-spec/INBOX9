-- INBOX9: keep the application database behind the Node server.
-- The browser talks to INBOX9 /api/*, not directly to Supabase PostgREST.
BEGIN;

-- Migration 015 adds services after the original provider cutover. Reassert routing
-- here so every synthetic catalog entry has an active synthetic fulfillment route.
INSERT INTO service_provider_routes(service_id,provider_id,priority,active)
SELECT id,'provider-mock',10,TRUE
FROM services
ON CONFLICT (service_id,provider_id)
DO UPDATE SET active=TRUE, priority=10;

DO $
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'users','sessions','services','activations','wallets','wallet_ledger',
    'recharge_requests','providers','service_provider_routes','audit_logs',
    'provider_operations','activation_idempotency','wallet_reconciliation_runs',
    'wallet_reconciliation_issues','payment_reconciliation_events','synthetic_slot_reservations'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', table_name);
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', table_name);
    END IF;
  END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION public.prevent_wallet_ledger_mutation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verify_wallet_balance_after_ledger_insert() FROM PUBLIC;

DO $inbox9$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE EXECUTE ON FUNCTION public.prevent_wallet_ledger_mutation() FROM anon;
    REVOKE EXECUTE ON FUNCTION public.verify_wallet_balance_after_ledger_insert() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE EXECUTE ON FUNCTION public.prevent_wallet_ledger_mutation() FROM authenticated;
    REVOKE EXECUTE ON FUNCTION public.verify_wallet_balance_after_ledger_insert() FROM authenticated;
  END IF;
END $$;

INSERT INTO schema_migrations(version)
VALUES ('017_supabase_api_lockdown')
ON CONFLICT DO NOTHING;

COMMIT;
