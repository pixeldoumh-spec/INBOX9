-- INBOX9: trigger-only database functions are not an application RPC surface.
BEGIN;

REVOKE ALL PRIVILEGES ON FUNCTION public.prevent_wallet_ledger_mutation() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION public.verify_wallet_balance_after_ledger_insert() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL PRIVILEGES ON FUNCTION public.prevent_wallet_ledger_mutation() FROM anon;
    REVOKE ALL PRIVILEGES ON FUNCTION public.verify_wallet_balance_after_ledger_insert() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL PRIVILEGES ON FUNCTION public.prevent_wallet_ledger_mutation() FROM authenticated;
    REVOKE ALL PRIVILEGES ON FUNCTION public.verify_wallet_balance_after_ledger_insert() FROM authenticated;
  END IF;
END
$$;

INSERT INTO schema_migrations(version)
VALUES ('022_trigger_function_privilege_lockdown')
ON CONFLICT DO NOTHING;

COMMIT;
