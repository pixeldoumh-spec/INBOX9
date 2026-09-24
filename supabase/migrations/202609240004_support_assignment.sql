-- INBOX9: support ticket assignment
BEGIN;

ALTER TABLE public.support_requests
  ADD COLUMN IF NOT EXISTS assigned_admin_id TEXT REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_support_assigned_admin ON public.support_requests(assigned_admin_id) WHERE assigned_admin_id IS NOT NULL;

INSERT INTO public.schema_migrations(version) VALUES ('202609240004_support_assignment') ON CONFLICT DO NOTHING;
COMMIT;
