const ONGOING_STATUSES = new Set(['Active', 'CancellationPending', 'ExpirationPending']);
const TERMINAL_STATUSES = new Set(['Completed', 'Expired', 'Refunded', 'Cancelled']);

export function activationStateIsOngoing(status) {
  return ONGOING_STATUSES.has(String(status || ''));
}

export function activationStateIsTerminal(status) {
  return TERMINAL_STATUSES.has(String(status || ''));
}
