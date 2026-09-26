-- Phase 5: persistent provider route health and auditable route attempts.
BEGIN;

CREATE TABLE IF NOT EXISTS provider_route_health (
  provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  opened_until TIMESTAMPTZ,
  last_error_code TEXT,
  last_error_message TEXT,
  last_failure_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (provider_id, service_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_route_health_opened_until
  ON provider_route_health(opened_until, provider_id, service_id);

CREATE TABLE IF NOT EXISTS provider_route_attempts (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  operation_type TEXT NOT NULL CHECK (operation_type IN ('reserveNumber')),
  outcome TEXT NOT NULL CHECK (outcome IN ('succeeded','failed','failed_closed_circuit')),
  safe_to_failover BOOLEAN NOT NULL DEFAULT FALSE,
  error_code TEXT,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_route_attempts_service_created
  ON provider_route_attempts(service_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_provider_route_attempts_provider_created
  ON provider_route_attempts(provider_id, created_at DESC);

ALTER TABLE provider_route_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_route_attempts ENABLE ROW LEVEL SECURITY;

INSERT INTO schema_migrations(version)
VALUES ('042_provider_route_health_and_attempts')
ON CONFLICT DO NOTHING;

COMMIT;
