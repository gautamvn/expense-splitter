# Trip Split

Trip Split is a private-link expense splitter for friend trips. Create a trip, share the URL, add expenses in multiple currencies, and see balances plus suggested settlement payments.

Production: https://trip-split-delta-five.vercel.app

## What It Does

- Creates high-entropy private trip URLs; there are no accounts or passwords.
- Lets anyone with the trip link add, edit, and delete expenses.
- Stores expenses with original amount, original currency, date, payer, and split participants.
- Converts foreign-currency expenses into the trip currency using daily Frankfurter rates.
- Stores the exact FX rate used for each expense.
- Keeps expenses awaiting rates out of totals until FX lookup succeeds.
- Shows balances and suggested settlement payments in the trip currency.
- Exports the ledger as CSV with original amount, converted amount, currency, FX date, and FX rate.

## Current Architecture

- Static frontend in `public/`.
- Vercel serverless APIs in `api/`.
- Postgres persistence through Neon, connected via Vercel Marketplace.
- Schema and persistence helpers in `api/db.js`.
- FX lookup and cache API in `api/fx.js`.
- Shared balance, settlement, and currency math in `public/trip-math.js`.
- One-time legacy Blob import script in `scripts/migrate-blob-to-postgres.mjs`.

## Data Model

Production data is stored in normalized Postgres tables:

- `trips`
- `participants`
- `expenses`
- `expense_splits`
- `fx_rates`

The active trip was migrated from Vercel Blob into Postgres on June 24, 2026. The app no longer reads or writes trip state through Blob.

## Local Development

Install dependencies:

```sh
npm install
```

Run unit tests:

```sh
npm test
```

Run DB-backed integration tests with a local or Vercel-pulled `DATABASE_URL`:

```sh
set -a; . ./.env.local; set +a; npm test
```

Run a static local UI smoke test without Vercel APIs:

```sh
npm run dev:local
```

Open:

```text
http://localhost:4173/?local=1
```

That local mode uses `localStorage` and skips the remote APIs.

## Deployment

The app is deployed on Vercel. Required production environment variables:

- `DATABASE_URL`
- `BLOB_READ_WRITE_TOKEN` only for legacy import/cleanup tooling

Production release checklist:

1. Run tests.
2. Verify the active trip loads against Postgres.
3. Verify `/api/fx` returns either a cached or fresh Frankfurter rate.
4. Deploy through Vercel/GitHub.
5. Smoke-test the public production URL.

## Safety Notes

- Do not commit `.env*`, `.vercel/`, `backups/`, `node_modules/`, database dumps, or live trip JSON.
- Treat production trip data as live user data.
- The private URL is the access key. Anyone with the trip link can edit the trip.
- Trip pages and APIs set `noindex`; trips are not meant to be discoverable.
- The remaining legacy Blob copy should be removed once rollback through Blob is no longer needed.

## Product Direction

- Keep the workflow account-free and friend-group focused.
- Keep settlement payments suggested/copyable, not tracked as paid.
- Keep FX rates system-managed, not user-editable.
- Defer read-only links, unequal splits, archive flows, notes, attachments, and receipt uploads until the core shared-trip workflow needs them.

## Docs

- `DESIGN_SYSTEM.md` - product UI rules, tokens, and reusable component guidance.
- `END_TO_END_DESIGN.md` - current product behavior and screen flow.
- `ROBUST_WEBSITE_PLAN.md` - completed hardening work plus remaining roadmap.
