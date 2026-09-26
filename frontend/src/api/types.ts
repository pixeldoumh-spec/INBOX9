export type Service = {
  id: string;
  name: string;
  category: string;
  country: string;
  currency: string;
  pricePaise: number;
  availability?: string;
  catalogPosition?: number;
  stock?: number;
  purchasable: boolean;
};

export type ServiceCatalogResponse = {
  country: string;
  currency: string;
  services: Service[];
};

export type User = {
  id: string;
  email: string;
  role?: string;
  displayName?: string | null;
};

export type MeResponse = {
  authenticated: boolean;
  user?: User;
};

export type Recharge = {
  id: string; amountPaise: number; utr: string; paymentMethod: string; upiId: string | null; status: string;
  rejectionReason?: string | null; submittedAt: number; customerPaidAt?: number | null; reviewedAt?: number | null; flaggedAt?: number | null;
  flagReason?: string | null; verifiedAmountPaise?: number | null; verifiedUtr?: string | null; externalReference?: string | null;
};

export type Session = { id: string; current: boolean; createdAt: number; lastUsedAt: number | null; expiresAt: number; };

export type SupportMessage = { id: string; authorRole: string; authorUserId?: string | null; body: string; createdAt: number; };

export type SupportTicket = {
  id: string; category: string; subject: string; message: string; status: string; activationId?: string | null; rechargeId?: string | null;
  activation?: { id: string; status?: string | null; number?: string | null; service?: string | null } | null;
  recharge?: { id: string; status?: string | null; amountPaise?: number | null } | null;
  createdAt: number; updatedAt: number; resolvedAt?: number | null; adminNote?: string | null; messages: SupportMessage[];
};

export type PaymentSettings = {
  id?: string; enabled?: boolean | null; upiId: string | null; merchantName: string; instructions: string; qrImage: string | null; updatedAt?: number | null;
};
export type AdminRecharge = Recharge & {
  userId?: string; email?: string; reviewedBy?: string | null; flaggedBy?: string | null; accountCreatedAt?: number | null; submissionSessionId?: string | null;
  submissionSession?: { id: string; createdAt?: number | null; lastUsedAt?: number | null; expiresAt?: number | null; revokedAt?: number | null; active?: boolean } | null;
  sessionContext?: { activeCount?: number; currentId?: string | null; currentCreatedAt?: number | null; currentLastUsedAt?: number | null; currentMatchesSubmission?: boolean };
  recentPayments?: Array<{ id: string; amountPaise: number; utr: string; status: string; submittedAt?: number | null; reviewedAt?: number | null }>;
};
export type AdminPaymentReconciliation = {
  manualEvents: Array<{ id: string; eventType: string; rechargeId: string; customerEmail: string; actorEmail?: string | null; amountPaise: number; utr?: string | null; externalReference?: string | null; rechargeStatus: string; notes?: string | null; createdAt: number }>;
  summary: { byStatus: Array<{ status: string; count: number; amountPaise: number; flaggedCount: number }>; totals: { count: number; amountPaise: number; flaggedCount: number } };
  flagged: AdminRecharge[];
  webhookEvents: Array<{ provider: string; eventId: string; eventType: string; rechargeId: string; amountPaise: number; currency: string; observedUtr?: string | null; externalReference?: string | null; status: string; outcome?: string | null; errorCode?: string | null; errorMessage?: string | null; receivedAt: number; processedAt?: number | null }>;
  paymentSettings: PaymentSettings; sessionSignals?: AdminRecharge[]; generatedAt: number;
};
export type Wallet = {
  balancePaise: number;
  currency?: string;
  country?: string;
  persistent: boolean;
  rechargeEnabled?: boolean;
  upiId?: string | null;
  ledger?: Array<{
    id: string;
    type?: string;
    amountPaise?: number;
    referenceType?: string | null;
    referenceId?: string | null;
    description?: string | null;
    createdAt?: number;
  }>;
  recharges?: Recharge[];
  paymentSettings?: PaymentSettings;
  summary?: { creditPaise: number; debitPaise: number; creditCount: number; debitCount: number; pendingPaise: number; pendingCount: number };
};

export type Notification = {
  id: string;
  kind?: string;
  sourceType?: string;
  sourceId?: string;
  eventKey?: string;
  title: string;
  body: string;
  page?: string | null;
  tone?: string;
  read?: boolean;
  createdAt: number;
};

export type Activation = {
  id: string;
  serviceId: string;
  service?: string;
  country: string;
  number?: string | null;
  pricePaise: number;
  currency: string;
  status: string;
  canCancel?: boolean;
  pending?: boolean;
  otp?: string | null;
  createdAt?: number;
  expiresAt?: number;
  refundPaise?: number;
};

export type ActivationsResponse = {
  activations: Activation[];
  persistent: boolean;
};

export type ApiErrorPayload = {
  error: string;
  code?: string;
};
