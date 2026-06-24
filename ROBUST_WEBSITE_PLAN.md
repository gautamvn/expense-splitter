# Trip Split Robust Website Plan

Goal: turn Trip Split from a personal utility into a polished, reliable, shareable web app for friend groups, while keeping the product intentionally minimal: no user accounts, no heavy collaboration system, no notes, no attachments, and no bloated travel-planning features.

## Product Direction

- Keep the core promise simple: create a trip, share its URL, add expenses, see who owes whom.
- Use a unique URL per trip instead of accounts.
- Avoid signups, profiles, passwords, and inbox flows.
- Keep trip setup under one minute.
- Make expense entry fast enough to use at the table.
- Treat multi-currency as a first-class feature, not a formatting detail.
- Preserve all current live data during every migration, test, and release.

## Non-Goals

- No user accounts.
- No social features.
- No comments, notes, or receipt attachments.
- No complex roles unless a very small owner/edit link distinction is needed.
- No budgeting, itinerary planning, packing lists, or travel guide content.
- No marketplace/public discovery of trips.
- No manual bookkeeping system beyond trip expenses and settlements.

## Core User Model

- A trip has a default currency.
- A trip has a unique private URL.
- Anyone with the edit URL can update the trip.
- Optional later: a read-only summary URL for sharing final balances.
- Participants are names inside the trip, not user accounts.
- The app should remember "who I usually am" locally on a device, but that is convenience only.

## Minimal Feature Set

### Trip Setup

- Create a trip with:
  - Trip name.
  - Default currency.
  - Participant names.
- Generate a unique edit URL.
- Allow copying the trip link immediately.
- Allow changing participant names and adding participants later.
- Allow changing the trip default currency later without rewriting historical expense currencies.

### Expense Entry

- Add an expense with:
  - Description.
  - Amount.
  - Expense currency.
  - Paid by.
  - Split between selected participants.
  - Expense date.
- Default expense currency to the trip currency, but make changing it easy.
- Default expense date to today.
- Keep equal split as the default.
- Support excluding participants from a split.
- Support edit and delete expense.
- Defer unequal split support until after the core multi-currency model is stable.

### Currency And FX

- Store every expense in its original currency.
- Store the trip default currency separately.
- Convert each expense into the trip default currency for totals, balances, and settlement calculations.
- Use daily FX rates based on the expense date.
- Store the exact FX rate used on the expense once it is created.
- If the trip default currency changes, recalculate display totals from original expense amounts and stored or fetched FX rates. Do not mutate original expense amounts.
- Show original amount and converted amount wherever needed:
  - Ledger row: `€48.00 -> S$69.84`.
  - Expense detail/edit view: original currency, FX date, FX rate, converted value.
  - Totals: always in trip default currency.
- Allow manual FX override only as an advanced escape hatch inside expense edit.
- If FX lookup fails, allow saving with a clear "FX pending" state and retry later, or require a manual rate before saving. Prefer not silently guessing.
- Cache FX rates by date and currency pair.
- Make rounding rules explicit:
  - Store money in minor units where possible.
  - Store FX rates with enough precision, such as 8 decimal places.
  - Round only at display and settlement boundaries.

### Balances And Settlement

- Show each participant's balance in the trip default currency.
- Show suggested settlement payments in the trip default currency.
- Keep settlement tracking simple:
  - Copy settlement summary.
  - Optional later: mark as paid.
- Preserve copy summary and CSV export.
- CSV should include original amount, original currency, converted amount, trip currency, FX date, and FX rate.

### Sharing And Access

- Unique edit URL is the primary access model.
- Use high-entropy trip IDs or tokens, not guessable names.
- Optional read-only URL:
  - Useful for sharing final balances without edit risk.
  - Can be added after the core version.
- No accounts means no "forgot password" and no per-person identity.
- If someone has the edit link, they can edit. Keep this clear.

### Export

- Copy summary for chat apps.
- Download CSV for the ledger.
- Add a clean final summary export later, likely PDF or print-friendly HTML.
- Export should include enough FX detail to audit multi-currency trips.

## Design Principles

- Mobile first, desktop comfortable.
- The first screen after opening a trip should answer:
  - How much did we spend?
  - Who is owed?
  - What should happen next?
