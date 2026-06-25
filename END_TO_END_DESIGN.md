# Trip Split Product Design

This document describes the current product behavior and the intended near-term shape of Trip Split.

## Product Shape

Trip Split is a private-link web app for friend groups on trips. One person creates a trip, shares the URL, everyone adds expenses, and the app shows balances plus suggested settlement payments in the trip's default currency.

The product should be simple enough to open from a chat app and use without explanation.

## Core Constraints

- No user accounts.
- No passwords.
- One high-entropy private URL per trip.
- Anyone with the edit URL can edit the trip.
- Participants are trip-local names, not user identities.
- No notes, comments, attachments, or receipt uploads.
- Multi-currency expenses are supported.
- Original expense amounts and currencies are preserved.

## Primary Objects

### Trip

- `id`: private URL token.
- `name`: display name.
- `currency`: default trip currency.
- `version`: optimistic concurrency version.
- `createdAt`.
- `updatedAt`.

### Participant

- `id`: stable trip-local ID.
- `tripId`.
- `name`: displayed exactly as entered.
- `position`: display order.
- `createdAt`.
- `updatedAt`.

### Expense

- `id`.
- `tripId`.
- `description`.
- `amountMinor`: original amount in minor units.
- `currency`: original expense currency.
- `payerId`.
- `date`: date used for FX.
- `fx`: stored conversion details, or `null` while awaiting rates.
- `createdAt`.
- `updatedAt`.

### Expense Split

- `tripId`.
- `expenseId`.
- `participantId`.
- `position`.

Equal split is the only supported split mode today. The split table keeps the model ready for unequal splits later.

### FX Rate

- `requestedDate`.
- `fromCurrency`.
- `toCurrency`.
- `rate`.
- `providerDate`.
- `source`.

Rates are cached by date and currency pair.

## Currency Rules

- Every expense keeps its original currency forever.
- Dashboard totals, balances, and settlement suggestions use the trip currency.
- Same-currency ledger rows show one amount.
- Foreign-currency ledger rows show original amount and converted amount.
- FX uses the expense date, not today's date unless the expense date is today.
- If FX lookup fails, the expense is saved as awaiting FX rates and excluded from totals until retry succeeds.
- FX rates are not user-editable.
- Changing the trip currency recalculates displayed totals from original expense amounts.

## Screen Flow

### Create/Open

Purpose: create a trip or open an existing private trip link.

Key elements:

- Product name.
- Create trip form.
- Existing trip link form.
- Product preview.
- Short private-link note.

### Trip Dashboard

Purpose: understand the current state and add expenses.

Key elements:

- Header with trip name, share action, and settings action.
- Metrics for total counted, people, and awaiting FX rates when nonzero.
- Add/edit expense form.
- Balances.
- Suggested settlements.
- Ledger with 10 expenses per page.
- CSV and summary export actions.

### Add/Edit Expense

Fields:

- Description.
- Amount.
- Currency.
- Date.
- Paid by.
- Split between.

Defaults:

- Currency defaults to the trip currency.
- Date defaults to today.
- Split defaults to everyone.
- Names retain user-entered casing.

### Settings

Purpose: low-frequency trip management.

Fields/actions:

- Rename trip.
- Change trip currency.
- Edit participants.
- Copy trip link.

Settings stay out of the main dashboard so daily expense entry remains compact.

## Access Model

- The private URL is the access key.
- There is no account recovery because there are no accounts.
- Losing the link means losing normal access.
- Sharing the link gives edit access.
- Read-only links are deferred.

## Persistence

Production state is stored in Neon Postgres through Vercel:

- `trips`
- `participants`
- `expenses`
- `expense_splits`
- `fx_rates`

The frontend still talks to `/api/state`; the API hides the persistence details.

## Acceptance Criteria

- Create a trip and open it by private URL.
- Add, edit, and delete same-currency expenses.
- Add foreign-currency expenses and store the FX rate used.
- Show awaiting FX rates only when there are pending expenses.
- Preserve original currency and amount in exports.
- Paginate ledger after 10 expenses.
- Keep settings separate from the dashboard.
- Reject stale writes using version checks.
- Load the production active trip from Postgres.
