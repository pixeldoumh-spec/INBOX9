-- INBOX9 mirror: link manual UTR deposits to the authenticated session that submitted them.
-- The session ID is an audit snapshot, not a foreign key, because old sessions may be revoked/deleted later.
BEGIN;

ALTER TABLE public.recharge_requests
  ADD COLUMN IF NOT EXISTS submission_session_id TEXT;

CREATE INDEX IF NOT EXISTS idx_recharge_submission_session
  ON public.recharge_requests(submission_session_id);

COMMIT;
