BEGIN;
CREATE TABLE IF NOT EXISTS public.support_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES public.support_requests(id) ON DELETE CASCADE,
  author_user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  author_role TEXT NOT NULL CHECK (author_role IN ('customer','admin')),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 2 AND 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_created ON public.support_messages(ticket_id, created_at ASC, id ASC);
INSERT INTO public.support_messages (id,ticket_id,author_user_id,author_role,body)
SELECT 'SUPMSG-' || s.id,s.id,s.user_id,'customer',s.message
FROM public.support_requests s
WHERE NOT EXISTS (SELECT 1 FROM public.support_messages m WHERE m.ticket_id=s.id);
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
DO $inbox9$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE 'REVOKE ALL ON TABLE public.support_messages FROM anon'; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE 'REVOKE ALL ON TABLE public.support_messages FROM authenticated'; END IF;
END $inbox9$;
COMMIT;