# Trip Split End-To-End Design

This document describes the target product experience for a minimal, robust, no-account Trip Split web app. It is a design and product spec only; it is not an implementation plan for this exact codebase yet.

## Product Shape

Trip Split is a private-link web app for friend groups on trips. A person creates a trip, shares the unique trip URL, everyone adds expenses, and the app shows balances and suggested settlement payments in the trip's default currency.

The product should feel simple enough that a friend can open it from WhatsApp or Telegram and add an expense without explanation.

## Core Constraints

- No user accounts.
- Unique URL per trip.
- Anyone with the edit URL can edit the trip.
- Optional read-only URL later.
- No notes.
- No attachments.
- No receipt uploads.
- No social/comment features.
- Multi-currency expenses are supported from the start of the robust version.
- Original expense amounts and currencies are never rewritten.

## Primary Objects

### Trip

- `id`: internal stable ID.
- `editTokenHash`: hashed token for edit URL access.
- `readTokenHash`: optional hashed token for read-only URL access.
- `name`: display name.
- `defaultCurrency`: ISO 4217 code, such as `EUR`, `SGD`, or `USD`.
- `createdAt`.
- `updatedAt`.
- `archivedAt`: optional.

### Participant

- `id`.
- `tripId`.
- `name`.
- `createdAt`.
- `isActive`.

### Expense

- `id`.
- `tripId`.
- `description`.
- `expenseDate`: date used for FX.
- `paidByParticipantId`.
- `originalAmountMinor`: amount in the expense currency's minor units.
- `originalCurrency`: ISO 4217 code.
- `tripCurrencyAtCreation`: the trip default currency when the expense was created.
- `convertedAmountMinor`: amount converted into current trip default currency for calculations.
- `fxRateId`.
- `fxRateValue`.
- `fxRateSource`.
- `fxRateDate`.
- `manualFxOverride`: boolean.
- `createdAt`.
- `updatedAt`.
- `deletedAt`: optional soft delete.

### Expense Split

- `id`.
- `expenseId`.
- `participantId`.
- `shareNumerator`: default `1`.
- `shareDenominator`: optional later.
- `convertedShareMinor`: calculated and stored or derived consistently.

For v1, equal split is enough. The split table still keeps the model ready for unequal splits later without redesigning currency handling.

### FX Rate

- `id`.
- `baseCurrency`.
- `quoteCurrency`.
- `rateDate`.
- `rate`.
- `source`.
- `createdAt`.

Rates should be cached by `baseCurrency`, `quoteCurrency`, and `rateDate`.

## Currency Design

### Key Rule

Expenses keep their own original currency forever. Changing the trip default currency changes how totals and balances are displayed and calculated, not what was originally spent.

### Expense Entry

When a user enters an expense:

1. User enters amount and currency.
2. User picks expense date.
3. App fetches FX rate from expense currency to trip default currency for that date.
4. App stores:
   - Original amount.
   - Original currency.
   - FX date.
   - FX rate.
   - Converted amount in trip default currency.
5. Balances update using converted amount.

### Changing Trip Default Currency

If the trip default currency changes from `EUR` to `SGD`:

- Do not change original expense amount or original expense currency.
- Recompute converted values from original currencies into `SGD`.
- Use each expense's expense date for daily FX.
- Store the new conversion basis or calculate from cached rates.
- Show a clear confirmation:
  - "This changes totals and balances to SGD. Original expense currencies stay unchanged."

### FX Failure States

- If FX lookup fails during expense entry:
  - Show "Could not fetch FX for this date."
  - Offer retry.
  - Offer manual rate entry in an advanced row.
  - Do not silently use today's rate.
- If FX lookup fails during trip currency change:
  - Block the change until missing rates are available or manually filled.
  - Show the list of missing date/currency pairs.

### Display Rules

- Dashboard totals: trip default currency only.
- Ledger row: original amount first, converted amount second only when different.
- Example: `Taxi - €48.00 -> S$69.84`.
- Expense edit: show full FX details in a compact disclosure.
- CSV export: include both original and converted values.

## Information Architecture

### Public Create/Open Page

Purpose: create a trip or open an existing trip link.

Sections:

- Product name.
- Create trip form.
- Short privacy/access note.

No marketing-heavy landing page. The app should start with the task.

### Trip Dashboard

Purpose: understand current state and add expenses.

Primary sections:

- Header:
  - Trip name.
  - Default currency.
  - Share button.
  - Settings button.
- Summary:
  - Total spent in trip currency.
  - Number of expenses.
  - Participants.
- Primary action:
  - Add expense.
- Balances:
  - Participant balances in trip currency.
  - Copy summary.
- Settle up:
  - Suggested payments.
- Ledger:
  - Expense list.
  - Download CSV.

### Add/Edit Expense

Purpose: fast entry, especially on mobile.

Fields:

- Description.
- Amount.
- Currency.
- Date.
- Paid by.
- Split between.

Defaults:

- Currency defaults to trip default currency.
- Date defaults to today.
- Split defaults to everyone.
- Paid by can default to the last local participant used on the device.

### Settings

Purpose: low-frequency trip management.

Fields/actions:

- Rename trip.
- Change default currency.
- Edit participants.
- Copy edit link.
- Create/copy read-only link later.
- Archive trip later.

Settings must be clearly separated from daily expense entry.

