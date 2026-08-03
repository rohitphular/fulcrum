# Dashboard 14 — Net Worth Trend

**Group:** Account & net worth
**Chart type:** Line (single series) with area fill
**Tabs:** Accounts only
**Period picker:** `last_6`, `last_12`, `ytd`, `last_year`, `custom`

---

## What it shows

Month-end net worth (total assets − total liabilities, in GBP) plotted over time — the single most important financial health indicator.

---

## Data source
- `state.accounts` — opening_value, type, currency
- `state.transactions` — to reconstruct balance at each month end

### Computation
1. Build month array for selected period.
2. For each month M:
   a. Start each account at `opening_value`.
   b. Apply all transactions chronologically up to and including the last day of month M.
   c. Apply balance arithmetic (same rules as the backend):
      - `money-in` to account: `+amount`
      - `money-out` from account: `−amount`
      - `money-transfer` from src: `−amount`; to target: `+credited` (amount × fx_rate or amount)
   d. Sum all asset account balances → total assets (convert to GBP via rateMap).
   e. Sum all liability account balances → total liabilities (stored as negatives; take `Math.abs` for display, then subtract from assets).
   f. Net worth = total assets − Math.abs(total liabilities).
3. Plot monthly net worth as a line.

### Chart spec
- **Type:** Line with `fill: 'origin'`
- **X axis:** Month labels
- **Y axis:** Net worth (GBP) — may go negative
- **Series:** "Net Worth" — `--teal` when positive, `--ember` when negative (use gradient plugin or single colour)
- **Reference line at y=0:** `annotations` plugin or manual dataset at 0
- **Legend:** None (single series, title is sufficient)

### Chart.js config sketch
```js
{
  type: 'line',
  data: {
    labels: monthLabels,
    datasets: [{
      label: 'Net Worth',
      data: netWorthByMonth,
      borderColor: '#38bdf8',
      backgroundColor: 'rgba(56,189,248,0.1)',
      fill: 'origin',
      tension: 0.3,
      pointRadius: 5,
    }]
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { maxRotation: 0, maxTicksLimit: 6 } },
      y: {
        ticks: { callback: v => '£'+v.toLocaleString() },
        grid: { color: ctx => ctx.tick.value === 0 ? '#f87171' : '#e2e8f022' }
      }
    }
  }
}
```

### Summary cards (above chart)
Three small stat cards rendered as HTML (not Chart.js):
- **Current net worth:** £X,XXX
- **Change this month:** +£XXX (▲) / −£XXX (▼)
- **Change vs 12 months ago:** +£X,XXX (%)

---

## Period picker presets shown
`last_6`, `last_12`, `ytd`, `last_year`, `custom`

---

## Mobile notes
- Summary stat cards stack vertically as full-width chips
- Canvas height: 260px
- Zero line visually important — use a distinct grid colour (`--ember` at y=0)
- Point radius: 6 for touch

---

## Edge cases
- Net worth goes negative: fill area below zero in red tint, above in teal tint (requires two datasets or gradient).
- Opening values missing for some accounts: use 0 for those accounts.
- Foreign-currency accounts: convert to GBP using `rateMap`; if rate missing, use last known rate or exclude.
- Only 1 month of data: single point — extend to flat line.
