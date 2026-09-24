export const NAV = [
  ['buy', 'Buy Number', '▣'],
  ['active', 'Active', '◌'],
  ['orders', 'Orders', '▤'],
  ['wallet', 'Wallet', '▱']
];

export const DEFAULT_CATEGORIES = ['Social', 'Productivity', 'Rummy', 'Games', 'Other'];
export const MARKET_PAGE_SIZE = 48;
export const MARKET_MAX_SEARCH_RESULTS = 96;

export function createCustomerState() {
  return {
    page: 'buy',
    search: '',
    category: 'All',
    balancePaise: 0,
    walletLedger: [],
    recharges: [],
    rechargeAmount: 100,
    services: [],
    active: [],
    recentActivations: [],
    activeCancelId: null,
    activeCancelBusy: new Set(),
    orders: [],
    loading: true,
    error: '',
    bootstrapError: '',
    persistentState: false,
    rechargeUpiId: null,
    mobileMenu: false,
    toastTimer: null,
    user: null,
    authMode: 'login',
    adminTab: 'overview',
    adminLoading: false,
    adminError: '',
    admin: { overview: null, recharges: [], users: [], services: [], activations: [], ledger: [], audit: [], providers: [] },
    pendingPurchaseKeys: {},
    purchaseBusy: new Set(),
    securityOpen: false,
    dialogReturnFocus: null,
    expandedServiceId: null,
    marketVisibleCount: MARKET_PAGE_SIZE,
    categoryCounts: {},
    catalogCategories: ['All'],
    serviceSearchIndex: [],
    marketSearchTimer: null,
    marketUrlSyncTimer: null,
    lastCatalogRefreshAt: 0,
    catalogLoading: false,
    catalogError: '',
    customerDataRefreshing: false,
    lastActivationSyncAt: 0,
    activeSyncError: '',
    tickTimer: null,
    purchaseFlow: {
      step: 'service',
      serviceId: null,
      serverId: null,
      submitting: false,
      error: '',
      returnAfterWallet: false
    }
  };
}
