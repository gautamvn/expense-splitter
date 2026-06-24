# Trip Split Design System

Trip Split should feel like a polished shared finance tool: calm, fast, trustworthy, and dense enough for repeated use during a trip. It is not a travel magazine, social app, or marketing site.

## Principles

- Lead with the current answer: total counted, pending FX, balances, and settlement action.
- Keep the primary action obvious: adding an expense should be reachable without hunting.
- Use quiet contrast, clear spacing, and compact controls over decorative flourish.
- Keep currency and FX context visible wherever it prevents mistakes.
- Prefer operational labels over promotional copy.

## Tokens

- Color:
  - `--color-page`: app background.
  - `--color-surface`: main cards and controls.
  - `--color-surface-raised`: high-emphasis cards.
  - `--color-ink`: primary text.
  - `--color-muted`: secondary text.
  - `--color-border`: standard borders.
  - `--color-brand`: primary action and focus.
  - `--color-positive`: owed-to-user / positive balances.
  - `--color-negative`: owes / negative balances.
  - `--color-warning`: awaiting FX rates and retry states.
- Type:
  - System sans stack.
  - Hero: 48-76px on desktop, 36px on mobile.
  - Section title: 16-18px.
  - Field label: 12px uppercase.
  - Body: 14-16px.
- Shape:
  - Radius is capped at 8px for cards, panels, inputs, and buttons.
  - Pills may use full radius only for compact metadata chips.
- Space:
  - Base unit: 4px.
  - Component gaps: 8px, 12px, 16px, 24px.
  - Page gutters: 24px mobile, 32px desktop.

## Components

- `button-primary`: main command, solid brand fill.
- `button-secondary`: lower-emphasis commands, bordered surface.
- `panel`: operational card for forms, balances, settings, and ledger.
- `metric-card`: dashboard numbers with label, value, and optional hint.
- `field`: label + input/select/textarea stack.
- `data-row`: compact repeated ledger, balance, and settlement rows.
- `status-chip`: small metadata marker for currency, FX, and state.
- `notice`: actionable system message.

## Layout

- Gate:
  - Two-column desktop layout with product framing and create/open forms.
  - Mobile stacks forms below the product copy.
  - A static product preview shows what a real trip looks like without requiring an account.
- App:
  - Header carries trip identity and global actions.
  - Metrics sit directly below the header.
  - Main grid keeps the expense form on the left and current answer panels on the right.
  - Ledger is full-width below the decision panels.

## Deferred

- Dark mode.
- Custom illustration set.
- Icon library adoption. If added later, use Lucide icons for actions.
