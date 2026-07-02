# Voltix Crypto Network

Binance-inspired (not a clone) dark crypto dashboard with user and admin experiences, MLM configuration, one-time copy-trade codes, double-entry wallet modeling, and blockchain webhook boundaries.

## Run locally

```bash
npm install
npm run dev
```

- User app: `http://localhost:3000`
- Admin demo: `http://localhost:3000/admin`
- Health: `http://localhost:3000/api/health`

The UI works with bundled demo data. PostgreSQL is only required when enabling persistence.

## Database

```bash
cp .env.example .env
npm run db:generate
npm run db:push
```

## Production boundaries

- Keep only an HD wallet `xpub` in the web application. Seed phrases and private keys belong in an HSM or isolated signer.
- Derive one address per user/network with a transactionally allocated derivation index.
- Verify webhook events independently against a trusted RPC endpoint before creating a deposit.
- Deposit uniqueness is enforced by `(networkId, txHash, eventIndex)`.
- Every value movement posts a balanced ledger journal. Journal idempotency prevents duplicate credits.
- Copy-code redemption uses a serializable transaction and conditional status update to prevent concurrent reuse.
- Trade completion and income credit should run as separate retryable workers. `CopyTrade.status`, due timestamps, and journal idempotency make both jobs restart-safe.
- All admin mutations should require MFA, RBAC, CSRF protection, rate limits, and immutable audit events.

This repository is a product demo and architecture starter, not a licensed exchange or audited custody system. Legal review, security audit, key management, chain-specific reconciliation, sanctions controls, and KYC/AML integrations are required before handling real funds.
