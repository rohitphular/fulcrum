# Dashboard 20 — Savings Rate Over Time

**Group:** Income & cash flow
**Chart type:** Line + bar combo
**Tabs:** Transactions only
**Period picker:** `last_3`, `last_6`, `last_12`, `ytd`, `custom`

---

## What it shows

Monthly savings rate as a percentage line chart, with income and expense bars in background for context. Savings rate = (income − expenses) / income × 100. Helps track financial health trend.

---

## Data source
- `state.transactions`
- Income: `transaction_type === 'money-in'`
- Expenses: `transaction_type === 'money-out'`
- Excludes `money-transfer`

### Computation
1. For each month in selected period:
   - `income = sum toBase(amount)` of `money-in`
   - `expense = sum toBase(amount)` of `money-out`
   - `net = income − expense`
   - `rate = income > 0 ? (net / income * 100) : null`
2. Rate can be negative (spent more than earned).
3. Stat cards: average savings rate, highest month, lowest month, best streak (consecutive positive months).

### Chart spec
- **Type:** Mixed (bar + line)
- **X axis:** Month labels
- **Y axis left:** GBP (income / expense bars)
- **Y axis right:** % (savings rate line)
- Income bars: green `rgba(52,211,153,0.5)`
- Expense bars: red `rgba(248,113,113,0.5)`
- Savings rate line: `--amber`, bold, `pointRadius: 5`
- Zero line on Y right axis clearly marked

### Chart.js config sketch
```js
{
  type: 'bar',
  data: {
    labels: monthLabels,
    datasets: [
      { label: 'Income',   type: 'bar',  data: incomeData,  backgroundColor: 'rgba(52,211,153,0.5)', yAxisID: 'y', order: 2 },
      { label: 'Expenses', type: 'bar',  data: expenseData, backgroundColor: 'rgba(248,113,113,0.5)', yAxisID: 'y', order: 2 },
      { label: 'Savings %', type: 'line', data: rateData,
        borderColor: '#f59e0b', borderWidth: 2.5, pointRadius: 5, fill: false, tension: 0.3,
        yAxisID: 'y2', order: 1 },
    ]
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { position: 'bottom' } },
    scales: {
      y:  { position: 'left',  ticks: { callback: v => '£'+v.toLocaleString() } },
      y2: { position: 'right', grid: { drawOnChartArea: false },
             ticks: { callback: v => v+'%' } }
    }
  }
}
```

### Stat cards
| Card | Value |
|---|---|
| Avg savings rate | X% |
| Best month | Month YYYY (X%) |
| Worst month | Month YYYY (X%) |
| Positive streak | N consecutive months |

---

## Period picker presets shown
`last_3`, `last_6`, `last_12`, `ytd`, `custom`

---

## Mobile notes
- Dual Y axis may be confusing on small screens — simplify to savings rate line only on mobile (hide income/expense bars), show those in a separate toggle below
- Canvas height: 280px
- Stat cards: 2×2 grid

---

## Edge cases
- Month with zero income: rate = null, point gap shown in line chart (`spanGaps: false`).
- Negative savings rate: line goes below 0 — zero line on Y2 axis guides eye.
- Partial current month: asterisk on label, note below.
