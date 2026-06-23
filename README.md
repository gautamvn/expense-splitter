# Trip Split

Trip Split is a small shared trip expense web app. The current implementation is intentionally simple and uses a private trip password/link model with Vercel Blob-backed JSON state.

This repository also contains product and design specs for evolving it into a minimal, robust, no-account shared trip expense app with proper multi-currency support.

## Current App

- Static frontend in `public/`.
- Vercel serverless state API in `api/state.js`.
- Hourly JSON backup script in `scripts/backup-json.mjs`.
- Vercel routing in `vercel.json`.

## Safety Notes

- Do not commit `.env*`, `.vercel/`, `backups/`, `node_modules/`, or live trip JSON.
- Treat production trip data as live user data.
- Before any migration or production data operation, take a fresh timestamped backup.

## Documents

- `ROBUST_WEBSITE_PLAN.md` - product scope, multi-currency/FX requirements, robustness plan, phases, and open decisions.
- `END_TO_END_DESIGN.md` - target UX, screen flows, wireframes, data rules, API sketch, and acceptance criteria.

## Current Product Direction

- Unique private URL per trip.
- No user accounts.
- Minimal friend-group workflow.
- Multi-currency expense entry with daily FX conversion into the trip default currency.
- Original expense currencies and amounts are preserved forever.
- No notes, attachments, or receipt uploads.
