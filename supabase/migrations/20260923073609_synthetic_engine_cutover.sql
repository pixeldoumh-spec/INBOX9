-- INBOX9: synthetic-only fulfillment cutover.
BEGIN;

INSERT INTO providers (id,name,adapter_key,active,priority)
VALUES ('provider-mock','INBOX9 Synthetic Engine','synthetic',TRUE,10)
ON CONFLICT (id) DO UPDATE SET
  name=EXCLUDED.name, adapter_key=EXCLUDED.adapter_key, active=TRUE, priority=10, updated_at=NOW();

UPDATE providers SET active=FALSE, updated_at=NOW() WHERE id <> 'provider-mock';
UPDATE service_provider_routes SET active=FALSE WHERE provider_id <> 'provider-mock';

INSERT INTO service_provider_routes(service_id,provider_id,priority,active)
SELECT id,'provider-mock',10,TRUE FROM services
ON CONFLICT (service_id,provider_id) DO UPDATE SET active=TRUE, priority=10;

INSERT INTO schema_migrations(version) VALUES ('014_synthetic_engine_cutover') ON CONFLICT DO NOTHING;
COMMIT;
