# Dashboard 22 — Top Counterparties

**Group:** Spending analysis
**Chart type:** Horizontal bar
**Tabs:** Transactions only
**Period picker:** `this_month`, `last_month`, `last_3`, `last_6`, `ytd`, `custom`

---

## What it shows

Top merchants/counterparties by spend — who you spend the most money with. Horizontal bars sorted largest to smallest. Helps identify dominant spend relationships.

---

## Data source
- `state.transactions` where `transaction_type === 'money-out'`

### Computation
1. Filter `money-out` transactions in selected period.
2. Group by `counterparty` (case-insensitive, trimmed).
3. Sum `toBase(amount)` per counterparty.
4. Sort descending by total spend.
5. Top N = 15 (configurable via a filter pill: Top 10 / Top 15 / Top 20).
6. Each bar: label = counterparty name, value = total spend in GBP.
7. Additional data per row: count of transactions, avg transaction amount.

### Drill-down (tap on bar)
Tapping a counterparty bar shows a small details panel below the chart:
- List of transactions with this counterparty in the period (date | amount | category)
- MoM comparison: this period spend vs previous equivalent period

---

## Chart spec
- **Type:** Horizontal bar
- **Y axis:** Counterparty names (truncated to 22 chars)
- **X axis:** GBP spend
- **Colour:** All bars `--teal` by default; tapped bar highlights with `--ember`
- **No legend**

### Chart.js config sketch
```js
{
  type: 'bar',
  data: {
    labels: counterpartyNames,
    datasets: [{
      data: spendAmounts,
      backgroundColor: barColors, // teal for all, ember for selected
      borderRadius: 4,
    }]
  },
  options: {
    indexAxis: 'y',
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false },
      tooltip: {
        callbacks: {
          label: ctx => `£${ctx.raw.toLocaleString()} (${txCounts[ctx.dataIndex]} txns)`
        }
      }
    },
    scales: {
      x: { ticks: { callback: v => '£'+v.toLocaleString() } },
      y: { ticks: { font: { size: 12 } } }
    },
    onClick: (evt, elements) => { /* show drill-down panel */ }
  }
}
```

### Dynamic chart height
`height = Math.max(300, N * 44)` — 44px per counterparty row.

---

## Filter pills
`Top 10` | `Top 15` | `Top 20` — shown above chart, toggle on tap.

---

## Period picker presets shown
`this_month`, `last_month`, `last_3`, `last_6`, `ytd`, `custom`

---

## Mobile notes
- Horizontal bars are natively mobile-friendly — no rotation needed
- Counterparty names: clip with ellipsis at 22 chars, full name in tooltip
- Drill-down panel: slides in below chart with smooth CSS transition, 44px row height for transactions
- Filter pills: horizontally scrollable on small screens

---

## Edge cases
- Counterparty = blank: group as "Unknown merchant".
- Same counterparty with slight name variations (e.g. "AMAZON" vs "Amazon"): case-insensitive normalisation handles this.
- All spend is one counterparty: single bar shown, no special handling.
- Money-transfer txs: excluded (internal movements, not real spending).
