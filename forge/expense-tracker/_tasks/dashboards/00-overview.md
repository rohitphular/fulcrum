# Dashboard Module — Architecture Overview

## Summary

A new Dashboard section replaces the existing placeholder. The user picks a dashboard from a dropdown; the selected dashboard renders client-side from data already loaded into `state` — **no additional API calls are made** (all data comes from `state.transactions`, `state.accounts`, `state.rates`). Each dashboard has a period picker and, where applicable, a Transactions / Accounts tab strip.

---

## Chart library

**Chart.js 4.x** via jsDelivr CDN (free, MIT, no account needed).

```html
<!-- In index.html, after config.js and before main.js -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
```

Chart.js is a UMD global — access as `window.Chart` from ES module files. Do not import it.

---

## File structure

```
app/
  sections/
    dashboard.js              ← section entry point: selector, period picker, tab strip, render dispatch
    dashboards/
      dashboard-utils.js      ← shared computation helpers (groupBy*, period bounds, currency normalisation)
      01-mom-cumulative.js
      02-yoy-monthly.js
      03-wow-daily.js
      04-qtd-comparison.js
      05-ytd-comparison.js
      06-last-12-months.js
      07-last-8-weeks.js
      08-category-pie.js
      09-category-trend.js
      10-top-categories.js
      11-category-drilldown.js
      12-tag-pie.js
      13-tag-trend.js
      14-networth-trend.js
      15-account-balances.js
      16-asset-vs-liability.js
      17-liability-paydown.js
      18-income-vs-expenses.js
      19-cashflow-waterfall.js
      20-savings-rate.js
      21-income-sources.js
      22-top-counterparties.js
      23-recurring-payments.js
      24-spend-by-country.js
      25-spend-by-city.js
      26-loan-progress.js
      27-debt-to-income.js
      28-forex-spend.js
```

Each dashboard file exports a single `render(containerId, options)` function. It sets the container's `innerHTML` and returns the Chart.js instance (or `null` for HTML-only dashboards).

---

## State keys

Add these to `core/state.js` under the `// Dashboard state` comment:

```js
// Dashboard
dashId:          '01-mom-cumulative',   // selected dashboard
dashPeriod:      'this_month',          // selected preset period
dashCustomFrom:  '',                    // YYYY-MM-DD, used when dashPeriod = 'custom'
dashCustomTo:    '',                    // YYYY-MM-DD
dashTab:         'transactions',        // 'transactions' | 'accounts'
dashChartInstance: null,               // active Chart.js instance — destroyed before switching
```

State key naming follows the `<domain><Property>` camelCase convention:
- `dashId` — NOT `dashboardId`
- `dashPeriod` — NOT `dashboardPeriod`
- `dashTab` — NOT `dashboardTab`

---

## Dashboard selector

A `<select>` at the top of the section. Changing it:
1. Calls `chart.destroy()` on `state.dashChartInstance` (if set)
2. Sets `state.dashId` to the new value
3. Clears `innerHTML` of the chart container
4. Calls `renderDashboard()`

---

## Period picker

Rendered below the selector. Two parts:

**Preset `<select>`** — full list:
| Value | Label |
|---|---|
| `this_week` | This week |
| `last_week` | Last week |
| `this_month` | This month |
| `last_month` | Last month |
| `last_3` | Last 3 months |
| `last_6` | Last 6 months |
| `last_12` | Last 12 months |
| `this_quarter` | This quarter |
| `last_quarter` | Last quarter |
| `ytd` | Year to date |
| `last_year` | Last year |
| `custom` | Custom range |

**Custom date inputs** — shown only when preset = `custom`:
- `From` → `<input type="date" id="dashCustomFrom">`
- `To` → `<input type="date" id="dashCustomTo">`

Each individual dashboard doc lists which presets it uses. The selector always renders the full list; unused presets are hidden with CSS (`display:none`) per dashboard.

---

## Tab strip

Dashboards that support both views render two tab buttons:

```html
<div class="dash-tabs">
  <button class="dash-tab active" data-action="dash-tab" data-tab="transactions">Transactions</button>
  <button class="dash-tab"        data-action="dash-tab" data-tab="accounts">Accounts</button>
</div>
```

