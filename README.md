# Trip Split

Trip Split is a small shared trip expense web app. The current implementation uses private high-entropy trip links with Postgres-backed state.

This repository also contains product and design specs for evolving it into a minimal, robust, no-account shared trip expense app with proper multi-currency support.

## Current App

- Static frontend in `public/`.
- Vercel serverless state API in `api/state.js`.
- Postgres persistence helpers and schema bootstrapping in `api/db.js`.
- Vercel serverless FX API in `api/fx.js`.
- One-time Blob-to-Postgres import script in `scripts/migrate-blob-to-postgres.mjs`.
- Vercel routing in `vercel.json`.
- Currency-aware math in `public/trip-math.js`.

## Implemented Robustness

- Trips receive random private URLs instead of human-chosen identifiers.
- Password-based trip lookup is deprecated; trips open only through private links.
- Expenses store original amount, original currency, date, payer, split participants, and the exact FX rate used.
- FX rates are fetched through Frankfurter (`api.frankfurter.dev`) and cached in Vercel Blob by date and currency pair.
- If FX lookup fails, the expense is marked as awaiting FX rates and excluded from balances until retry succeeds.
- FX rates are not user-editable.
- Trip default currency changes recalculate displayed totals from original amounts without rewriting them.
- Server writes validate and sanitize payloads.
- State writes use a version check to catch stale browser tabs before overwriting newer data.
- Trip state is stored in normalized Postgres tables: trips, participants, expenses, expense splits, and FX rates.
- CSV export includes original amount/currency, converted amount, trip currency, FX date, and FX rate.
- Settlement payments are suggested and copyable, not tracked as paid.

## Safety Notes

- Do not commit `.env*`, `.vercel/`, `backups/`, `node_modules/`, database dumps, or live trip JSON.
- Treat production trip data as live user data.
- Before any migration or production data operation, take a fresh timestamped backup.
- The current production trip was originally stored in Vercel Blob. Use the migration script once after `DATABASE_URL` is connected.

## Local Development

Run tests:

```sh
npm test
```

Run DB-backed integration tests after connecting Neon/Postgres:

```sh
DATABASE_URL="postgres://..." npm test
```

Import the current active Blob trip into Postgres:

```sh
npm run db:migrate:blob
```

Run a quick static UI smoke test without Vercel APIs:

```sh
npm run dev:local
```

Open `http://localhost:4173/?local=1`. This uses localStorage and skips the remote API.

## Documents

- `ROBUST_WEBSITE_PLAN.md` - product scope, multi-currency/FX requirements, robustness plan, phases, and open decisions.
- `END_TO_END_DESIGN.md` - target UX, screen flows, wireframes, data rules, API sketch, and acceptance criteria.
- `DESIGN_SYSTEM.md` - visual principles, tokens, components, and layout rules for the public UI.

## Current Product Direction

- Unique private URL per trip.
- No user accounts.
- Minimal friend-group workflow.
- Multi-currency expense entry with daily FX conversion into the trip default currency.
- Original expense currencies and amounts are preserved forever.
- Unequal splits, read-only links, settlement tracking, and archiving are intentionally deferred.
- No notes, attachments, or receipt uploads.
