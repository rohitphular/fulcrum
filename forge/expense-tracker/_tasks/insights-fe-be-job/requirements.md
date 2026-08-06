# Insights — Schema & Architecture Redesign

## Problems with the current design

| Problem | Impact |
|---|---|
| `chart_variant` column — only `d00` uses it, all others write `''` | Forced `defaultVariant: '30d'` hack on FE; query always failed for `d00` |
| `derived_from = 'default'` — meaningless placeholder | Same problem as `''`; not honest about what the data represents |
| `pcChart` field in JS `INSIGHTS` array | FE hardcodes rendering hints; data doesn't describe itself |
| `INSIGHTS` array hardcodes periods, derived_from, labels, groups | Adding or changing an insight requires editing two places (Python + JS); desync is inevitable |
| Period key names (`last_3`, `last_6`) — opaque | Not clear whether "3" means days, weeks, or months |

---

## Design principles

- **Single source of truth.** The job writes what it computes. The FE reads what's available. No duplication between Python and JS.
- **No empty strings. No `'default'`.** Every dimension is explicit and meaningful.
- **`chart_type` is purely visual.** `line`, `bar`, `stacked`, `hbar`, `pie`, `custom` — tells the FE which renderer to use. Not a user-facing dropdown.
- **`derived_from` is the data-perspective axis.** Which slice or source of data this row represents. This IS user-facing (View dropdown).
- **Uniform query key for all 28 insights:** `(insight_id, period_key, derived_from)`.
- **UI is data-driven.** Insight list, period options, and view options all come from the API — no hardcoding in JS except display labels and renderer module paths.

---

## Sheets

### New: `insights` sheet

Written by the job at the **start of every run** (before computing anything), so the catalogue is always complete even if individual insight computations fail.

| Column | Type | Example |
|---|---|---|
| `insight_id` | string | `00-earn-burn-rate` |
| `label` | string | `Income, Expense & Savings` |
| `group` | string | `Cash flow` |
| `description` | string | `Trailing-average income, expense, and savings rate per day…` |

One row per insight. Overwritten on every job run.

### Updated: `computed_insights` sheet

| Column | Type | Notes |
|---|---|---|
| `computed_at` | ISO datetime | When the job ran |
| `insight_id` | string | e.g. `00-earn-burn-rate` |
| `period_key` | string | e.g. `last_30d`, `prev_month` — never empty |
| `derived_from` | string | e.g. `all`, `transactions`, `income_vs_expenses` — never empty, never `'default'` |
| `chart_type` | string | Visual renderer: `line` `bar` `stacked` `hbar` `pie` `custom` — never empty |
| `insight_payload` | JSON string | `{ stat_cards, chart, meta }` |
| `expert_commentary` | string | Reserved — always `''` for now |

`chart_variant` column is **dropped**.

Unique row identity: `(insight_id, period_key, derived_from)`. `chart_type` is a property of that row, not a key dimension.

---

## Period keys

Standardised to explicit day/calendar names. Cryptic `last_3`, `last_6`, `last_12` are retired.

| Key | Meaning |
|---|---|
| `last_7d` | Rolling 7 days from today |
| `last_14d` | Rolling 14 days |
| `last_30d` | Rolling 30 days |
| `last_60d` | Rolling 60 days |
| `last_90d` | Rolling 90 days |
| `last_180d` | Rolling 180 days |
| `last_365d` | Rolling 365 days |
| `prev_month` | Complete previous calendar month |
| `prev_quarter` | Complete previous calendar quarter |
| `prev_year` | Complete previous calendar year |
| `ytd` | 1 Jan to today |

`custom` is FE-only — never pre-computed, triggers local renderer always.

Each insight declares the subset of period keys that are meaningful for it. Not all insights get all periods — a WoW-daily insight with `last_365d` is nonsensical and wastes job time.

---

## `derived_from` values

| Value | Meaning |
|---|---|
| `all` | Single-view insight — no per-source filter; computed from all available raw data |
| `transactions` | Cash-flow perspective: money in/out via transaction records |
| `accounts` | Balance perspective: account snapshot data |
| `income_vs_expenses` | `d00` view: income rate vs expense rate (30d trailing avg) |
| `income_vs_savings` | `d00` view: income rate vs savings rate (30d trailing avg) |

