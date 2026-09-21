-- INBOX9 Issue 7: durable activation expiration reconciliation
BEGIN;

ALTER TABLE activations DROP CONSTRAINT IF EXISTS activations_status_check;
ALTER TABLE activations ADD CONSTRAINT activations_status_check
  CHECK (status IN ('Active','CancellationPending','ExpirationPending','Completed','Expired','Refunded','Cancelled'));

ALTER TABLE provider_operations DROP CONSTRAINT IF EXISTS provider_operations_operation_type_check;
ALTER TABLE provider_operations ADD CONSTRAINT provider_operations_operation_type_check
  CHECK (operation_type IN ('cancel','status_sync'));

CREATE INDEX IF NOT EXISTS idx_activations_expiration_reconcile
  ON activations(expires_at, updated_at)
  WHERE status IN ('Active','ExpirationPending');

CREATE INDEX IF NOT EXISTS idx_provider_operations_status_sync_pending
  ON provider_operations(updated_at, activation_id)
  WHERE operation_type='status_sync' AND status='Pending';

INSERT INTO schema_migrations(version) VALUES ('011_activation_expiration_reconciliation') ON CONFLICT DO NOTHING;
COMMIT;
