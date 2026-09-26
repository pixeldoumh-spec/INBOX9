BEGIN;

ALTER TABLE public.payment_settings
  ADD COLUMN IF NOT EXISTS enabled BOOLEAN;

COMMENT ON COLUMN public.payment_settings.enabled IS
  'Explicit manual-recharge override. NULL preserves the legacy deployment setting; TRUE/FALSE enables admin control.';

INSERT INTO schema_migrations(version)
VALUES ('038_manual_payment_operations')
ON CONFLICT DO NOTHING;

COMMIT;