---

## `chart_type` values

A rendering property of each row. Read from the API response — the FE uses it to select the renderer. **Not a user-facing dropdown.**

| Value | Renderer |
|---|---|
| `line` | Chart.js line chart — `_renderFromPayload` |
| `bar` | Chart.js grouped bar — `_renderFromPayload` |
| `stacked` | Chart.js stacked bar — `_renderFromPayload` |
| `hbar` | Chart.js horizontal bar — `_renderFromPayload` |
| `pie` | Chart.js pie/doughnut — `_renderFromPayload` |
| `custom` | Bespoke local renderer — fall through, pass payload as option |

---

## Full insight matrix

| `insight_id` | `derived_from` values | `chart_type` |
|---|---|---|
| `00-earn-burn-rate` | `income_vs_expenses`, `income_vs_savings` | `line` |
| `01-mom-cumulative` | `transactions`, `accounts` | `line` |
| `02-yoy-monthly` | `transactions`, `accounts` | `bar` |
| `03-wow-daily` | `transactions`, `accounts` | `line` |
| `04-qtd-comparison` | `transactions`, `accounts` | `line` |
| `05-ytd-comparison` | `transactions`, `accounts` | `bar` |
| `06-last-12-months` | `transactions`, `accounts` | `stacked` |
| `07-last-8-weeks` | `all` | `bar` |
| `08-category-pie` | `all` | `pie` |
| `09-category-trend` | `all` | `stacked` |
| `10-top-categories` | `all` | `hbar` |
| `11-category-drilldown` | `all` | `custom` |
| `12-tag-pie` | `all` | `pie` |
| `13-tag-trend` | `all` | `line` |
| `14-networth-trend` | `all` | `line` |
| `15-account-balances` | `all` | `custom` |
| `16-asset-vs-liability` | `all` | `stacked` |
| `17-liability-paydown` | `all` | `line` |
| `19-cashflow-waterfall` | `all` | `stacked` |
| `20-savings-rate` | `all` | `line` |
| `21-income-sources` | `all` | `stacked` |
| `22-top-counterparties` | `all` | `hbar` |
| `23-recurring-payments` | `all` | `custom` |
| `24-spend-by-country` | `all` | `hbar` |
| `25-spend-by-city` | `all` | `hbar` |
| `26-loan-progress` | `all` | `line` |
| `27-debt-to-income` | `all` | `line` |
| `28-forex-spend` | `all` | `bar` |

---

## `d00` earn-burn-rate specifics

`chart_variants = ['7d', '14d', '30d', '90d']` is dropped. The insight is reframed as two named data perspectives, both using a fixed `window_days = 30`:

- `income_vs_expenses` → datasets: income rate + expense rate
- `income_vs_savings` → datasets: income rate + savings rate

Stat cards (Savings/day, Income/day, Expense/day, Savings rate) are the same on both views.

The window-chip selector (7d/14d/30d/90d) remains in the **Live renderer only**. It does not affect pre-computed rows.

---

## Frontend architecture — data-driven UI

### Three API calls, chained

```
1. get_insight_catalogue          → populates Insight dropdown
        ↓ user selects insight
2. get_insight_options?insight_id → populates Period + View dropdowns
        ↓ user selects period + view (or defaults to first available)
3. get_computed_insights?insight_id&period_key&derived_from → renders chart
```

### What the FE reads from the API

| Data | Source |
|---|---|
| List of insights (id, label, group, description) | `get_insight_catalogue` |
| Available period_keys for selected insight | `get_insight_options` |
| Available derived_from (views) for selected insight | `get_insight_options` |
| chart_type for rendering | `get_computed_insights` response |
| Payload (stat_cards, chart, meta) | `get_computed_insights` response |

### What stays hardcoded in the FE

These are display and code concerns — not data. They do not belong in the sheet.

| Concern | Where | Example |
|---|---|---|
| Period key display labels | Small JS map | `last_30d → 'Last 30 days'` |
| Period key sort order | Small JS array | `['last_7d', 'last_14d', 'last_30d', ...]` |
| `derived_from` display labels | Small JS map | `income_vs_expenses → 'Income vs Expenses'` |
| Renderer module map (Live mode) | Small JS map | `'00-earn-burn-rate': () => import('./insights/00-earn-burn-rate.js')` |

