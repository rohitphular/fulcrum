# Requirements — "Personal Diary" Debt Tracker Module
*(reverse-engineered from the built implementation)*

> A specification describing what the debt payoff simulator does, sufficient to
> rebuild it. Hosting target: static site on GitHub Pages, usable on iPhone via
> Add-to-Home-Screen.

---

## 1. Overview & purpose

A personal, read-only **debt payoff simulator**. It models a set of debts —
instalment loans, credit cards, and money owed to friends — across multiple
currencies, rolls balances forward to the current month, and projects how fast
they clear under an avalanche or snowball strategy with a chosen extra monthly
payment. It is one module of a larger **Personal Diary** project and shares a
currency file and design language with sibling modules.

The tool is a **planning aid**, not accounting software, and not financial
advice. It favours honest framing over false precision.

---

## 2. Architecture & hosting

- Static front end: **HTML + CSS + vanilla JS**, no framework, no build step,
  no bundler.
- Data and rates live in **separate hand-editable `.js` files** loaded via
  `<script src>` (so they load over `https://` on GitHub Pages; `file://` will
  fall back — see FR-13).
- No server, no database, no telemetry. Everything runs client-side.
- Works offline after first load (Google Fonts enhance but degrade gracefully).
- Must render and function on a phone screen.

### Files
| File | Responsibility | Edited by user |
|---|---|---|
| `debt_payoff_simulator.html` | All UI + logic | No |
| `debts.js` | The debts and extra-payment log | Yes |
| `rates.js` | Currency rates & symbols (shared with other modules) | Yes |

---

## 3. Data model

### 3.1 `rates.js`
```
window.RATES = {
  base: "GBP",
  rates:   { GBP:1, INR:105, USD:1.27, ... },  // units of CCY per 1 base
  symbols: { GBP:"£", INR:"₹", USD:"$", ... }
}
```
- `base` must have rate 1.
- `rates[C]` = how many units of currency C equal one unit of base.

### 3.2 `debts.js`
```
window.DEBT_DATA = {
  snapshotDate: "YYYY-MM",   // month the balances below were accurate
  defaultQuote: "GBP",       // currency shown on open (changeable in UI)
  extraPerMonth: 500,        // default extra/month, in quote currency
  strategy: "avalanche",     // "avalanche" | "snowball"
  loans:   [ ... ],          // instalment loans
  cards:   [ ... ],          // credit cards
  friends: [ ... ],          // informal / family debts
  payments:[ ... ]           // extra-payment log
}
```

Debt **type is implied by which array** it is in (no `type` field written by the
user). Common fields on every debt: `name` (unique), `currency`, `balance`
(as of snapshot), `rate` (annual %), optional `asOf` (`"YYYY-MM"` if this
balance is accurate from a different month than the global snapshot).

| Array | Type | Extra fields |
|---|---|---|
| `loans` | instalment | `min` (fixed monthly); optional `precomputed:true` |
| `cards` | card (revolving) | `minPercent` (% of balance), `minFloor` (absolute min) |
| `friends` | friend | `min` (often 0); optional `payFirst:true` |

**Payment log** entries: `{ date:"YYYY-MM-DD", loan:"<exact name>", amount:<n> }`.
Amounts are in the **debt's own currency**. These are EXTRA payments on top of
the always-assumed minimums.

---

## 4. Functional requirements

### FR-1 — Multiple debt types
Support three behaviours: fixed-instalment loans, revolving credit cards, and
informal friend/family debts. Merge all three arrays into one working set,
tagging each with its type.

### FR-2 — Multi-currency with quote selection
Each debt is held in its own currency. A dashboard **quote-currency selector**
(populated from `rates.js`) converts every figure into the chosen currency for
totals, comparison, and charts. The balances table also shows each debt's
native amount. Default quote = `defaultQuote`.

- Conversion: `amount_quote = amount / rates[from] * rates[to]`.
- If a currency is absent from `rates.js`: surface a warning, treat as 1:1, do
  not drop the debt.