Tab switching uses **event delegation** — one listener on the container, dispatching on `data-action="dash-tab"`. State key: `state.dashTab`.

Dashboards with a single view omit the tab strip entirely.

---

## Shared utilities — `dashboard-utils.js`

Functions every dashboard can import. All monetary computation uses `toBase` from `core/utils.js` (state-aware wrapper — no need to pass `rateMap` manually).

| Function | Signature | Returns |
|---|---|---|
| `getPeriodBounds(period, customFrom, customTo)` | period string + optional dates | `{ from: Date, to: Date, compareFrom: Date, compareTo: Date }` |
| `filterTxByRange(txs, from, to)` | transactions array, Date bounds | filtered array |
| `groupByDay(txs, from, to)` | filtered txs, range | `Map<'YYYY-MM-DD', tx[]>` |
| `groupByWeek(txs, from, to)` | | `Map<'YYYY-WNN', tx[]>` |
| `groupByMonth(txs, from, to)` | | `Map<'YYYY-MM', tx[]>` |
| `groupByQuarter(txs, from, to)` | | `Map<'YYYY-QN', tx[]>` |
| `sumAmountBase(txs)` | txs with amounts in state currency | number (base currency) — uses `fmtBase` internals |
| `cumulativeByDay(txs, from, to)` | | `{ labels: string[], values: number[] }` |
| `accountBalanceByMonth(accounts, txs, months)` | | `Map<'YYYY-MM', { [accountId]: number }>` |
| `splitTags(txs)` | | array of `{ tag, tx }` pairs (one per tag per tx) |
| `parsePeriodLabel(period)` | period string | human-readable: "Jul 2026" |

`sumAmountBase` calls `toBase` from `core/utils.js` — the state-aware version that reads `state.rateMap` and `state.quoteCurrency` automatically.

---

## Currency handling

- All chart values are in the quote currency (`state.quoteCurrency`, default `'GBP'`).
- Use the state-aware wrappers from `core/utils.js`: `fmtBase(amount, currency, fxRate)`, `fmtNative(amount, currency)`, `getSymbol(currency)`.
- **Do not call `toBase(amount, from, rowFxRate, rateMap, quoteCurrency)` directly from dashboard code** — use the state-aware `fmtBase` wrapper or `sumAmountBase` from `dashboard-utils.js`.
- Transactions with no matching rate in `state.rateMap` are excluded from aggregations (not counted as zero).

### What to convert

| Source | Fields | How |
|---|---|---|
| Transaction | `tx.amount` in `tx.currency` | `fmtBase(tx.amount, tx.currency, tx.fx_rate)` |
| Account balance | `account.current_value` in `account.currency` | `toBase(account.current_value, account.currency, null, state.rateMap, state.quoteCurrency)` |

For account balances, `fx_rate` is always `null` — use the current `rateMap` rate.

### Missing rate warning

When a transaction or account is in a currency not present in `state.rateMap`, it is silently excluded from totals. This must be surfaced to the user with a warning banner inside the dashboard container (not the global `showMsg` toast — it is dashboard-specific).

**Detection helper in `dashboard-utils.js`:**

```js
export function findMissingRates(txs, accounts) {
  const missing = new Set();
  const { rateMap, quoteCurrency } = state;

  for (const tx of txs) {
    if (tx.currency !== quoteCurrency && !rateMap[tx.currency]) {
      missing.add(tx.currency);
    }
  }
  for (const acc of accounts) {
    if (acc.currency !== quoteCurrency && !rateMap[acc.currency]) {
      missing.add(acc.currency);
    }
  }
  return [...missing];  // e.g. ['AED', 'SGD']
}
```