### JS `INSIGHTS` array — retired

The large `INSIGHTS` array (28 objects with hardcoded periods, tabs, pcChart, labels, groups) is **deleted**. Replaced by:

1. **`PERIOD_LABELS`** — `{ last_7d: 'Last 7 days', last_30d: 'Last 30 days', ... }`
2. **`PERIOD_ORDER`** — `['last_7d', 'last_14d', 'last_30d', 'last_60d', 'last_90d', 'last_180d', 'last_365d', 'prev_month', 'prev_quarter', 'prev_year', 'ytd']`
3. **`VIEW_LABELS`** — `{ all: 'All', transactions: 'Transactions', accounts: 'Accounts', income_vs_expenses: 'Income vs Expenses', income_vs_savings: 'Income vs Savings' }`
4. **`RENDERERS`** — `{ 'insight-id': () => import('./insights/d00.js'), ... }` — used in Live mode only

### State keys

| Key | Type | Notes |
|---|---|---|
| `insightId` | string | Selected insight ID |
| `insightPeriod` | string | Selected period_key |
| `insightView` | string | Selected derived_from value (replaces `insightTab`) |
| `insightMode` | string | `'precomputed'` or `'live'` |
| `insightCustomFrom` | string | Custom date range start (Live only) |
| `insightCustomTo` | string | Custom date range end (Live only) |
| `insightChartInstance` | object | Active Chart.js instance |
| `insightCatalogue` | array | Cached `get_insight_catalogue` response (session-lived) |
| `insightOptions` | object | Cached `get_insight_options` per insight_id (session-lived) |

### Rendering flow

**Pre-Computed mode:**
```
_renderActiveInsight()
  → derivedFrom = state.insightView
  → call get_computed_insights(insight_id, period_key, derived_from)
  → if ok:
      chart_type = response.chart_type
      if chart_type === 'custom' → load local renderer, pass precomputed.data as option
      else → _renderFromPayload(container, payload, chart_type, sym)
      → _appendComputedAt(inner, computed_at, false)
  → if !ok:
      show "not computed" message
```

**Live mode:**
```
_renderActiveInsight()
  → load RENDERERS[insight_id] module
  → renderer.render('insightChart', { txs, accounts, from, to, sym, view: state.insightView, period: state.insightPeriod })
  → _appendComputedAt(inner, new Date().toISOString(), true)
```

### Caching strategy

- `insightCatalogue` — fetched once per session, stored in `state.insightCatalogue`; cleared on hard refresh only
- `insightOptions` — fetched once per `insight_id` per session, stored in `state.insightOptions[insight_id]`; stale after job re-run but acceptable for a personal app

---

## New GAS actions

### `get_insight_catalogue`

Reads the `insights` sheet. Returns:

```json
{
  "ok": true,
  "insights": [
    { "insight_id": "00-earn-burn-rate", "label": "Income, Expense & Savings", "group": "Cash flow", "description": "..." },
    ...
  ]
}
```

Ordered by `insight_id` (alphabetical). Grouping into UI sections is the FE's responsibility.

### `get_insight_options`

Reads `computed_insights`, returns distinct available combinations for one insight.

Params: `insight_id` (required)

```json
{
  "ok": true,
  "insight_id": "00-earn-burn-rate",
  "period_keys": ["last_30d", "last_90d", "last_180d", "last_365d", "ytd", "prev_year"],
  "views": ["income_vs_expenses", "income_vs_savings"]
}
```

### `get_computed_insights` (updated)

Params: `insight_id`, `period_key`, `derived_from` — `chart_variant` param removed.

```json
{
  "ok": true,
  "computed_at": "2026-08-06T17:14:55Z",
  "chart_type": "line",
  "commentary": "",
  "data": { "stat_cards": [...], "chart": {...}, "meta": {...} }
}
```

---

## Changes required

### Python — `base_insight.py`

