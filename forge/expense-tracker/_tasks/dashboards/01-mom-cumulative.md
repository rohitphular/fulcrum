# Dashboard 01 — Month-on-Month Daily Cumulative

**Group:** Spending comparisons
**Chart type:** Line (2 series)
**Tabs:** Transactions | Accounts
**Period picker:** Month selector only (this month / last month / any past month via custom)

---

## What it shows

Running daily total spend for the current month vs the previous month, so you can see whether you're tracking ahead or behind last month at the same point in the month.

---

## Transactions tab

### Data source
- `state.transactions` filtered to `transaction_type === 'money-out'`
- Period A: current month (1st → today)
- Period B: previous month (1st → last day)

### Computation
1. Determine Period A bounds: `from = first day of current month`, `to = today`.
2. Determine Period B bounds: `from = first day of previous month`, `to = last day of previous month`.
3. Filter `money-out` transactions for each period.
4. For each period, build an array of days `[1, 2, ..., N]` where N = days in that month.
5. For each day d in period A: sum `toBase(amount)` of all txs on that calendar day → daily spend array.
6. Accumulate: `cumulative[d] = cumulative[d-1] + daily[d]`.
7. Period B: same, up to last day of that month.
8. X axis labels: `['1', '2', ..., '31']` (max of the two month lengths).
9. Period A series stops at today's day-of-month; remaining days are `null` (Chart.js renders gap).

### Chart spec
- **X axis:** Day of month (1–31)
- **Y axis:** Cumulative spend in quote currency (GBP)
- **Series 1:** Current month — colour `--teal`
- **Series 2:** Previous month — colour `--muted`, dashed line (`borderDash: [4, 4]`)
- **Legend:** "Jul 2026" | "Jun 2026" (dynamic month names)
- **Tooltip:** shows both series values for the hovered day

### Chart.js config sketch
```js
{
  type: 'line',
  data: {
    labels: dayLabels,          // ['1','2',...,'31']
    datasets: [
      { label: currentMonthLabel, data: currentCumulative, borderColor: C.teal,  tension: 0.3, pointRadius: 3 },
      { label: prevMonthLabel,    data: prevCumulative,    borderColor: C.muted, tension: 0.3, pointRadius: 3, borderDash: [4,4] },
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { position: 'bottom' } },
    scales: {
      x: { ticks: { maxRotation: 0, font: { size: 12 } } },
      y: { ticks: { callback: v => '£' + v.toLocaleString() } }
    }
  }
}
```

---

## Accounts tab

### Data source
- `state.accounts` (all asset accounts)
- `state.transactions` (all types, to reconstruct daily balances)

### Computation
1. For each asset account, compute end-of-day balance for each day in both months by replaying transactions chronologically.
2. Sum all asset account balances per day → total asset value.
3. Plot total asset value day-by-day for Period A and Period B.

### Chart spec
- Same structure as Transactions tab but Y axis = total asset balance
- Series labels: "Assets Jul 2026" | "Assets Jun 2026"

---

## Period picker presets shown
`this_month`, `last_month`, `custom`

---

## Mobile notes
- Canvas height: 260px
- Legend at bottom
- Tooltip shows on tap, persists until next tap
- Day labels: show every 5th label (`maxTicksLimit: 7`)

---

## Edge cases
- If current month has no transactions: Period A series is all zeros or empty — show "No data yet" overlay.
- If previous month has no transactions: Period B line is hidden, show notice.
- Transactions in foreign currency with no rate: excluded from sum.