### FR-3 — Snapshot roll-forward (the "live snapshot")
On open, determine **today** from the system clock (overridable via a month
input). For each debt, roll its `balance` forward from `asOf || snapshotDate` to
today, one month per elapsed month:
- Accrue monthly interest = `balance * rate/12`, **except** debts flagged
  `precomputed` (interest already baked into the balance).
- Subtract that month's **required minimum** (FR-5).
- Apply any logged extra payments dated in that month (FR-4).
- Floor balances at zero.
For the **current month**, apply logged extras but not the assumed minimum
(it may not be due yet). Display a banner stating how many months were rolled
and the assumption ("minimums paid"). Rolling 0 months shows snapshot as-is.

### FR-4 — Extra-payment log
Apply each logged extra payment (in the debt's native currency) in the month it
was made, on top of the assumed minimum, reducing that debt's balance (capped at
zero). Payments whose `loan` name matches no debt are listed as **unmatched and
ignored**, with a visible warning. Payments dated before the snapshot are
naturally never applied.

### FR-5 — Type-aware minimum payment
Given a current balance, compute the monthly minimum:
- **card**: `min( max(balance * minPercent/100, minFloor), balance )` — a
  shrinking percentage-of-balance minimum.
- **instalment / friend**: `min(fixedMin, balance)`.
Used identically in roll-forward (native) and projection (quote currency).

### FR-6 — Payoff projection (avalanche / snowball)
From today's balances, simulate month by month:
- Monthly budget = sum of all debts' current required minimums **at the starting
  balances** + the chosen extra; held constant (so freed-up minimums roll into
  the target — the "rollover" effect).
- Each month: accrue interest (skip precomputed); pay each debt's current
  required minimum; funnel the remaining budget to debts in **attack order**.
- **Attack order**: debts flagged `payFirst` come first (ordered by rate), then
  the rest ordered by strategy — **avalanche** = highest rate first,
  **snowball** = smallest balance first.
- Record each debt's clear month; record total interest and a monthly
  total-balance series. Stop when all cleared or at a safety cap (1200 months).

### FR-7 — Minimums-only baseline & comparison
Independently simulate "minimums only": each debt pays just its own required
minimum each month, no extra, no rollover. Compare to the plan to show **months
saved** and **interest saved**. If the baseline never clears within the cap
(e.g. a 0-minimum friend or a percentage-min card trap), state that minimums
alone don't clear the debt rather than showing a false saving.

### FR-8 — Headline metrics
Show, in quote currency: projected **debt-free date** (today + months),
**months to freedom**, **interest from here**, **owed today**, and **total
monthly commitment** (minimums + extra). Show deltas vs the minimums-only
baseline. If the plan doesn't clear within the cap, degrade gracefully
("beyond chart").

### FR-9 — Burndown timeline
List debts in attack order; for each, a bar whose length is proportional to how
long it stays open (clear month / horizon), labelled with its projected clear
date, rate, and currency. `payFirst` debts are visually distinct.

### FR-10 — Balance-over-time chart
A canvas line chart of total balance over time: **plan** vs **minimums-only**
baseline, with y-axis in quote-currency thousands and an x-axis from "today" to
the payoff horizon.

### FR-11 — Since-snapshot tracking
Accumulate and display, in quote currency: total **extra paid** (and count),
total **paid** (minimums + extra), and **interest accrued** since the snapshot.

### FR-12 — Controls
Quote currency; extra-payment amount (slider 0–2000 + exact number input,
default from `extraPerMonth`); strategy toggle (avalanche/snowball, default from
`strategy`); "today" month (default current month). Any change recomputes live.

### FR-13 — Resilience
If `debts.js` / `rates.js` fail to load (e.g. opened via `file://`, missing, or
a syntax slip), fall back to built-in sample data **and show a clear warning
banner** so the user knows real data didn't load. Tolerate missing optional
fields with sensible defaults (type instalment, currency = base, rate 0, min 0).

