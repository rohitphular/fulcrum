# Dashboard 09 — Category Spending Trend (Stacked Bar)

**Group:** Category analysis
**Chart type:** Stacked bar
**Tabs:** None (transactions only)
**Period picker:** `last_3`, `last_6`, `last_12`, `ytd`, `custom`

---

## What it shows

Monthly stacked bars where each colour represents a major category — lets you see how the spending mix has shifted over time (e.g. Food growing while Transport shrinks).

---

## Data source
- `state.transactions`, `transaction_type === 'money-out'`
- Selected period grouped into calendar months

### Computation
1. Build month array for selected period (e.g. last 6 months = `['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul']`).
2. For each month, group `money-out` txs by `major_category` → sum `toBase(amount)`.
3. Collect all unique major categories across all months.
4. Build one dataset per major category: `[value_for_month1, value_for_month2, ...]` (0 if no spend that month).
5. Sort datasets by total descending so largest categories are at the bottom of the stack.

### Chart spec
- **X axis:** Month labels
- **Y axis:** Total spend (GBP) — stacked
- **Datasets:** One per major category, each a different colour from the fixed palette
- **Legend:** Below, showing all categories

### Chart.js config sketch
```js
{
  type: 'bar',
  data: {
    labels: monthLabels,
    datasets: majorCategories.map((cat, i) => ({
      label: cat,
      data: monthlyData[cat],
      backgroundColor: PALETTE[i % PALETTE.length],
      stack: 'spend',
    }))
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { position: 'bottom' } },
    scales: {
      x: { stacked: true, ticks: { maxRotation: 0, maxTicksLimit: 6 } },
      y: { stacked: true, ticks: { callback: v => '£'+v.toLocaleString() } }
    }
  }
}
```

---

## Mobile notes
- Stacked bars can be tall — canvas height: 300px
- Legend may have many entries — use a scrollable legend container below the canvas if > 6 categories
- Abbreviated month labels (`Jan`, `Feb`) — 3 chars max
- `maxTicksLimit: 4` on mobile to avoid crowding

---

## Edge cases
- Only 1 month of data: single bar rendered — still valid.
- Too many minor categories: only major categories stacked (minor detail in tooltip).
- A category present in some months but not others: `0` for missing months (not `null`, to keep stack continuous).
