BEGIN;
CREATE TABLE IF NOT EXISTS public.notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  page TEXT,
  tone TEXT NOT NULL DEFAULT 'info',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id,source_type,source_id,event_key)
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id,read_at,created_at DESC);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
COMMIT;