---

## 5. UI sections (in order)

1. Header + status banner (snapshot/roll-forward state, warnings).
2. Hero metric cards (FR-8).
3. **Plan** controls (FR-12).
4. **Balances today** — table: debt, type badge, rate, min/mo, balance (native),
   balance (quote); total row. Plus since-snapshot chips (FR-11).
5. **Extra payments logged** — the payment log + unmatched warnings.
6. **Burndown order** (FR-9).
7. **Balance over time** (FR-10).
8. **Read before acting** — collapsible caveats (see §8).

---

## 6. Calculation methodology

- Interest accrues monthly at `rate/12` on the outstanding balance (reducing
  balance), except `precomputed` debts which accrue none.
- All money math for the projection is done in the quote currency after
  converting today's balances and minimum parameters.
- Historical payments are converted at the **current** static rate, not the rate
  on the day paid (planning approximation, not exact accounting).
- Balances floored at zero; overpayments capped at remaining balance.
- Safety cap of 1200 months prevents infinite loops; beyond it the plan is
  reported as not clearing within range.

---

## 7. Non-functional requirements

- **Privacy**: no data leaves the browser; nothing stored server-side; no
  analytics. (Hosting the data files publicly is the user's deployment choice.)
- **No persistent browser storage** of sensitive values; in-memory only.
- **Performance**: instant recompute on input change for dozens of debts.
- **Accessibility**: labels on controls, visible focus, `prefers-reduced-motion`
  respected.
- **Mobile**: responsive layout, large tap targets, Add-to-Home-Screen friendly.
- **Maintainability**: data separated from UI; debts editable by a non-developer
  by copying a line; module decoupled for future ingestion into Personal Diary.

---

## 8. Assumptions & known limitations (surfaced to the user)

1. Balances are **estimates**; only debts with a real statement figure are exact.
   The roll-forward assumes minimums are paid in full each month.
2. **Pre-computed** debts (e.g. some fixed loans) only benefit from overpayment
   if the lender's early-settlement rebate is good — get a settlement quote
   before overpaying them.
3. Credit-card minimums shrink as the balance falls, so minimum-only payments
   drag on for years (the minimum-payment trap).
4. Friends default to lowest priority by rate; `payFirst` exists because
   relationships may outrank the maths.
5. Rates are **static** (user-set), not live; historical FX is approximated at
   today's rate.
6. When a debt clears, the freed-up minimum should be logged as an extra payment
   to the next target to keep the tracker accurate (the projection assumes this
   rollover; the historical roll-forward needs it logged).

---

## 9. Acceptance criteria

1. All debts from `loans`, `cards`, `friends` load and display with correct type.
2. Changing the quote currency reconverts every figure via `rates.js`.
3. Opening N months after the snapshot rolls balances forward N months assuming
   minimums paid, and the banner says so.
4. A logged extra payment reduces the right debt in the right month, in its own
   currency; an unknown debt name is flagged, not silently applied.
5. Card minimum = `max(% of balance, floor)` and shrinks as balance falls.
6. Avalanche orders by rate; snowball by balance; `payFirst` debts always first.
7. Projection clears all debts; debt-free date, months, and interest shown; the
   minimums-only comparison shows months/interest saved.
8. Pre-computed debts accrue no further interest in any calculation.
9. Missing currency or missing data files produce warnings, not crashes/blanks.
10. Renders correctly on a phone width.

## 10. Glossary
- **Snapshot date** — the month the entered balances were accurate.
- **Roll-forward** — projecting balances to today by applying assumed minimums.
- **Quote currency** — the single currency the dashboard converts everything to.
- **Avalanche** — pay highest-rate debt first (least total interest).
- **Snowball** — pay smallest-balance debt first (quick wins).
- **Pay first** — manual override to repay a debt ahead of the maths.
- **Pre-computed** — interest already baked into the balance; no further accrual.
