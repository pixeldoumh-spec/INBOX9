-- INBOX9: reduce synthetic inventory to 100 numbers per service.
BEGIN;

-- Historical released reservations may reference the old 5,000-slot pool.
-- New synthetic allocation is constrained by the application constant (100).
-- Active synthetic reservations are preserved, and stock is recalculated from
-- current reserved slots so service availability stays consistent.
UPDATE services s
SET stock = GREATEST(
  0,
  100 - COALESCE((
    SELECT COUNT(*)
    FROM synthetic_slot_reservations r
    WHERE r.service_id = s.id
      AND r.status = 'Reserved'
  ), 0)
),
updated_at = NOW()
WHERE s.active = TRUE;

INSERT INTO schema_migrations(version)
VALUES ('031_reduce_synthetic_inventory_to_100')
ON CONFLICT DO NOTHING;

COMMIT;
