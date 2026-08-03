# Dashboard 16 — Asset vs Liability Over Time

**Group:** Account & net worth
**Chart type:** Line (2 series)
**Tabs:** Accounts only
**Period picker:** `last_6`, `last_12`, `ytd`, `last_year`, `custom`

---

## What it shows

Month-end total assets and total liabilities as two separate lines — shows whether assets are growing faster than liabilities are being paid down.

---

## Data source
- `state.accounts`, `state.transactions`

### Computation
1. For each month in selected period, replay transactions to get month-end balances (same replay logic as Dashboard 14).
2. Sum asset account balances → `totalAssets[month]` (all converted to GBP).
3. Sum `Math.abs` of liability account balances → `totalLiabilities[month]` (liabilities stored as negatives).

### Chart spec
- **Type:** Line
- **X axis:** Month labels
- **Y axis:** GBP (single shared axis)
- **Series 1:** Total assets — colour `--teal`, solid, filled with light teal
- **Series 2:** Total liabilities — colour `--ember`, dashed, filled with light red
- **Legend:** "Total Assets" | "Total Liabilities"

The area between the two lines represents net worth. As liabilities shrink and assets grow, the gap widens — a satisfying visual.

### Chart.js config sketch
```js
{
  type: 'line',
  data: {
    labels: monthLabels,
    datasets: [
      { label: 'Total Assets',      data: assetsByMonth,
        borderColor: '#38bdf8', backgroundColor: 'rgba(56,189,248,0.1)', fill: true, tension: 0.3, pointRadius: 4 },
      { label: 'Total Liabilities', data: liabsByMonth,
        borderColor: '#f87171', backgroundColor: 'rgba(248,113,113,0.1)', fill: true, borderDash: [4,4], tension: 0.3, pointRadius: 4 },
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
`last_6`, `last_12`, `ytd`, `last_year`, `custom`

---

## Mobile notes
- Two lines with filled areas are visually distinct even without colour (useful for accessibility)
- Canvas height: 260px
- Legend at bottom, 2 items — fits mobile width

---

## Edge cases
- No liability accounts: liability line is zero flat — still render (confirms debt-free status).
- Liability increases (new loan taken): line goes up — visually clear.
- All accounts in foreign currencies: ensure consistent GBP conversion across months.
