BEGIN;
CREATE TABLE IF NOT EXISTS support_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES support_requests(id) ON DELETE CASCADE,
  author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_role TEXT NOT NULL CHECK (author_role IN ('customer','admin')),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 2 AND 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_created ON support_messages(ticket_id, created_at ASC, id ASC);
INSERT INTO support_messages (id,ticket_id,author_user_id,author_role,body)
SELECT 'SUPMSG-' || s.id,s.id,s.user_id,'customer',s.message
FROM support_requests s
WHERE NOT EXISTS (SELECT 1 FROM support_messages m WHERE m.ticket_id=s.id);
INSERT INTO schema_migrations(version) VALUES ('025_support_threads') ON CONFLICT DO NOTHING;
COMMIT;