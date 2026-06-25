# Trip Split Roadmap And Hardening Plan

Trip Split is now a production private-link expense splitter backed by Postgres. This document tracks what has been completed and what should come next before broader public use.

## Current Production Status

- Production URL: https://trip-split-delta-five.vercel.app
- Hosting: Vercel.
- Database: Neon Postgres through Vercel Marketplace.
- Access model: high-entropy private trip URL.
- Accounts: none.
- Password trips: deprecated.
- Current active trip: migrated from Vercel Blob to Postgres.

## Completed

### Product Flow

- Create trips with private unguessable URLs.
- Open trips only by private link.
- Add, edit, and delete expenses.
- Keep settings on a separate view.
- Preserve user-entered name casing.
- Paginate ledger at 10 expenses per page.
- Copy settlements and export CSV.

### Multi-Currency

- Store original expense amount and currency.
- Store trip default currency separately.
- Fetch daily FX rates through Frankfurter.
- Cache FX rates in Postgres.
- Store the exact FX rate used on each expense.
- Show converted amounts only when expense currency differs from trip currency.
- Exclude awaiting-FX expenses from totals until rates are available.
- Keep FX rates system-managed and not user-editable.

### Persistence

- Replaced whole-trip Blob JSON state with normalized Postgres tables.
- Added optimistic version checks for stale browser tabs.
- Added server-side validation and sanitization.
- Migrated the active trip into Postgres.
- Kept the legacy Blob import script for audit/rollback use.

### UI

- Added a documented design system.
- Reworked the public gate and app dashboard.
- Added structured panels, metric cards, status chips, fields, and data rows.
- Hid zero-value awaiting-FX noise.
- Improved mobile and desktop layout.

## Remaining Risks

- Anyone with the private trip link can edit the trip.
- Existing legacy Blob copies may still exist as rollback data until manually removed.
- There is no read-only sharing mode yet.
- There is no rate limiting on trip creation or writes.
- There is no formal privacy policy or deletion request flow.
- There is no restore UI or admin recovery process.

## Near-Term Cleanup

1. Delete old Vercel Blob trip/backups once Postgres stability is accepted.
2. Add a small production data backup/export command for Postgres.
3. Add rate limiting for create/write endpoints.
4. Add a minimal privacy policy and deletion instructions.
5. Add uptime checks for the public app and `/api/state`.

## Deferred Product Features

- Read-only trip links.
- Unequal splits.
- Archive/delete trip flow.
- Mark settlements as paid.
- Print/PDF final summary.
- Receipt uploads.
- Notes/comments.
- User accounts or invite-only access.

## Release Checklist

Before production changes:

1. Pull latest `main`.
2. Run unit tests.
3. Run DB-backed tests when schema or persistence changes.
4. Verify active trip loads from Postgres.
5. Verify FX lookup/cache behavior.
6. Deploy through Vercel.
7. Smoke-test public production URL.

## Operating Principles

- Preserve live trip data before every migration.
- Prefer boring infrastructure and simple data models.
- Keep the user workflow account-free unless privacy requirements clearly outgrow private-link access.
- Do not add travel-planning features; stay focused on expense splitting.
- Treat public docs as product documentation, not scratch planning notes.
