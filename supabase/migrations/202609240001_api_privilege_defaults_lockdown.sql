-- INBOX9: prevent public Supabase API roles from inheriting table/sequence/function privileges.
BEGIN;

REVOKE ALL PRIVILEGES ON TABLE public.rate_limit_buckets FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;

INSERT INTO schema_migrations(version)
VALUES ('021_api_privilege_defaults_lockdown')
ON CONFLICT DO NOTHING;

COMMIT;
