-- INBOX9: opt-in Proxnum real inventory and provider routing.
BEGIN;

ALTER TABLE service_provider_routes
  ADD COLUMN IF NOT EXISTS inventory_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fallback_stock INTEGER CHECK (fallback_stock IS NULL OR fallback_stock >= 0);

CREATE TABLE IF NOT EXISTS provider_service_inventory (
  provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  country CHAR(2) NOT NULL DEFAULT 'IN',
  external_service_code TEXT NOT NULL,
  service_id TEXT REFERENCES services(id) ON DELETE SET NULL,
  available INTEGER CHECK (available IS NULL OR available >= 0),
  base_price_usd NUMERIC(12,6) CHECK (base_price_usd IS NULL OR base_price_usd >= 0),
  sell_price_usd NUMERIC(12,6) CHECK (sell_price_usd IS NULL OR sell_price_usd >= 0),
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (provider_id,country,external_service_code)
);

CREATE INDEX IF NOT EXISTS idx_provider_service_inventory_service
  ON provider_service_inventory(provider_id,service_id)
  WHERE active=TRUE;

CREATE INDEX IF NOT EXISTS idx_provider_service_inventory_synced
  ON provider_service_inventory(provider_id,country,synced_at DESC);

ALTER TABLE provider_service_inventory ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.provider_service_inventory FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.provider_service_inventory FROM authenticated';
  END IF;
END $$;
REVOKE ALL ON TABLE public.provider_service_inventory FROM PUBLIC;

INSERT INTO providers (id,name,adapter_key,active,priority)
VALUES ('provider-proxnum','Proxnum India Real Stock','proxnum',FALSE,5)
ON CONFLICT (id) DO UPDATE SET
  name=EXCLUDED.name,
  adapter_key=EXCLUDED.adapter_key,
  priority=EXCLUDED.priority,
  updated_at=NOW();

INSERT INTO schema_migrations(version)
VALUES ('023_proxnum_real_inventory')
ON CONFLICT DO NOTHING;

COMMIT;
