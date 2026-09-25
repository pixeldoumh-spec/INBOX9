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
    description?: string;
    amountPaise?: number;
    createdAt?: number;
  }>;
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
