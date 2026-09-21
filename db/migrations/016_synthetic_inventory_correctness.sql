-- INBOX9: durable synthetic inventory reservations.
BEGIN;

CREATE TABLE IF NOT EXISTS synthetic_slot_reservations (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  slot_index INTEGER NOT NULL CHECK (slot_index >= 1 AND slot_index <= 5000),
  server_id TEXT NOT NULL,
  activation_id TEXT NOT NULL REFERENCES activations(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('Reserved','Released')) DEFAULT 'Reserved',
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_synthetic_reserved_slot
  ON synthetic_slot_reservations(service_id, slot_index)
  WHERE status='Reserved';

CREATE UNIQUE INDEX IF NOT EXISTS uq_synthetic_reserved_activation
  ON synthetic_slot_reservations(activation_id)
  WHERE status='Reserved';

CREATE INDEX IF NOT EXISTS idx_synthetic_slot_service_server
  ON synthetic_slot_reservations(service_id, server_id)
  WHERE status='Reserved';

CREATE INDEX IF NOT EXISTS idx_synthetic_slot_activation
  ON synthetic_slot_reservations(activation_id);

-- Backfill existing active synthetic activations when slot metadata exists.
-- The insert intentionally fails on conflicting live allocations rather than
-- silently choosing an arbitrary slot, because that would hide an inventory
-- correctness violation that must be reconciled before deployment.
INSERT INTO synthetic_slot_reservations
  (id,service_id,slot_index,server_id,activation_id,status,reserved_at)
SELECT
  'SLOT-' || a.id,
  a.service_id,
  (a.provider_metadata->>'slot')::integer,
  COALESCE(a.provider_metadata->>'serverId','server-' ||
    (
      CASE
        WHEN (a.provider_metadata->>'slot')::integer <= 455 THEN
          CEIL((a.provider_metadata->>'slot')::numeric / 455.0)
        ELSE
          7 + FLOOR((((a.provider_metadata->>'slot')::integer - 2731)::numeric) / 454.0)
      END
    )::integer
  ),
  a.id,
  'Reserved',
  a.created_at
FROM activations a
WHERE a.status='Active'
  AND a.provider_metadata ? 'slot'
  AND (a.provider_metadata->>'slot') ~ '^[0-9]+$'
  AND (a.provider_metadata->>'slot')::integer BETWEEN 1 AND 5000
ON CONFLICT (activation_id) DO NOTHING;

INSERT INTO schema_migrations(version)
VALUES ('016_synthetic_inventory_correctness')
ON CONFLICT DO NOTHING;

COMMIT;
