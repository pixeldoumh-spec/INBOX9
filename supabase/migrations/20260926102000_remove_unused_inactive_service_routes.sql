BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Provider routes are operational configuration, not customer history.
-- Remove dead inactive routes for services that are already inactive.
DELETE FROM public.service_provider_routes r
WHERE r.active = FALSE
  AND EXISTS (
    SELECT 1
    FROM public.services s
    WHERE s.id = r.service_id
      AND s.active = FALSE
  );

INSERT INTO schema_migrations(version)
VALUES ('040_remove_unused_inactive_service_routes')
ON CONFLICT DO NOTHING;

COMMIT;
