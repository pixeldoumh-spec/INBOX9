-- INBOX9: register the Shelex adapter as an inactive diagnostic provider only.
BEGIN;
INSERT INTO providers (id,name,adapter_key,active,priority)
VALUES ('provider-shelex-test','Shelex Public SMS Test (diagnostic only)','shelex-test',FALSE,1000)
ON CONFLICT (id) DO UPDATE SET
  name=EXCLUDED.name,
  adapter_key=EXCLUDED.adapter_key,
  active=FALSE,
  priority=1000,
  updated_at=NOW();
INSERT INTO schema_migrations(version) VALUES ('013_shelex_test_provider') ON CONFLICT DO NOTHING;
COMMIT;
