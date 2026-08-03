# Dashboard 18 — Income vs Expenses Monthly

**Group:** Income & cash flow
**Chart type:** Grouped bar + net line overlay
**Tabs:** Transactions only
**Period picker:** `last_3`, `last_6`, `last_12`, `ytd`, `custom`

---

## What it shows

Monthly income and expense bars side by side, with a net line — same as Dashboard 06 but focused on the transactions tab with richer breakdown and a longer configurable window.

Note: Dashboard 06 is the "quick view" (fixed 12 months, both tabs). This dashboard is the "deep dive" version — transactions only, with configurable period and additional stat cards.

---

## Data source
- `state.transactions`
- Income: `transaction_type === 'money-in'`
- Expenses: `transaction_type === 'money-out'`
- Excludes `money-transfer` (internal account movements)

### Computation
1. Build month array for selected period.
2. For each month:
   - `income = sum toBase(amount)` of `money-in` txs
   - `expense = sum toBase(amount)` of `money-out` txs
   - `net = income − expense`
   - `savingsRate = net / income * 100` (shown in tooltip)
3. Three datasets: income bars, expense bars, net line.

### Chart spec
- Same structure as Dashboard 06, but:
  - Y axis: GBP
  - Tooltip also shows savings rate: "Net: £X (Y% savings rate)"

### Stat cards above chart
| Card | Value |
|---|---|
| Total income (period) | £X,XXX |
| Total expenses (period) | £X,XXX |
| Net (period) | £X,XXX |
| Avg monthly savings rate | X% |

### Chart.js config sketch
```js
{
  type: 'bar',
  data: {
    labels: monthLabels,
    datasets: [
      { label: 'Income',   type: 'bar',  data: incomeData,
        backgroundColor: 'rgba(52,211,153,0.8)', order: 2 },
      { label: 'Expenses', type: 'bar',  data: expenseData,
        backgroundColor: 'rgba(248,113,113,0.8)', order: 2 },
      { label: 'Net',      type: 'line', data: netData,
        borderColor: '#f59e0b', borderWidth: 2, pointRadius: 4, fill: false, tension: 0.3, order: 1 },
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

## Period picker presets shown
`last_3`, `last_6`, `last_12`, `ytd`, `custom`

---

## Mobile notes
- Stat cards: 2×2 grid on mobile
- Canvas height: 280px
- `maxTicksLimit: 4` on mobile for X axis
- Grouped bars may be tight on mobile for 12-month view — switch to stacked bars on mobile (detect screen width)

---

## Edge cases
- Month with zero income: income bar = 0, net = negative.
- Partial current month: label as `'Jul*'` with asterisk note "* partial month".
- INR/GBP mix: all converted to GBP.
