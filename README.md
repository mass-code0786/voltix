# Voltix Crypto Network

Binance-inspired (not a clone) dark crypto dashboard with user and admin experiences, MLM configuration, VIP-based copy trading, double-entry wallet modeling, and NOWPayments deposit boundaries.

## Run locally

```bash
npm install
npm run dev
```

- User app: `http://localhost:3000`
- Admin console: `http://localhost:3000/admin`
- Health: `http://localhost:3000/api/health`

The public market UI has catalog fallbacks. PostgreSQL is required for authenticated account, wallet, and admin records.

## Database

```bash
cp .env.example .env
npm run db:generate
npm run db:push
```

## Production boundaries

- Deposits use NOWPayments payment/IPN flow only.
- Configure `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`, and either `NOWPAYMENTS_IPN_CALLBACK_URL` or `NEXT_PUBLIC_APP_URL`.
- Credit Spot wallet balances only after a verified NOWPayments IPN marks the payment confirmed or finished.
- Deposit idempotency is enforced by unique NOWPayments provider payment IDs and ledger journal idempotency.
- Every value movement posts a balanced ledger journal. Journal idempotency prevents duplicate credits.
- Copy-code redemption uses a serializable transaction and conditional status update to prevent concurrent reuse.
- Trade completion and income credit should run as separate retryable workers. `CopyTrade.status`, due timestamps, and journal idempotency make both jobs restart-safe.
- All admin mutations should require MFA, RBAC, CSRF protection, rate limits, and immutable audit events.

This repository is an architecture starter, not a licensed exchange or audited custody system. Legal review, security audit, key management, chain-specific reconciliation, sanctions controls, and KYC/AML integrations are required before handling real funds.
