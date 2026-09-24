BEGIN;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS display_name TEXT NOT NULL DEFAULT '';
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS session_id TEXT;
UPDATE public.sessions SET session_id='SES-' || substr(md5(token_hash || created_at::text),1,24) WHERE session_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sessions_session_id ON public.sessions(session_id);
ALTER TABLE public.sessions ALTER COLUMN session_id SET NOT NULL;
CREATE TABLE IF NOT EXISTS public.recovery_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_recovery_codes_user_created ON public.recovery_codes(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recovery_codes_unused ON public.recovery_codes(user_id,used_at) WHERE used_at IS NULL;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
DO $
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE 'REVOKE ALL ON TABLE public.sessions FROM anon'; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE 'REVOKE ALL ON TABLE public.sessions FROM authenticated'; END IF;
END $;
ALTER TABLE public.recovery_codes ENABLE ROW LEVEL SECURITY;
DO $
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE 'REVOKE ALL ON TABLE public.recovery_codes FROM anon'; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE 'REVOKE ALL ON TABLE public.recovery_codes FROM authenticated'; END IF;
END $;
COMMIT;