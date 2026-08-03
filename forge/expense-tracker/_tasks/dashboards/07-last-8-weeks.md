# Dashboard 07 — Last 8 Weeks Bar

**Group:** Spending comparisons
**Chart type:** Grouped bar (income | expense)
**Tabs:** Transactions only
**Period picker:** Not applicable (fixed 8-week window)

---

## What it shows

Weekly income vs expense bars for the last 8 ISO weeks — a medium-horizon view that sits between the daily WoW chart and the monthly 12-month chart.

---

## Data source
- `state.transactions`, all types
- Window: last 8 complete ISO weeks (Mon–Sun) + current partial week

### Computation
1. Find the Monday of the current ISO week.
2. Build 8 week-start dates going backwards: `[Mon-7wks, Mon-6wks, ..., Mon-0wks]`.
3. For each week:
   - `income = sum toBase(amount)` for `money-in` txs in that Mon–Sun range
   - `expense = sum toBase(amount)` for `money-out` txs in that range
4. X label for each week: `'W27\nJul 7'` (ISO week number + start date).

### Chart spec
- **X axis:** Week labels (`W27`, `W28`, …)
- **Y axis:** Amount (GBP)
- **Dataset 1:** Income — bar, green
- **Dataset 2:** Expense — bar, red
- **Legend:** "Income" | "Expenses"

### Chart.js config sketch
```js
{
  type: 'bar',
  data: {
    labels: weekLabels,    // ['W24','W25','W26','W27','W28','W29','W30','W31']
    datasets: [
      { label: 'Income',   data: incomeByWeek,  backgroundColor: 'rgba(52,211,153,0.8)' },
      { label: 'Expenses', data: expenseByWeek, backgroundColor: 'rgba(248,113,113,0.8)' },
    ]
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { position: 'bottom' } },
    scales: {
      x: { ticks: { maxRotation: 0 } },
      y: { ticks: { callback: v => '£'+v.toLocaleString() } }
    }
  }
}
```

---

## Mobile notes
- 8 bars fits comfortably on mobile
- Use abbreviated week labels: `'W31'` only (no date subtitle on mobile)
- Canvas height: 240px

---

## Edge cases
- Less than 8 weeks of data: show available weeks only.
- Current week is partial: label as `'W31 (now)'`.
- No income in a week: income bar = 0, still rendered for completeness.
