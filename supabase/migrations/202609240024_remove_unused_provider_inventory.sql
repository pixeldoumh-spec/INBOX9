-- INBOX9: remove unused external provider inventory schema and routing state.
BEGIN;

DELETE FROM service_provider_routes
WHERE provider_id IN (
  SELECT id FROM providers WHERE adapter_key='proxnum' OR id='provider-proxnum'
);

DELETE FROM providers
WHERE adapter_key='proxnum' OR id='provider-proxnum';

DROP TABLE IF EXISTS public.provider_service_inventory;

ALTER TABLE public.service_provider_routes
  DROP COLUMN IF EXISTS inventory_expires_at,
  DROP COLUMN IF EXISTS fallback_stock;

INSERT INTO schema_migrations(version)
VALUES ('024_remove_unused_provider_inventory')
ON CONFLICT DO NOTHING;

COMMIT;
