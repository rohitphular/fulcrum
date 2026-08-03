# Dashboard 04 — Quarter-to-Date Comparison

**Group:** Spending comparisons
**Chart type:** Line (2 series)
**Tabs:** Transactions | Accounts
**Period picker:** Quarter selector (this quarter / last quarter / custom)

---

## What it shows

Cumulative spend from the start of the current quarter to today, compared against the same number of days in the previous quarter — useful for spotting quarter-level budget drift.

---

## Transactions tab

### Data source
- `state.transactions`, `transaction_type === 'money-out'`
- Period A: current quarter start → today (days elapsed: D)
- Period B: previous quarter start → (previous quarter start + D days)

### Computation
1. Determine current quarter: Q1 = Jan–Mar, Q2 = Apr–Jun, Q3 = Jul–Sep, Q4 = Oct–Dec.
2. Period A start = first day of current quarter. Period A end = today. Days elapsed = D.
3. Period B start = first day of previous quarter. Period B end = Period B start + D days.
4. For each period: array of D+1 values (day 0 = 0, day 1 = spend on day 1, etc.), accumulated.
5. X labels: `['Day 1', 'Day 2', ..., 'Day D']`.
6. If today is, say, day 31 of the quarter, X has 31 labels.

### Chart spec
- **X axis:** Day index within quarter (Day 1, Day 2, …)
- **Y axis:** Cumulative spend (GBP)
- **Series 1:** Current QTD — colour `--teal`
- **Series 2:** Previous QTD (same day range) — colour `--amber`, dashed
- **Legend:** "Q3 2026 (to date)" | "Q2 2026 (same days)"

### Chart.js config sketch
```js
{
  type: 'line',
  data: {
    labels: dayIndexLabels,   // ['Day 1', 'Day 2', ...]
    datasets: [
      { label: currentQLabel, data: currentQtdCumulative, borderColor: '#38bdf8', tension: 0.3 },
      { label: prevQLabel,    data: prevQtdCumulative,    borderColor: '#f59e0b', tension: 0.3, borderDash: [4,4] },
    ]
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { position: 'bottom' } },
    scales: {
      x: { ticks: { maxRotation: 0, maxTicksLimit: 10 } },
      y: { ticks: { callback: v => '£'+v.toLocaleString() } }
    }
  }
}
```

---

## Accounts tab

### Computation
- Total asset balance per day, for D days into current quarter vs D days into previous quarter.
- Same replay-from-transactions approach.

---

## Period picker presets shown
`this_quarter`, `last_quarter`, `custom`

---

## Mobile notes
- X tick limit: 8 labels (every ~11 days for a 90-day quarter)
- Canvas height: 260px

---

## Edge cases
- Q1 of year 1 of data: no previous quarter exists — show notice, hide Period B series.
- Today is first day of quarter (D=1): single-point comparison — render with at least 2 points shown.
- Quarter boundary crossing in custom range: warn user that custom range should stay within one quarter.