## Mobile Screen Designs

These are structural wireframes, not final visuals.

### Create Trip

```text
Trip Split

Trip name
[ Summer in Italy        ]

Default currency
[ EUR v ]

Participants
[ Gautam                 ]
[ Jaya                   ]
[ Add another person     ]

[ Create trip ]

Private link. No accounts.
Anyone with the edit link can update this trip.
```

### Trip Dashboard

```text
Italy 2026                         [Share] [Settings]
Default currency: EUR

Total spent
€1,248.38

[ Add expense ]

Balances                         [Copy summary]
Gautam                         +€84.20
Jaya                           -€84.20

Settle up
Jaya pays Gautam                €84.20

Ledger                          [Download CSV]
Dinner                          €72.00
Paid by Gautam · split 2 ways

Taxi                            S$32.50 -> €22.18
Paid by Jaya · split 2 ways
```

### Add Expense

```text
Add expense

Description
[ Dinner                         ]

Amount
[ 72.00                 ] [ EUR v ]

Date
[ Today v ]

Paid by
[ Gautam v ]

Split between
[x] Gautam
[x] Jaya
[ ] Vikram

FX
EUR -> EUR

[ Save expense ]
```

### Add Foreign Currency Expense

```text
Add expense

Description
[ Taxi                           ]

Amount
[ 32.50                 ] [ SGD v ]

Date
[ 23 Jun 2026 v ]

Paid by
[ Jaya v ]

Split between
[x] Gautam
[x] Jaya

FX
SGD -> EUR on 23 Jun 2026
1 SGD = 0.6825 EUR
Converted total: €22.18

[ Save expense ]
```

### Change Trip Currency

```text
Change default currency

Current: EUR
New:     [ SGD v ]

This changes totals, balances, settlements, and exports to SGD.
Original expense amounts stay unchanged.

The app will convert each expense using FX for its expense date.

[ Cancel ] [ Change to SGD ]
```

### FX Missing State

```text
FX rate needed

Could not fetch SGD -> EUR for 23 Jun 2026.

[ Retry ]

Advanced
Manual rate
[ 0.6825 ]

[ Save with manual rate ]
```

## Desktop Layout

Desktop should not become a different product. It should show the same information with more breathing room:

- Left column: Add expense.
- Middle column: Balances and settle-up.
- Right or lower section: Ledger.
- Header remains compact.
- Settings opens as a modal or dedicated simple page.

## Interaction Details

### Add Expense Flow

1. Open trip URL.
2. Tap Add expense.
3. Enter description and amount.
4. Confirm currency and date.
5. Choose payer.
6. Confirm split participants.
7. Save.
8. Dashboard updates without losing scroll context.

### Edit Expense Flow

1. Tap ledger row.
2. Edit fields.
3. If amount, currency, or date changes, FX is refreshed.
4. Save.
5. Show updated balance.

### Delete Expense Flow

1. Open expense.
2. Tap Delete.
3. Confirm.
4. Soft-delete the expense.
5. Recalculate balances.

### Share Flow

1. Tap Share.
2. Copy edit link.
3. Optional later: copy read-only link.
4. Show warning: "Anyone with the edit link can update this trip."

## Data Safety Rules

- Never clear a trip as part of UI edits.
- Never test with a live trip URL unless explicitly requested.
- All migrations require timestamped backup first.
- All production writes should be targeted and reversible.
- Keep current live JSON backups until database migration is complete and verified.

## API Design Sketch

- `POST /api/trips`
  - Creates trip and returns edit URL.
- `GET /api/trips/:token`
  - Fetches trip by edit or read token.
- `PATCH /api/trips/:token`
  - Renames trip or changes default currency.
- `POST /api/trips/:token/participants`
  - Adds participant.
- `PATCH /api/trips/:token/participants/:id`
  - Renames/deactivates participant.
- `POST /api/trips/:token/expenses`
  - Adds expense.
- `PATCH /api/trips/:token/expenses/:id`
  - Edits expense.
- `DELETE /api/trips/:token/expenses/:id`
  - Soft-deletes expense.
- `GET /api/fx?base=SGD&quote=EUR&date=2026-06-23`
  - Fetches or returns cached FX rate.
- `GET /api/trips/:token/export.csv`
  - Downloads ledger CSV.

## CSV Export Design

Columns:

- Expense date.
- Description.
- Paid by.
- Split with.
- Original amount.
- Original currency.
- Trip amount.
- Trip currency.
- FX date.
- FX rate.
- FX source.
- Manual FX override.
- Created at.
- Updated at.

## Acceptance Criteria

- A new user can create and share a trip in under one minute.
- A participant can add a normal same-currency expense in under 20 seconds.
- A participant can add a foreign-currency expense without understanding FX mechanics.
- Changing trip currency does not mutate original expenses.
- Ledger always shows enough currency detail to audit totals.
- CSV export can recreate the calculation basis.
- Two users adding expenses at the same time do not overwrite each other.
- Live data is backed up before any migration or production data operation.

## First Implementation Slice

The best first build slice is:

1. Stabilize current app with tests and deployment hygiene.
2. Add doc-backed data model for multi-currency.
3. Add redesigned dashboard and add-expense flow.
4. Add original currency plus FX conversion.
5. Add CSV with FX audit columns.
6. Move persistence to a safer backend.

