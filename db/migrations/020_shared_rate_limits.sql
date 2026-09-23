CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  bucket_key TEXT PRIMARY KEY,
  bucket_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL CHECK (count > 0),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS rate_limit_buckets_expires_idx
  ON public.rate_limit_buckets (expires_at);

ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;
