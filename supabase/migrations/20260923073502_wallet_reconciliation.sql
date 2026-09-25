-- INBOX9 Issue 4: wallet financial integrity and reconciliation
BEGIN;

CREATE TABLE IF NOT EXISTS wallet_reconciliation_runs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('Passed','Mismatch','Failed')),
  wallets_checked INTEGER NOT NULL DEFAULT 0,
  mismatches_found INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS wallet_reconciliation_issues (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES wallet_reconciliation_runs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recorded_balance_paise BIGINT NOT NULL,
  ledger_balance_paise BIGINT NOT NULL,
  difference_paise BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_wallet_reconciliation_runs_started
  ON wallet_reconciliation_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_reconciliation_issues_user_created
  ON wallet_reconciliation_issues(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_reconciliation_issues_open
  ON wallet_reconciliation_issues(created_at DESC)
  WHERE resolved_at IS NULL;

-- Every application wallet mutation is followed by a ledger insert. This trigger
-- makes the wallet aggregate and immutable ledger agree before the transaction can commit.
CREATE OR REPLACE FUNCTION verify_wallet_balance_after_ledger_insert() RETURNS trigger AS $$
DECLARE
  recorded BIGINT;
  calculated BIGINT;
BEGIN
  SELECT balance_paise INTO recorded FROM wallets WHERE user_id = NEW.user_id;
  SELECT COALESCE(SUM(CASE WHEN entry_type='credit' THEN amount_paise ELSE -amount_paise END),0)
    INTO calculated
    FROM wallet_ledger
    WHERE user_id = NEW.user_id;

  IF recorded IS NULL OR recorded <> calculated THEN
    RAISE EXCEPTION 'wallet ledger invariant violated for user %: wallet %, ledger %',
      NEW.user_id, COALESCE(recorded,0), calculated;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS wallet_balance_ledger_invariant ON wallet_ledger;
CREATE CONSTRAINT TRIGGER wallet_balance_ledger_invariant
AFTER INSERT ON wallet_ledger
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION verify_wallet_balance_after_ledger_insert();

INSERT INTO schema_migrations(version) VALUES ('009_wallet_reconciliation') ON CONFLICT DO NOTHING;
COMMIT;
