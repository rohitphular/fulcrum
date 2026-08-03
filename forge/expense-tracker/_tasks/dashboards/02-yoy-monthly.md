# Dashboard 02 — Year-on-Year Monthly Comparison

**Group:** Spending comparisons
**Chart type:** Line (2 series)
**Tabs:** Transactions | Accounts
**Period picker:** Month selector (picks which calendar month to compare across years)

---

## What it shows

Daily cumulative spend for a given calendar month in the current year vs the same calendar month in the previous year — so you can see if July 2026 is running hotter or cooler than July 2025.

---

## Transactions tab

### Data source
- `state.transactions`, `transaction_type === 'money-out'`
- Period A: selected month, current year (e.g. July 2026)
- Period B: same month, previous year (e.g. July 2025)

### Computation
1. Default selected month = current calendar month.
2. Period A: `from = YYYY-MM-01`, `to = last day of that month` (capped at today if current month).
3. Period B: `from = (YYYY-1)-MM-01`, `to = last day of that month`.
4. Filter `money-out` txs for each period.
5. Group by day-of-month and accumulate: same algorithm as Dashboard 01.
6. X labels: `['1', ..., 'N']` where N = days in the selected month.
7. Period A series: `null` for days beyond today.

### Chart spec
- **X axis:** Day of month
- **Y axis:** Cumulative spend (GBP)
- **Series 1:** Current year month — colour `--teal`
- **Series 2:** Previous year same month — colour `--amber`, dashed
- **Legend:** "Jul 2026" | "Jul 2025"

### Chart.js config sketch
```js
{
  type: 'line',
  data: {
    labels: dayLabels,
    datasets: [
      { label: 'Jul 2026', data: currentYearCumulative, borderColor: '#38bdf8', tension: 0.3 },
      { label: 'Jul 2025', data: prevYearCumulative,    borderColor: '#f59e0b', tension: 0.3, borderDash: [4,4] },
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
- Reconstruct daily total asset balance for the selected month in current year vs previous year.
- Same day-by-day replay as Dashboard 01 Accounts tab.

### Chart spec
- Y axis = total asset balance
- Series: "Assets Jul 2026" | "Assets Jul 2025"

---

## Period picker presets shown
Month selector: dropdown of all calendar months (`January` → `December`), plus year selector (current year vs previous years). Alternatively, `custom` range. Keep it simple: one `<select>` for month, one for year, automatically constructs the comparison to year-1.

---

## Mobile notes
- Month/year selectors stack vertically
- Canvas height: 260px
- Tick limit: 7 labels on X axis

---

## Edge cases
- No data for previous year: Period B series is omitted, notice shown.
- Month not yet reached in current year (e.g. viewing November in August): Period A is empty.
