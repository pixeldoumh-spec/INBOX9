-- INBOX9: remove public execution of the fresh-project Supabase RLS helper.
BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
  END IF;
END
$$;

INSERT INTO schema_migrations(version)
VALUES ('019_supabase_rls_helper_lockdown')
ON CONFLICT DO NOTHING;

COMMIT;
