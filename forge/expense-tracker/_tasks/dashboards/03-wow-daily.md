# Dashboard 03 — Week-on-Week Daily Comparison

**Group:** Spending comparisons
**Chart type:** Line (2 series) + optional bar overlay
**Tabs:** Transactions | Accounts
**Period picker:** Week selector (this week / last week / custom)

---

## What it shows

Daily spend for the current week (Mon–Sun) vs the previous week on the same weekdays — a short-horizon view to catch overspending early in the week.

---

## Transactions tab

### Data source
- `state.transactions`, `transaction_type === 'money-out'`
- Period A: current ISO week (Monday → today)
- Period B: previous ISO week (Monday → Sunday)

### Computation
1. Find current week's Monday: `today - (today.getDay() + 6) % 7` days.
2. Period A: Monday → today (inclusive); days after today are `null`.
3. Period B: Monday-7 → Sunday-7.
4. For each period: build an array of 7 values (Mon–Sun), each = `sum toBase(amount)` of `money-out` txs on that date.
5. X labels: `['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']`.
6. This chart shows **daily spend** (not cumulative) — easier to spot heavy spend days.

### Chart spec
- **X axis:** Weekday labels Mon–Sun
- **Y axis:** Daily spend in GBP
- **Series 1:** Current week — colour `--teal`, solid line, filled (`fill: 'origin'`, low opacity)
- **Series 2:** Previous week — colour `--muted`, dashed line
- **Legend:** "W31 2026 (current)" | "W30 2026 (prev)"

### Chart.js config sketch
```js
{
  type: 'line',
  data: {
    labels: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
    datasets: [
      { label: currentWeekLabel, data: currentWeekDaily,
        borderColor: '#38bdf8', backgroundColor: 'rgba(56,189,248,0.1)', fill: 'origin', tension: 0.3 },
      { label: prevWeekLabel, data: prevWeekDaily,
        borderColor: '#94a3b8', borderDash: [4,4], tension: 0.3 },
    ]
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { position: 'bottom' } },
    scales: { x: { ticks: { maxRotation: 0 } }, y: { ticks: { callback: v => '£'+v } } }
  }
}
```

---

## Accounts tab

### Computation
- End-of-day total asset balance for each day of current week vs previous week.
- 7 data points per series (Mon–Sun).
- Previous week: use last known balance for days with no transactions.

### Chart spec
- Y axis = total asset balance
- Same weekday X axis

---

## Period picker presets shown
`this_week`, `last_week`, `custom`

---

## Mobile notes
- 7 data points fits comfortably on mobile — no label truncation needed
- Fill area helps distinguish series without relying on colour alone
- Canvas height: 240px (shorter — 7 points don't need as much vertical space)

---

## Edge cases
- Week starts on Monday (ISO week). Handle Sunday as end of week, not start.
- Current week on Monday: Period A has 1 point, rest are null.
- No transactions in a period: series is all zeros, show "No transactions this week" notice.
