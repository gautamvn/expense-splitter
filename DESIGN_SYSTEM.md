# Trip Split Design System

Trip Split should feel like a calm shared-finance tool: fast, trustworthy, compact, and clear enough to use during a trip. It is not a travel magazine, social network, or marketing site.

## Principles

- Lead with the current answer: total counted, balances, and settlement action.
- Keep expense entry obvious and reachable.
- Use restrained contrast, clear spacing, and compact controls.
- Show currency and FX context only where it prevents mistakes.
- Hide zero-value noise, such as awaiting FX rates when there are none.
- Prefer operational labels over promotional copy.

## Visual Tokens

### Color

- `--color-page`: app background.
- `--color-surface`: panels, forms, and controls.
- `--color-surface-raised`: high-emphasis surfaces.
- `--color-ink`: primary text.
- `--color-muted`: secondary text.
- `--color-border`: standard borders.
- `--color-brand`: primary action and focus.
- `--color-positive`: owed-to-user / positive balances.
- `--color-negative`: owes / negative balances.
- `--color-warning`: awaiting FX rates and retry states.

### Type

- Use the system sans stack.
- Hero: 48-76px desktop, 36px mobile.
- Section title: 16-18px.
- Field label: 12px uppercase.
- Body: 14-16px.
- Do not use viewport-scaled text.

### Shape

- Cards, panels, inputs, and buttons cap at 8px radius.
- Metadata chips may use a full pill radius.

### Space

- Base unit: 4px.
- Common gaps: 8px, 12px, 16px, 24px.
- Page gutters: 24px mobile, 32px desktop.

## Components

- `button-primary`: main command, solid brand fill.
- `button-secondary`: lower-emphasis command, bordered surface.
- `panel`: operational surface for forms, balances, settings, and ledger.
- `metric-card`: dashboard number with label, value, and optional hint.
- `field`: label plus input/select/textarea stack.
- `data-row`: repeated ledger, balance, and settlement row.
- `status-chip`: compact currency, FX, or state marker.
- `notice`: actionable system message.

## Layout Rules

### Public Gate

- Show the product name and create/open actions immediately.
- Use a product preview to show what a trip looks like.
- Keep private-link access clear without over-explaining it.
- Avoid marketing sections that delay the user from creating or opening a trip.

### Trip App

- Header carries trip identity, share action, and settings action.
- Metrics sit directly below the header.
- Hide the awaiting FX rates metric when the count is zero.
- Keep the expense form in the primary work area.
- Keep balances and settlements close to the current answer.
- Put trip settings on a separate settings view.
- Paginate the ledger at 10 expenses per page.

### Ledger

- Same-currency expenses show one amount.
- Foreign-currency expenses show original amount and converted amount.
- Do not label same-currency rows as same currency; it is implied.
- Keep edit/delete actions compact and predictable.

## Interaction Rules

- Currency defaults to the trip currency when adding an expense.
- Names display exactly as entered by users.
- FX rates are system-managed and not editable.
- Settlement payments are suggested and copyable only.

## Deferred

- Dark mode.
- Read-only trip links.
- Unequal splits.
- Receipt attachments.
- Icon-library adoption. If added later, use Lucide icons for actions.
