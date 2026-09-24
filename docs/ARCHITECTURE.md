# INBOX9 Architecture

```text
Frontend
   ↓ authenticated HTTP
deployment platform API
   ├── Auth / sessions
   ├── Wallet / ledger
   ├── Recharge verification
   ├── Activation service
   └── Provider router
          ↓
     Provider adapter
          ↓
     Authorized provider

PostgreSQL
   ├── users / sessions
   ├── services
   ├── wallets / wallet_ledger
   ├── recharge_requests
   ├── providers / service_provider_routes
   └── activations
```

Money is server-authoritative. Provider credentials never reach the browser. The browser displays activation state obtained from the API rather than generating OTPs locally.