- Add expense should be the most obvious action.
- Keep advanced details hidden until needed.
- Currency should be visible enough to prevent mistakes, but not noisy.
- Avoid decorative complexity. This is an operational tool, not a travel magazine.

## Data Model Direction

- Move away from one mutable JSON blob before public use.
- Use a small relational model:
  - trips.
  - trip_tokens.
  - participants.
  - expenses.
  - expense_splits.
  - fx_rates.
  - audit_events.
- Keep Vercel Blob or current JSON backups during migration.
- Never migrate production data without:
  - Fresh backup.
  - Test import.
  - Rollback plan.
  - Read-only verification pass.

## Backend Robustness

- Add server-side validation for all writes.
- Add optimistic concurrency control so two people adding expenses do not overwrite each other.
- Use append/update APIs instead of overwriting one whole shared JSON blob.
- Keep hourly backups until the database backup story is proven.
- Add restore tooling before inviting broader use.
- Log write failures, validation failures, FX lookup failures, and backup failures.
- Add uptime checks for the public site and API.

## Security And Privacy

- Generate private trip URLs with unguessable tokens.
- Do not expose trip data in logs, analytics, or error traces.
- Rate-limit trip creation and write endpoints.
- Keep edit tokens hashed server-side if stored.
- Add a short privacy policy before public sharing.
- Add data deletion instructions.
- Prevent search indexing of trip pages.
- Keep local env files, backups, and deployment output out of public deploy bundles.

## Testing

- Unit tests:
  - Equal split math.
  - Multi-currency balance math.
  - Settlement calculation.
  - FX rate lookup/cache behavior.
  - Trip default currency change behavior.
  - CSV export fields and rounding.
- API tests:
  - Create trip.
  - Open trip by token.
  - Add/edit/delete expense.
  - Add participant.
  - Change trip default currency.
  - Concurrent writes.
  - Invalid payload rejection.
- End-to-end tests:
  - Create trip, share link, add expenses.
  - Add mixed-currency expenses and verify balances.
  - Change trip default currency and verify original expense currencies remain unchanged.
  - Export CSV.
  - Use on mobile viewport.
- Regression tests:
  - Current live JSON import.
  - Backup creation.
  - No accidental clearing of live trip data.

## Deployment And Operations

- Put the app in a clean Git repository or sub-repository.
- Add `.vercelignore` to exclude backups, `.env*`, node_modules, temp files, and local deployment output.
- Create staging and production environments.
- Test against anonymized staging data.
- Use a verified Vercel deploy identity.
- Production release checklist:
  - Fresh backup.
  - Tests pass.
  - Staging smoke test.
  - Production deploy.
  - Public URL smoke test.
  - Backup job still working.

## Suggested Build Phases

### Phase 0: Stabilize What Exists

- Add tests around current balance and settlement logic.
- Add `.vercelignore`.
- Document backup, deploy, and rollback steps.
- Create a staging deploy.
- Keep current live data untouched.

### Phase 1: Minimal Product Redesign

- Redesign trip opening, trip dashboard, add expense, ledger, balances, and settings.
- Keep existing data model if needed, but avoid expanding it too much before the backend shift.
- Add edit expense.
- Improve CSV export.
- Add clearer mobile layout.

### Phase 2: Proper Multi-Currency

- Add original expense currency and amount.
- Add trip default currency.
- Add daily FX lookup/cache.
- Add converted values for calculations.
- Add currency-aware ledger and CSV export.
- Add tests for trip currency changes.

### Phase 3: Real Persistence

- Move from JSON blob writes to database-backed APIs.
- Import copied live data into staging.
- Migrate production only after verification.
- Keep current Blob JSON as a backup/fallback during transition.

### Phase 4: Public-Ready Hardening

- Add high-entropy trip URLs.
- Add optional read-only links.
- Add rate limits.
- Add monitoring and alerts.
- Add privacy policy and deletion instructions.
- Run mobile and browser testing.

## Open Decisions

- Read-only links: later.
- Unequal splits: after the core multi-currency model is stable.
- FX source: Frankfurter (`api.frankfurter.dev`) for no-key daily and historical rates. Fallback is an explicit `FX pending` state with retry; do not guess rates.
- FX rates: not user-editable.
- Settlement payments: suggested and copied only, not tracked as paid.
- Old trips: left at their URLs for now.
