-- INBOX9: customer support requests
BEGIN;

CREATE TABLE IF NOT EXISTS public.support_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('activation','recharge','wallet','account','other')),
  subject TEXT NOT NULL CHECK (char_length(subject) BETWEEN 4 AND 120),
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 10 AND 2000),
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','In Progress','Resolved','Closed')),
  activation_id TEXT REFERENCES public.activations(id) ON DELETE SET NULL,
  recharge_id TEXT REFERENCES public.recharge_requests(id) ON DELETE SET NULL,
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_support_user_created ON public.support_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_status_created ON public.support_requests(status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_support_activation ON public.support_requests(activation_id) WHERE activation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_support_recharge ON public.support_requests(recharge_id) WHERE recharge_id IS NOT NULL;

ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.support_requests FROM anon, authenticated;

INSERT INTO public.schema_migrations(version) VALUES ('202609240003_support_requests') ON CONFLICT DO NOTHING;
COMMIT;
