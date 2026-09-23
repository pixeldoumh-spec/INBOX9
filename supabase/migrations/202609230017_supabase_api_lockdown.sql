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

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recharge_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_provider_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activation_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_reconciliation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_reconciliation_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_reconciliation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.synthetic_slot_reservations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.users, public.sessions, public.services, public.activations,
  public.wallets, public.wallet_ledger, public.recharge_requests, public.providers,
  public.service_provider_routes, public.audit_logs, public.provider_operations,
  public.activation_idempotency, public.wallet_reconciliation_runs,
  public.wallet_reconciliation_issues, public.payment_reconciliation_events,
  public.synthetic_slot_reservations FROM anon;

REVOKE ALL ON TABLE public.users, public.sessions, public.services, public.activations,
  public.wallets, public.wallet_ledger, public.recharge_requests, public.providers,
  public.service_provider_routes, public.audit_logs, public.provider_operations,
  public.activation_idempotency, public.wallet_reconciliation_runs,
  public.wallet_reconciliation_issues, public.payment_reconciliation_events,
  public.synthetic_slot_reservations FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.prevent_wallet_ledger_mutation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_wallet_ledger_mutation() FROM anon;
REVOKE EXECUTE ON FUNCTION public.prevent_wallet_ledger_mutation() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_wallet_balance_after_ledger_insert() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verify_wallet_balance_after_ledger_insert() FROM anon;
REVOKE EXECUTE ON FUNCTION public.verify_wallet_balance_after_ledger_insert() FROM authenticated;

INSERT INTO schema_migrations(version)
VALUES ('017_supabase_api_lockdown')
ON CONFLICT DO NOTHING;

COMMIT;
