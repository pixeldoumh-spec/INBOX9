BEGIN;

UPDATE public.service_provider_routes AS r
SET active = FALSE
FROM public.services AS s
WHERE s.id = r.service_id
  AND s.active = FALSE
  AND r.active = TRUE;

INSERT INTO schema_migrations(version)
VALUES ('035_deactivate_routes_for_removed_catalog_services')
ON CONFLICT DO NOTHING;

COMMIT;
