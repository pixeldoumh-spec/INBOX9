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

INSERT INTO schema_migrations(version)
VALUES ('017_supabase_api_lockdown')
ON CONFLICT DO NOTHING;

COMMIT;
