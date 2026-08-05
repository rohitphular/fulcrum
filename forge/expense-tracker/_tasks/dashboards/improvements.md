# Dashboard Improvements — Review Findings

## Summary

Reviewed all 28 dashboards against four dimensions:
1. Description / explanatory note
2. Date-range correctness
3. Previous-period color
4. Drilldown tables — presence and style consistency

---

## 1. Descriptions — ALL MISSING

No dashboard has a description. The `DASHBOARDS` registry in `dashboard.js` only has `id`, `label`, `group`, `tabs`. Nothing is rendered to explain what a dashboard shows, how to read it, or what the comparison means.

**Fix needed for all 28:** Add a `description` field to each registry entry and render it as a subtitle below the dashboard selector.

---

## 2. Date-Range Issues

### Dashboards with a hardcoded window (period selector is ignored entirely)

| ID | Dashboard | What it actually shows |
|---|---|---|
| 06 | Last 12 months | Always: 11 full months + current partial — `from`/`to` params are never read |
| 07 | Last 8 weeks | Always: 7 full weeks + current partial — `from`/`to` params are never read |

**Fix:** Hide the period selector for these two. They have no use for it.

### Dashboards where the period selector allows meaningless options

These dashboards derive their own date logic from `from` (ignoring `to`) and always perform a fixed comparison. The full 16-option selector is shown even though most options are irrelevant.

| ID | Dashboard | Meaningful periods only | Notes |
|---|---|---|---|
| 01 | MoM cumulative | `this_month`, `last_month`, `custom` | Derives period A from `from` month; anything non-monthly gives a misleading chart |
| 02 | YoY monthly | `this_month`, `last_month`, `ytd`, `last_year`, `custom` | Always compares same calendar month vs one year prior |
| 03 | WoW daily | `this_week`, `last_week`, `last_7`, `custom` | Derives period A from the week containing `from` |
| 04 | QTD comparison | `this_quarter`, `last_quarter`, `custom` | Derives quarter from `from`; non-quarterly ranges produce a nonsensical chart |
| 05 | YTD comparison | `ytd`, `last_year`, `custom` | Derives year from `from`; non-yearly ranges compare wrong years |

**Fix:** Each of these should restrict its period selector to relevant options only. Either filter `PERIOD_OPTIONS` per dashboard in the registry, or render a dashboard-specific subset.

---

## 3. Previous-Period Color

The user-reported issue: the previous-period line/bar is too faded and doesn't read clearly.

| ID | Dashboard | Prev period color | Issue |
|---|---|---|---|
| 01 | MoM cumulative | `C.muted` (CSS var, grey/faded) | Bad — too washed out |
| 02 | YoY monthly | `#f59e0b` (AMBER, solid) | OK |
| 03 | WoW daily | `C.muted` (faded) | Bad |
| 04 | QTD comparison | `#f59e0b` (AMBER, solid) | OK |
| 05 | YTD comparison | `#f59e0b` (AMBER, solid) | OK |
| 06 | Last 12 months | `#f59e0b` for net savings line | OK |
| 10 | Top categories | `C.muted + '99'` (semi-transparent muted) | Bad |

All other dashboards either have no period comparison or use distinct palette colors (not a prev/current contrast).

**Fix:** Standardise on `#f59e0b` (AMBER) for all previous-period series. Update dashboards 01, 03, and 10.

Note: `#f59e0b` is already defined in `buildPalette()` in dashboard-utils as the second palette entry but is not exported as a named constant. Add `export const PREV_PERIOD_COLOR = '#f59e0b'` to dashboard-utils and import it in all dashboards that need it.

---

## 4. Drilldown Tables

### Which dashboards have drilldowns

| ID | Dashboard | Drilldown on | Transaction rows shown |
|---|---|---|---|
| 08 | Category pie | Pie segment click | Yes — Date / Counterparty / Sub-category / Amount |
| 11 | Category drilldown | Bar click (2 levels: major → minor → txs) | Yes — Date / Counterparty / Description / Amount |
| 12 | Tag pie | Pie segment click | Summary table only (Tag / Txs / Total / Avg), no raw tx rows |
| 13 | Tag trend | Chart point click | Yes — Date / Counterparty / Amount |
| 14 | Net worth trend | Chart point click | Account balances table (not transactions) |
| 18 | Income vs expenses | Bar click | Two mini-tables: income sources and expense categories (no raw tx rows) |
| 19 | Cashflow waterfall | Bar click | Yes — Date / Counterparty / Sub-category / Amount |
| 21 | Income sources | Pie segment click | Yes — Date / Source / Amount |
| 22 | Top counterparties | Bar click | Sparkline chart in panel (no table) |
| 23 | Recurring payments | Table row click | Payment history bar chart (no raw tx table) |
| 24 | Spend by country | Pie segment click | City-level summary table (no raw tx rows) |
| 25 | Spend by city | Bar click | Yes — Date / Counterparty / Category / Amount |

