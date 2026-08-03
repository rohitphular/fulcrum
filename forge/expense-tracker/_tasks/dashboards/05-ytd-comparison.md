# Dashboard 05 — Year-to-Date Comparison

**Group:** Spending comparisons
**Chart type:** Line (2 series)
**Tabs:** Transactions | Accounts
**Period picker:** Year selector (this year / last year)

---

## What it shows

Cumulative spend from January 1st to today for the current year vs the same period last year — the big-picture view of whether annual spending is tracking up or down.

---

## Transactions tab

### Data source
- `state.transactions`, `transaction_type === 'money-out'`
- Period A: Jan 1 current year → today
- Period B: Jan 1 previous year → same date in previous year (e.g. if today is Aug 1 2026, compare Jan 1–Aug 1 2025)

### Computation
1. Period A: `from = Jan 1 current year`, `to = today`. N = days elapsed in year.
2. Period B: `from = Jan 1 previous year`, `to = Jan 1 previous year + N days`.
3. Group transactions by month (not day — too many data points for a year view).
4. Build monthly cumulative: `['Jan', 'Feb', ..., current month]`.
5. Each bar = cumulative sum up to end of that month.
6. Period A: last month capped at today's partial month total.
7. Period B: all months fully counted.

### Chart spec
- **X axis:** Month abbreviations (Jan, Feb, …, up to current month)
- **Y axis:** Cumulative spend (GBP)
- **Series 1:** Current year — colour `--teal`
- **Series 2:** Previous year — colour `--amber`, dashed
- **Legend:** "2026 YTD" | "2025 (same period)"

### Chart.js config sketch
```js
{
  type: 'line',
  data: {
    labels: monthLabels,    // ['Jan','Feb','Mar',...]
    datasets: [
      { label: '2026 YTD',  data: current, borderColor: '#38bdf8', tension: 0.3, pointRadius: 4 },
      { label: '2025',      data: prev,    borderColor: '#f59e0b', tension: 0.3, pointRadius: 4, borderDash: [4,4] },
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

## Accounts tab

### Computation
- Month-end total asset balance for Jan→current month in current year vs previous year.
- 12 points max per series (one per month).

---

## Period picker presets shown
`ytd`, `last_year`, `custom`

---

## Mobile notes
- Max 12 X labels — fits mobile well with abbreviated month names
- Canvas height: 260px
- Point radius: 5 (touch-friendly)

---

## Edge cases
- App started mid-year: Jan–start month have no data — plot as 0 or skip.
- No previous year data at all: hide Period B, show notice "No data for 2025".
- Year started less than 1 month ago: single point — still render.
