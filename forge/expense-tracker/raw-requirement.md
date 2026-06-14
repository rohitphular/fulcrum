# Build Prompt — "Personal Diary" Income & Expense Module

> Paste this whole file into Claude Code as the task. Adjust anything in the
> **CONFIG / DECISIONS** block first if you disagree with a default.

---

## 1. Context

I'm building a personal project called **Personal Diary** — a set of small,
loosely-coupled modules (each its own static web app) that I'll later connect
into one database via my own transform scripts. Modules must capture clean data
and stay independent; do **not** build a shared backend or framework.

A sibling module already exists: a **debt payoff simulator** (static HTML +
`debts.js` + `rates.js`, hosted on GitHub Pages). This new module must reuse the
same **`rates.js`** currency file and match the **same visual design language**
(tokens given below) so the modules feel like one product.

This task is the **Income & Expense module**.

### Core principle
**Capture happens in Google Sheets; this app is READ-ONLY analysis.** I log
transactions on my phone in a Google Sheet. This app signs in with Google,
reads that private sheet, and gives me analysis. The app must never write to or
mutate the sheet. The Google Sheet is the database; the app is disposable.

---

## 2. CONFIG / DECISIONS (edit these before building)

- **Hosting:** static site on GitHub Pages. No server, no build step, no bundler.
  Plain HTML/CSS/vanilla JS. CDN libraries allowed only if clearly justified;
  prefer zero dependencies (draw charts with canvas/SVG).
- **Auth:** Google Identity Services (GIS) OAuth, **read-only** scope
  (`https://www.googleapis.com/auth/spreadsheets.readonly`). Client ID lives in
  the page (not a secret). Single user (me).