**Rendering the warning (in each dashboard's `_buildHtml`):**

```js
const missingRates = findMissingRates(filteredTxs, state.accounts);
const rateWarn = missingRates.length
  ? `<div class="dash-warn">
       ⚠ ${missingRates.length} currency${missingRates.length > 1 ? 'ies' : ''} excluded from totals —
       no exchange rate for <strong>${esc(missingRates.join(', '))}</strong>.
       <a href="#" data-action="go-rates">Add rates →</a>
     </div>`
  : '';
```

Place `${rateWarn}` immediately above the stat cards block. Tapping "Add rates →" navigates to the Rates section via:

```js
if (action === 'go-rates') {
  e.preventDefault();
  document.dispatchEvent(new CustomEvent('et:show-section', { detail: 'rates' }));
}
```

**CSS class `.dash-warn`:**
```css
.dash-warn {
  background: var(--ember-soft);
  border: 1px solid var(--ember);
  border-radius: 8px;
  padding: 10px 14px;
  font-size: var(--text-sm);
  margin-bottom: 12px;
  color: var(--ink);
}
```

### Base currency change

When the user changes the base currency (top-right picker), the existing `et:reload` event fires → `loadAll()` fetches fresh rates → `showSection('dashboard')` calls `renderDashboard()`. No special handling needed — the dashboard inherits the standard reload cycle.

---

## Chart.js color pattern — CSS token reading

Chart.js dataset `backgroundColor` and `borderColor` values must be **read from CSS custom properties at runtime**, not hardcoded as hex values. This ensures charts respect the active theme (light / dark mode).

```js
// At the top of each dashboard render() call — after the DOM node exists
const style = getComputedStyle(document.documentElement);
const C = {
  teal:        style.getPropertyValue('--teal').trim(),
  tealSoft:    style.getPropertyValue('--teal-soft').trim(),
  ember:       style.getPropertyValue('--ember').trim(),
  emberSoft:   style.getPropertyValue('--ember-soft').trim(),
  muted:       style.getPropertyValue('--muted').trim(),
  ink:         style.getPropertyValue('--ink').trim(),
  hair:        style.getPropertyValue('--hair').trim(),
};

// Multi-series palette — 8 colours drawn from token system
const PALETTE = [
  C.teal,
  '#f59e0b',   // amber — no token, acceptable exception for chart palette
  C.ember,
  '#8b5cf6',   // purple — no token
  '#3b82f6',   // blue — no token
  '#10b981',   // green — no token
  '#f97316',   // orange — no token
  C.muted,
];
```

The `C` object is rebuilt each render call so dark-mode switches are reflected without a page reload.

**In task document Chart.js config sketches, colour values like `--teal`, `--ember`, `--muted` refer to this runtime-read pattern — they are not CSS var strings passed directly to Chart.js.**

---

## Canvas lifecycle

Each dashboard `render()`:
1. Returns the new Chart.js instance.
2. `dashboard.js` stores it in `state.dashChartInstance`.

Before any re-render (dashboard switch, period change, tab switch, theme toggle):
```js
if (state.dashChartInstance) {
  state.dashChartInstance.destroy();
  state.dashChartInstance = null;
}
```

Then clear the container: `el('dashboardContent').innerHTML = '';`

---

## Dark mode re-render

When the theme toggles, `dashboard.js` must re-render the active dashboard so Chart.js picks up the new CSS var values:

```js
// In main.js (or dashboard.js _attachEvents):
document.addEventListener('et:theme-changed', () => {
  if (/* dashboard section is active */) renderDashboard();
});
```

Alternatively, call `renderDashboard()` from the existing `setTheme()` function in `main.js`.

---

## Mobile-first constraints (ALL dashboards must follow)

- Canvas container: `width: 100%; height: 260px` on mobile (≤ 480px), `height: 340px` on desktop.
- All charts: `responsive: true`, `maintainAspectRatio: false`.
- Tap targets: minimum `44 × 44px` for tabs, selector, period picker.
- All tooltips: `mode: 'nearest'` with `intersect: false` — touch-accessible.
- Horizontal bars (`indexAxis: 'y'`) for any chart with more than 5 labelled items.
- Legend: `position: 'bottom'` — never `'right'`.
- Tick labels: `maxRotation: 0` — no diagonal labels.
- Font sizes: `12` for tick labels, `13` for legend (`--text-sm` / `--text-base` equivalents).
- Line chart point radius: `3` desktop, `5` mobile.
- Period picker and tab strip: stack vertically on mobile (`flex-direction: column` at ≤ 480px breakpoint).

---

## Forge principles — required in every dashboard implementation

These apply to all dashboard JS files exactly as they apply to every other section file. Violations will be caught in code review.

### Use `el()` — never `document.getElementById`
```js
// Correct
const container = el('dashboardContent');

// Wrong
const container = document.getElementById('dashboardContent');
```

### `innerHTML` first, `_attachEvents()` after — never interleave
```js
export function render(containerId, options) {
  const container = el(containerId);
  container.innerHTML = _buildHtml(options);  // set all HTML first
  _attachEvents(containerId, options);         // then bind all listeners
  return _renderChart(containerId, options);  // then create chart
}
```

### Event delegation for all interactive elements
Use a single delegated listener on the container. Avoid `querySelectorAll` + individual `addEventListener` for action buttons.

```js
function _attachEvents(containerId, options) {
  el(containerId).addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action } = btn.dataset;
    if (action === 'dash-tab')      { state.dashTab = btn.dataset.tab; renderDashboard(); }
    if (action === 'dash-drilldown') { _handleDrilldown(btn.dataset.id); }
  });
}
```

### `esc()` on all user-supplied values in HTML
Category names, counterparty names, account names, tag names — any value that came from user data must be wrapped in `esc()` before being placed in `innerHTML`.

```js
// Correct
`<td>${esc(tx.counterparty)}</td>`
`<span class="badge">${esc(category.name)}</span>`

// Wrong
`<td>${tx.counterparty}</td>`
```

### Logging format
```js
console.warn('[dashboard-08] no spending data in period');
console.error('[dashboard-08] render failed', err);
```

Prefix: `[dashboard-NN]` where NN is the dashboard number.

### Schema-driven category lists
Do not hardcode category names or transaction types. Read from `state.categorySchema` / `state.transactionSchema`.

### Formatting amounts
- Source currency display: `fmtNative(tx.amount, tx.currency)` → `₹1,050.00`
- Base currency display: `fmtBase(tx.amount, tx.currency, tx.fx_rate)` → `£9.99`
- Do not use raw `.toFixed(2)` for currency output — use the formatters.

---

## Chart.js global config (set once in `dashboard.js`)

```js
if (window.Chart) {
  const style = getComputedStyle(document.documentElement);
  window.Chart.defaults.font.family = style.getPropertyValue('--grotesk').trim() || 'inherit';
  window.Chart.defaults.font.size   = 12;
  window.Chart.defaults.color       = style.getPropertyValue('--ink').trim();
}
```

Re-run this when theme changes before re-rendering the chart.

---

## Implementation order (suggested)

Build in this sequence — each step is independently testable:

1. `dashboard-utils.js` — shared helpers (no UI, fully testable in isolation)
2. `dashboard.js` — selector + period picker + tab strip shell (renders placeholder initially)
3. `06-last-12-months.js` — simplest grouped bar, smoke test of the full pipeline
4. `01-mom-cumulative.js` — first 2-line comparison chart
5. `08-category-pie.js` — donut with HTML table
6. `15-account-balances.js` — snapshot horizontal bar
7. Remaining dashboards in any order

---

## Adding dashboard as a new section — checklist

The dashboard section already exists in the app. When implementing it, follow the `APP-FE.md` "Adding a new section" checklist for the `dashboard` key. Specifically:

- [ ] Add `dashId`, `dashPeriod`, `dashCustomFrom`, `dashCustomTo`, `dashTab`, `dashChartInstance` to `core/state.js`
- [ ] `dashboard.js` in `sections/` exports `renderDashboard()`
- [ ] `nav.js` imports `renderDashboard` and wires it to `showSection('dashboard')`
- [ ] `main.js` calls `renderDashboard()` on `<slug>:reload` when dashboard is the active section
- [ ] `index.html` has `<section class="app-section" id="dashboard"><div id="dashboardContent"></div></section>`
- [ ] Chart.js CDN `<script>` tag before `main.js` in `index.html`
- [ ] `style/expense-tracker.css` has dashboard-specific classes (`.dash-tabs`, `.dash-tab`, `.dash-period-picker`, `.stat-cards`, `.stat-card`)
