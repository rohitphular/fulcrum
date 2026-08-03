# Dashboard 12 — Tag Spending Breakdown (Donut)

**File:** `sections/dashboards/12-tag-pie.js`
**Group:** Categories
**Chart type:** Doughnut + custom HTML legend + ranked table
**Tabs:** None (no tab strip)

---

## What it shows

Proportional spend attributed to each tag for the selected period. Useful for tracking shared-spend tags (`rohit`, `reena`) or purpose tags (`reimbursable`, `work`).

---

## Key difference from 08 (category donut)

**Full attribution, not split.** Each tag on a transaction receives the **full transaction amount**. A transaction tagged `rohit;reena` contributes its full amount to both `rohit` and `reena`. The donut therefore shows attributed spend, not a partitioned total — segment amounts can sum to more than total spend.

Centre text shows **number of distinct tags**, not total spend.

---

## Data flow

Uses `options.txs` (pre-filtered by coordinator). Filters to `money-out` only.

---

## Tag aggregation

`_aggregateTags(moneyOut)`:
1. `splitTags(moneyOut)` → `{ tag, tx }[]` — one entry per tag per transaction.
2. Normalises: `tag.toLowerCase().trim()`.
3. Deduplicates per tag per transaction (if the same tag appears twice in one tx's tag string, it counts once).
4. Groups by tag: collects all `tx` objects. `sumAmountBase(txs)` = full amount per tag.
5. Returns `[{ label, amount, count }]` sorted by amount desc.

Untagged transactions (blank `tags` field) are excluded.

---

## Segment capping

Same as 08: top 7 named + remaining merged into `'Other tags'`.

---

## Chart

```js
{
  type: 'doughnut',
  cutout: '55%',                  // slightly less hollow than 08 (60%)
  plugins: {
    legend: { display: false },   // custom HTML legend
    tooltip: { label: ctx => ` £450 — 42 tx` },
  },
}
```

Centre text: tag count + `"tags"` label (absolute-positioned overlay).

---

## Custom legend (HTML)

2-column grid. Each item: `[swatch] tag-name ... £total  N tx`.

---

## Ranked table

Full `allRows` (not capped at MAX_SEGMENTS — shows all tags):

| Column | Value |
|---|---|
| Tag | Normalised tag name |
| Txs | Transaction count for that tag |
| Total | `sumAmountBase` — full attribution |
| Avg | `total / count` |

---

## Stat cards (2)

| Card | Value |
|---|---|
| Distinct tags | `allRows.length` (before segment capping) |
| Tagged txs | `allRows.reduce(count)` / of `moneyOut.length` total expenses |

---

## Shared utilities used

| Utility | Source |
|---|---|
| `splitTags` | `dashboard-utils.js` |
| `sumAmountBase` | `dashboard-utils.js` |
| `getCssColors`, `buildPalette` | `dashboard-utils.js` |

---

## Edge cases

| Scenario | Behaviour |
|---|---|
| No tagged transactions | `chart-empty` "No tagged transactions in this period."; returns `null` |
| All txs have the same tag | Full circle, one segment, legend has one item |
| Mixed-case tags (`Rohit` / `rohit`) | Normalised to lowercase — merged into one segment |
| Tag with only whitespace | Filtered out (empty after trim) |
| > 8 tags | Top 7 + `'Other tags'`; table still shows all tags |