### Styling issues

All drill tables use inline `style=` attributes (`padding:5px 8px`, `font-size:var(--text-sm)`, etc.). None use the app's CSS classes (`.tx-table`, `.tx-row`, etc.). This means:
- Visual inconsistency across drilldowns
- No dark-mode guarantee — inline styles bypass theme tokens in edge cases
- No responsive behaviour

### Column inconsistency across tx-row drilldowns

Dashboards that do show raw transaction rows use different column sets:

| Dashboard | Columns |
|---|---|
| 08 | Date / Counterparty / Sub-category / Amount |
| 11 | Date / Counterparty / Description / Amount |
| 13 | Date / Counterparty / Amount (split) |
| 19 | Date / Counterparty / Sub-category / Amount |
| 21 | Date / Source / Amount |
| 25 | Date / Counterparty / Category / Amount |

**Fix:** Standardise on: **Date / Counterparty / Category / Amount** across all transaction-row drilldowns, matching the transactions section column order (minus actions and type). Extract a shared `renderDrillTxTable(txs, sym)` helper into `dashboard-utils.js` and replace the per-dashboard table HTML.

---

## 5. Bugs Found

### `_computeDailyTotalAssets` — ReferenceError in accounts tabs (01, 02)

Both `01-mom-cumulative.js` and `02-yoy-monthly.js` import `computeDailyTotalAssets` from `dashboard-utils.js` but call it as `_computeDailyTotalAssets` (with leading underscore) in their accounts tab renderers. This is a runtime ReferenceError — the accounts tab in dashboards 01 and 02 is broken.

- `01-mom-cumulative.js` lines 241–242: `_computeDailyTotalAssets(...)` → should be `computeDailyTotalAssets(...)`
- `02-yoy-monthly.js` lines 178–179: same issue

---

## 6. Per-Dashboard Description Proposals

Proposed descriptions to add to each registry entry (for reference when implementing):

| ID | Proposed description |
|---|---|
| 01 | Cumulative spend day-by-day through the month, compared against the previous month. |
| 02 | Monthly spend by calendar month, this year vs the same period last year. |
| 03 | Daily spend through the week, this week vs last week. |
| 04 | Spend so far this quarter, day-by-day, compared against the same number of days in the previous quarter. |
| 05 | Monthly spend this year vs the same months last year. |
| 06 | Income, expenses, and net per calendar month over the last 12 months. |
| 07 | Weekly income and expenses over the last 8 weeks. |
| 08 | How your spending is split across categories this period. Click a segment to see the individual transactions. |
| 09 | How each category's spend has trended month by month over the selected period. |
| 10 | Your highest-spending categories this period vs the previous period. |
| 11 | Explore spending by major category, then drill into minor categories and individual transactions. |
| 12 | How your tagged spend is distributed. Click a segment to see transactions for that tag. |
| 13 | How each tag's spend has changed month by month. Click a point to see transactions for that month. |
| 14 | Total net worth (assets minus liabilities) over time. Click a point to see account balances at that date. |
| 15 | Current balance of every account, grouped by type. |
| 16 | Total asset value vs total liability value over time. |
| 17 | How your liabilities have changed over time, by liability account. |
| 18 | Income vs expenses by month. Click a bar to see the breakdown for that month. |
| 19 | Where money came in and went out each month, shown as a waterfall. Click a bar to see transactions. |
| 20 | What percentage of income is saved each month. |
| 21 | Where your income comes from. Click a segment to see transactions for that source. |
| 22 | Your highest-spend counterparties. Click a bar to see their monthly spend trend. |
| 23 | Counterparties you pay regularly. Click a row to see their full payment history. |
| 24 | How spend is distributed by country. Click a segment to see spend by city within that country. |
| 25 | How spend is distributed by city. Click a bar to see the individual transactions. |
| 26 | Repayment progress for each active loan. |
| 27 | Debt-to-income ratio trend and how it compares to common thresholds. |
| 28 | Spend in foreign currencies, converted to base currency. |

---

## Implementation Priority

1. **Bugs first** — Fix `_computeDailyTotalAssets` naming in 01 and 02 (accounts tab broken)
2. **Color** — Standardise previous-period color to `#f59e0b` in 01, 03, 10
3. **Descriptions** — Add description to registry + render in shell HTML
4. **Date range** — Restrict period options per dashboard; hide selector on 06 and 07
5. **Drilldown tables** — Shared `renderDrillTxTable` helper + consistent columns
