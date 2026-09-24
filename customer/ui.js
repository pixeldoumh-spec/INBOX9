const CATEGORY_ICONS = {
  Social: '◉',
  Productivity: '✦',
  Rummy: '◆',
  Games: '♟'
};

export function normalizeSearchText(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[c]));
}

export function money(paise) {
  return `₹${(Number(paise || 0) / 100).toFixed(2)}`;
}

export function iconFor(category) {
  return CATEGORY_ICONS[category] || '•';
}

export function isLiveActivation(item) {
  return ['Active', 'CancellationPending', 'ExpirationPending'].includes(String(item?.status || ''));
}
