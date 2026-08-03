# Dashboard 06 — Last 12 Months Bar

**Group:** Spending comparisons
**Chart type:** Grouped bar (income | expense) + net line overlay
**Tabs:** Transactions | Accounts
**Period picker:** Not applicable (fixed 12-month window ending today)

---

## What it shows

Monthly income vs expense bars for the last 12 calendar months, with a net (income − expense) line overlay — the clearest macro view of cash flow health over a full year.

---

## Transactions tab

### Data source
- `state.transactions`, all types
- Window: last 12 complete calendar months + current partial month

### Computation
1. Build array of 12 month keys: `['Aug 2025', 'Sep 2025', ..., 'Jul 2026']` (trailing 12 from current month).
2. For each month:
   - `income = sum toBase(amount)` for `money-in` txs in that month
   - `expense = sum toBase(amount)` for `money-out` txs in that month
   - `net = income - expense`
3. Three datasets: income bars, expense bars, net line.

### Chart spec
- **X axis:** Month labels (12 entries)
- **Y axis:** Amount (GBP), shared axis for bars and line
- **Dataset 1:** Income — bar, colour `--teal` / green (`rgba(52,211,153,0.8)`)
- **Dataset 2:** Expense — bar, colour `--ember` / red (`rgba(248,113,113,0.8)`)
- **Dataset 3:** Net — line, colour `--amber`, `type: 'line'` (mixed chart), no fill, `yAxisID: 'y'`
- **Legend:** "Income" | "Expenses" | "Net"

### Chart.js config sketch (mixed chart)
```js
{
  type: 'bar',
  data: {
    labels: monthLabels,
    datasets: [
      { label: 'Income',   data: incomeData,  backgroundColor: 'rgba(52,211,153,0.8)', order: 2 },
      { label: 'Expenses', data: expenseData, backgroundColor: 'rgba(248,113,113,0.8)', order: 2 },
      { label: 'Net',      data: netData, type: 'line', borderColor: '#f59e0b',
        borderWidth: 2, pointRadius: 4, fill: false, tension: 0.3, order: 1 },
    ]
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { position: 'bottom' } },
    scales: {
      x: { ticks: { maxRotation: 0, maxTicksLimit: 6 } },
      y: { ticks: { callback: v => '£'+v.toLocaleString() } }
    }
  }
}
```

---

## Accounts tab

### Computation
- Month-end balance for each of the 12 months, summed across all asset accounts.
- Single bar per month (total asset value).
- Optionally: stacked bar by account sub_type (current, savings, cash).

### Chart spec
- Stacked bar chart: each bar = total assets, coloured segments per sub_type
- X: month, Y: balance

---

## Period picker presets shown
None — fixed to last 12 months. A "year" selector could be offered to shift the window.

---

## Mobile notes
- Show 6 months of labels by default on mobile (scroll or abbreviate)
- `maxTicksLimit: 6` on X axis
- Canvas height: 280px (taller — grouped bars need more vertical room)
- On very small screens: consider toggling to a table summary below the chart

---

## Edge cases
- Less than 12 months of data: show only available months, pad left with zeros or omit.
- Mixed currencies: all converted to GBP via rateMap; txs with no matching rate excluded.
- Current month is partial: expense/income bars are partial — add "(partial)" to current month label.
