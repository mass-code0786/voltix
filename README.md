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

- The landing page and authenticated header share the APK source from `NEXT_PUBLIC_ANDROID_APK_URL`, falling back to the production-served `public/downloads/voltix.apk` route when it is unset.
- USDT BEP20/TRC20 deposits create one standard NOWPayments `/v1/payment` per request and use signed IPN callbacks.
- Deposits require only `NOWPAYMENTS_API_KEY` and `NOWPAYMENTS_IPN_SECRET`. Configure `NOWPAYMENTS_IPN_CALLBACK_URL` as `https://voltix.zenithsoftech.com/api/webhooks/nowpayments`, or configure `NEXT_PUBLIC_APP_URL`/`APP_URL` so it resolves to that URL in production. Bearer authentication and Customer Management credentials are not used for deposits.
- NOWPayments Mass Payouts, payout 2FA, and payout IP whitelisting are not used for deposits; withdrawals are handled separately.
- Spot balances are credited only after a signed final-status IPN includes a blockchain transaction hash and verified paid amount.
- Deposit and withdrawal idempotency is enforced by provider IDs, transaction hashes, client idempotency keys, and ledger journal idempotency.
- Spot withdrawals reserve funds atomically before payout submission. Definitive provider failures post a balanced refund; ambiguous provider responses remain processing for reconciliation rather than risking a duplicate payout.
- AI withdrawal requests do not reserve funds until an admin approves them; rejection leaves the AI balance unchanged.
- Every value movement posts a balanced ledger journal. Journal idempotency prevents duplicate credits.
- Copy-code redemption uses a serializable transaction and conditional status update to prevent concurrent reuse.
- Trade completion and income credit should run as separate retryable workers. `CopyTrade.status`, due timestamps, and journal idempotency make both jobs restart-safe.
- All admin mutations should require MFA, RBAC, CSRF protection, rate limits, and immutable audit events.

This repository is an architecture starter, not a licensed exchange or audited custody system. Legal review, security audit, key management, chain-specific reconciliation, sanctions controls, and KYC/AML integrations are required before handling real funds.
