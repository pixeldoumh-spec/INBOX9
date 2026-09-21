-- INBOX9: durable synthetic inventory reservations.
BEGIN;

CREATE TABLE IF NOT EXISTS synthetic_slot_reservations (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  slot_index INTEGER NOT NULL CHECK (slot_index >= 1 AND slot_index <= 5000),
  server_id TEXT NOT NULL CHECK (server_id ~ '^server-(?:[1-9]|1[01])$'),
  activation_id TEXT NOT NULL UNIQUE REFERENCES activations(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('Reserved','Released')) DEFAULT 'Reserved',
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_synthetic_reserved_slot
  ON synthetic_slot_reservations(service_id, slot_index)
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
  COALESCE(
    a.provider_metadata->>'serverId',
    CASE
      WHEN (a.provider_metadata->>'slot')::integer BETWEEN 1 AND 455 THEN 'server-1'
      WHEN (a.provider_metadata->>'slot')::integer BETWEEN 456 AND 910 THEN 'server-2'
      WHEN (a.provider_metadata->>'slot')::integer BETWEEN 911 AND 1365 THEN 'server-3'
      WHEN (a.provider_metadata->>'slot')::integer BETWEEN 1366 AND 1820 THEN 'server-4'
      WHEN (a.provider_metadata->>'slot')::integer BETWEEN 1821 AND 2275 THEN 'server-5'
      WHEN (a.provider_metadata->>'slot')::integer BETWEEN 2276 AND 2730 THEN 'server-6'
      WHEN (a.provider_metadata->>'slot')::integer BETWEEN 2731 AND 3184 THEN 'server-7'
      WHEN (a.provider_metadata->>'slot')::integer BETWEEN 3185 AND 3638 THEN 'server-8'
      WHEN (a.provider_metadata->>'slot')::integer BETWEEN 3639 AND 4092 THEN 'server-9'
      WHEN (a.provider_metadata->>'slot')::integer BETWEEN 4093 AND 4546 THEN 'server-10'
      WHEN (a.provider_metadata->>'slot')::integer BETWEEN 4547 AND 5000 THEN 'server-11'
    END
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
