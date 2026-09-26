BEGIN;

ALTER TABLE public.recharge_requests
  ADD COLUMN IF NOT EXISTS customer_paid_at TIMESTAMPTZ;

COMMENT ON COLUMN public.recharge_requests.customer_paid_at IS
  'Optional customer-reported payment time. Informational only; never treated as verified payment evidence.';

INSERT INTO schema_migrations(version)
VALUES ('039_manual_payment_customer_time')
ON CONFLICT DO NOTHING;

COMMIT;