- Remove `chart_variants` attribute
- Replace `derived_from = ['default']` default with no default — every subclass must declare explicitly
- Add `chart_type: str` — one of `line bar stacked hbar pie custom`
- Add `label: str`, `group: str`, `description: str` — class-level metadata for the catalogue
- `compute()` signature: `compute(self, raw, from_date, to_date, derived_from) -> dict`

### Python — all 28 `d*.py` insight classes

- Remove `chart_variants` attribute
- Replace `derived_from = ['default']` → `derived_from = ['all']` (22 insights)
- `d00`: `derived_from = ['income_vs_expenses', 'income_vs_savings']`; drop smoothing-window branching; use fixed `window_days = 30`; branch on `derived_from` to return correct dataset pair
- Add `chart_type`, `label`, `group`, `description` to each class
- Rename period keys to new convention: `last_3` → `last_90d` etc.

### Python — `job.py`

- **At run start**: write `insights` sheet from `ALL_INSIGHTS` class metadata (one row per insight)
- Remove `chart_variants` loop — combo is `(insight, period_key, derived_from)` only
- `chart_type` written from `insight.chart_type` (class constant, not a loop dimension)
- `HEADERS`: replace `chart_variant` → `chart_type`
- Written row: `[computed_at, insight_id, period_key, derived_from, chart_type, json_payload, '']`

### Python — `period_utils.py`

- Add new period keys: `last_7d`, `last_14d`, `last_30d`, `last_60d`, `last_90d`, `last_180d`, `last_365d`, `prev_month`, `prev_quarter`, `prev_year`
- Retire `last_3`, `last_6`, `last_12`, `this_month`, `last_month`, `this_week`, `last_week`, `last_7`, `this_quarter`, `last_quarter`, `last_year`

### GAS — `app-config.gs`

- Add `INSIGHTS_SHEET = 'insights'`
- `COMPUTED_INSIGHTS_COLUMNS`: replace `'chart_variant'` → `'chart_type'`
- Add `INSIGHTS_COLUMNS = ['insight_id', 'label', 'group', 'description']`

### GAS — `insights-core.gs`

- Add `getInsightCatalogue()` — reads `insights` sheet, returns ordered list
- Add `getInsightOptions(params)` — reads `computed_insights`, returns distinct period_keys + views for one insight_id
- Update `getComputedInsights(params)`: remove `chart_variant` param and filter; filter on `(insight_id, period_key, derived_from)`; return `chart_type` in response

### GAS — `app-router.gs`

- Add routes: `get_insight_catalogue` → `getInsightCatalogue()`, `get_insight_options` → `getInsightOptions(e.parameter)`

### Frontend — `api.js`

- Add `getInsightCatalogue`, `getInsightOptions`
- Update `getComputedInsights` — remove `chart_variant` param

### Frontend — `state.js`

- Replace `insightTab` → `insightView`
- Add `insightCatalogue: null`, `insightOptions: {}` (session caches)

### Frontend — `insights.js`

- Delete `INSIGHTS` array entirely
- Add `PERIOD_LABELS`, `PERIOD_ORDER`, `VIEW_LABELS`, `RENDERERS` maps
- On section init: fetch `get_insight_catalogue` if `state.insightCatalogue` is null; populate insight dropdown
- On insight select: fetch `get_insight_options` if not cached; populate period + view dropdowns; default to first available each
- `_renderActiveInsight()`: use `state.insightView` as `derived_from`; read `chart_type` from API response; dispatch to `_renderFromPayload` or local renderer accordingly
- Remove all `dash.pcChart`, `dash.tabs`, `dash.defaultVariant` references

### Frontend — CSS

- `.insight-view-select` — same styling as `.insight-period-select`

---

## Migration

1. Delete `computed_insights` sheet tab and `insights` sheet tab (both rebuilt by job)
2. Re-run job: `python runner.py --job insights`
3. Redeploy GAS: `make api-deploy`

No backward compatibility required — dev environment only.

---

## Non-goals for this iteration

- `compared_with` / comparison period axis — deferred, noted as future column in `computed_insights`
- AI expert commentary — `expert_commentary` column stays reserved but empty
- Multiple `chart_type` values per insight (only `d00` has multiple `derived_from` views for now)