- **Data source:** Google Sheets API v4, one spreadsheet, one tab.
- **Base/display currency default:** GBP, switchable in the UI (like the debt
  app's quote currency). Convert using `window.RATES` from `rates.js`.
- **Include columns** `country` and `payment_method`: YES.
- **Categories:** seed the starter list in §5; treat the sheet's values as the
  source of truth (don't hard-code — derive categories from the data, just use
  the seed list for empty-state hints).
- **Placeholders to leave in a CONFIG block at the top of the JS:**
  `GOOGLE_CLIENT_ID`, `SPREADSHEET_ID`, `SHEET_RANGE` (e.g. `Transactions!A:N`),
  `DEFAULT_BASE_CCY = "GBP"`.

---

## 3. Architecture & files to produce

1. `index.html` — the module (single self-contained file: HTML + CSS + JS inline
   is fine, or a small `app.js`; your call, keep it simple).
2. Reuse `rates.js` (same shape as the debt module):
   `window.RATES = { base, rates:{CCY:number}, symbols:{CCY:string} }`.
   Include a copy so the module runs standalone, but read from `window.RATES`.
3. `README.md` — exact, click-by-click setup steps for:
   - Creating the Google Sheet with the header row from §5.
   - Google Cloud Console: create project, enable Sheets API, create an
     **OAuth Client ID (Web application)**, add the GitHub Pages URL under
     **Authorized JavaScript origins**, set the OAuth consent screen to
     **Testing** and add my own email as a **test user** (so no app
     verification is needed), copy the Client ID into CONFIG.
   - How to find the Spreadsheet ID from its URL.
   - Deploying to GitHub Pages and adding to iPhone Home Screen.
   You cannot perform these Google steps yourself — document them clearly for me.

---

## 4. Authentication requirements

- Use Google Identity Services token model with the read-only Sheets scope.
- States to handle explicitly: **not signed in** (show a "Sign in with Google"
  button and nothing else), **signed in / loading**, **loaded**, **auth error**,
  **token expired** (prompt re-auth; silent refresh if possible).
- Never persist the access token to `localStorage`/`sessionStorage`. Keep it in
  memory for the session only.
- Provide a visible **Sign out** control.
- The Client ID is configured once in CONFIG; the README explains where it comes
  from. Security relies on authorized origins + consent + read-only scope.

---

## 5. Data schema (the Google Sheet)

One tab named `Transactions`. **Row 1 is exactly this header** (the app must map
by header name, not column position, and tolerate extra/blank columns):

```
id | date | type | amount | currency | account | category | counterparty | notes | tags | transfer_id | fx_rate | country | payment_method
```

| Column | Type | Required | Example | Rules |
|---|---|---|---|---|
| `id` | text | yes | `2026-06-14-001` | Unique, stable, never reused. Used to dedupe. |
| `date` | date | yes | `2026-06-14` | ISO `YYYY-MM-DD`. |
| `type` | enum | yes | `expense` | `income` / `expense` / `transfer`. |
| `amount` | number | yes | `42.50` | Always **positive**; `type` carries direction. |
| `currency` | text | yes | `GBP` | ISO code; must exist in `rates.js` (warn if not). |
| `account` | text | yes | `HDFC Savings` | Free text; the account it moved through. |
| `category` | text | yes | `Groceries` | Free text; analysis groups by this. |
| `counterparty` | text | no | `Tesco` | Payee/payer. |
| `notes` | text | no | `weekly shop` | Free text. |
| `tags` | text | no | `reimbursable;work` | Semicolon-separated; split for filtering. |
| `transfer_id` | text | no | `T-2026-06-14-1` | Links the two legs of a transfer. |
| `fx_rate` | number | no | `105.2` | Rate to base on that date, if the bank gave it. |
| `country` | text | no | `UK` | For slicing. |
| `payment_method` | text | no | `card` | e.g. card / cash / bank / UPI. |

### Transfer model (important)
A transfer between accounts is **two rows** sharing the same `transfer_id`: an
`expense` row from the source account and an `income` row to the destination
account (possibly in different currencies). The app **must exclude transfers
from income and expense totals** so they don't show as phantom spending/earning,
but should still let me see transfer flows between accounts.

### Currency handling
- Store native currency only (never converted). Convert to the selected base
  currency at view time using `rates.js`.
- If a row has `fx_rate`, prefer it for that row's conversion to base; otherwise
  use the static `rates.js` rate. Note this distinction in a tooltip/footnote.
- If a row's currency is missing from `rates.js`, surface a clear warning and
  treat it 1:1 (don't silently drop the row).

### Seed categories (for empty-state hints only)
Salary, Freelance, Groceries, Eating out, Transport, Fuel, Rent, Mortgage,
Utilities, Phone & internet, Subscriptions, Shopping, Health, Insurance,
Education, Travel, Entertainment, Gifts, Fees & charges, Transfer, Other.

---

## 6. Analysis UI requirements

Read-only dashboard. Mobile-first (used on iPhone; responsive, large tap
targets, `viewport` meta, `theme-color`, works as an Add-to-Home-Screen page).

**Global controls**
- Base currency selector (default GBP; options from `rates.js`).
- Date range filter (presets: this month, last month, last 3/6/12 months, YTD,
  all; plus custom from/to).
- Filters: type, account, currency, category, country, payment_method, tag,
  free-text search across counterparty/notes.

**Summary (top cards)** — for the active filter range, in base currency:
- Total income, total expense, **net** (income − expense), savings rate (%).
- Transfers shown separately and **excluded** from the above.

**Visualisations** (vanilla canvas/SVG; no heavy libs unless justified):
- Income vs expense by month (bars or lines).
- Expense by category (ranked bars; top N + "other").
- Spend by account and by country (compact breakdowns).
- Optional: cumulative net over time.

**Transaction table**
- Sortable, searchable, paginated/virtualised if large.
- Show native amount + converted-to-base; type badge; date; account; category;
  tags; country; payment method; notes.
- Clearly mark transfer rows.

**Export**
- Export the currently filtered view as CSV and JSON (for my future DB import).

**States**: loading, empty (with guidance pointing at the sheet + header row),
auth-required, error, partial (rows with bad data flagged, not dropped silently).

---

## 7. Design language (match the debt module)

Use these tokens; same look and feel.

```
--ink:#16202C; --canvas:#EEF1F5; --panel:#FFFFFF;
--ember:#DC5B3B;  /* expense / attention */
--teal:#0F9D8C;   /* income / positive */
--muted:#6B7787; --hair:#DCE2EA; --hair-strong:#C3CCD7;
font (body/headings): 'Space Grotesk', system-ui, sans-serif
font (numbers/mono):  'IBM Plex Mono', ui-monospace, monospace
```
Cards: white panels, 14px radius, 1px hairline border. Mono for all figures.
Income = teal, expense = ember, net/neutral = ink. Minimal, instrument-like,
no clutter. Respect `prefers-reduced-motion`.

---

## 8. Data-handling rules (non-negotiable)

- **Read-only**: never write/modify the sheet.
- **Never invent or store converted amounts** as if they were source data;
  conversion is a view-time computation only.
- **Tolerant parsing**: map by header name; skip-with-warning on malformed rows;
  never crash the whole view because one row is bad.
- **No sensitive data in browser storage**; tokens in memory only.
- **Append-only mindset**: treat each row as an immutable fact keyed by `id`.
- Keep the module **self-contained and decoupled** so it can later be ingested
  into the larger Personal Diary database without rework.

---

## 9. Acceptance criteria

1. Opening the page while signed out shows only a Google sign-in button.
2. After sign-in, it reads the private sheet and renders summary + charts +
   table for the default range, in GBP.
3. Changing the base currency reconverts every figure using `rates.js`.
4. A transfer pair (two rows, same `transfer_id`) does **not** appear in income
   or expense totals, but is visible as a transfer.
5. Filters and search update all views consistently.
6. A row whose currency is missing from `rates.js` produces a visible warning,
   not a crash, and is shown 1:1.
7. Export produces CSV and JSON of the filtered rows.
8. Works and looks correct on an iPhone screen width.
9. `README.md` contains complete, accurate Google Cloud + Sheet + GitHub Pages
   setup steps, with placeholders for me to fill (`GOOGLE_CLIENT_ID`,
   `SPREADSHEET_ID`).

## 10. Deliverables
`index.html`, `rates.js`, `README.md`, and a sample `Transactions` sheet
content (header row + ~6 example rows covering income, expense, a two-leg
transfer across currencies, and a row with `fx_rate`) so I can paste it in to
test immediately.

## 11. Out of scope (don't do)
No write-back, no account/bank API integrations, no frameworks, no build
tooling, no analytics/telemetry, no storing data anywhere but the sheet.
Ask me before adding any dependency.
