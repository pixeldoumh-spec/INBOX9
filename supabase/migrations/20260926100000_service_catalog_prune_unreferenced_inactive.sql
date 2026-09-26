BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DELETE FROM public.service_provider_routes r
WHERE EXISTS (
  SELECT 1
  FROM public.services s
  WHERE s.id = r.service_id
    AND s.active = FALSE
    AND NOT EXISTS (SELECT 1 FROM public.activations a WHERE a.service_id = s.id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.synthetic_slot_reservations sr
      WHERE sr.service_id = s.id
    )
);

DELETE FROM public.services s
WHERE s.active = FALSE
  AND NOT EXISTS (SELECT 1 FROM public.activations a WHERE a.service_id = s.id)
  AND NOT EXISTS (
    SELECT 1
    FROM public.synthetic_slot_reservations sr
    WHERE sr.service_id = s.id
  );

INSERT INTO schema_migrations(version)
VALUES ('037_service_catalog_prune_unreferenced_inactive')
ON CONFLICT DO NOTHING;

COMMIT;
