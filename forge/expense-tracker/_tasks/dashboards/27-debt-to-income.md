# Dashboard 27 — Debt-to-Income Ratio

**Group:** Account & net worth
**Chart type:** Gauge simulation + trend line
**Tabs:** Both (Accounts for current DTI, Transactions for income context)
**Period picker:** `last_3`, `last_6`, `last_12`, `ytd`, `custom` (for income averaging)

---

## What it shows

Debt-to-income ratio: total liability balances ÷ annualised income. A key personal finance health metric. Below 36% is considered healthy; above 50% is high risk. Shows current DTI and trend over selected period.

---

## Data source
- `state.accounts` — current liability balances
- `state.transactions` — income transactions for denominator

### Computation
1. `totalDebt = sum Math.abs(account.current_value)` for all `type === 'liability'` accounts (converted to GBP).
2. `monthlyIncome = mean of monthly income sums` over selected period.
3. `annualisedIncome = monthlyIncome × 12`.
4. `dtiRatio = totalDebt / annualisedIncome × 100` (as percentage).
5. Monthly DTI for trend: compute DTI at end of each month in period (liability balance from account replay).

### DTI thresholds
- < 20%: Excellent (green)
- 20–36%: Good (teal)
- 36–50%: Caution (amber)
- > 50%: High risk (red)

---

## Display

### Gauge simulation (Chart.js half-donut)
Simulate a gauge using a doughnut chart with rotation:
```js
const GAUGE_TOTAL = 100; // gauge covers 0-100%
const dtiVal = Math.min(dtiRatio, 100);
const gaugeData = [dtiVal, GAUGE_TOTAL - dtiVal];
// rotation: -90deg (start at left), sweep 180deg (half circle)

{
  type: 'doughnut',
  data: {
    datasets: [{
      data: [dtiVal, GAUGE_TOTAL - dtiVal],
      backgroundColor: [gaugeColor(dtiVal), '#e5e7eb'],
      borderWidth: 0,
    }]
  },
  options: {
    rotation: -90,
    circumference: 180,
    cutout: '75%',
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    responsive: true, maintainAspectRatio: false,
  }
}
```

Centre text overlay (HTML, positioned over canvas):
```html
<div class="gauge-label">
  <span class="gauge-value">38.2%</span>
  <span class="gauge-status">Caution</span>
</div>
```

### Stat cards below gauge
| Card | Value |
|---|---|
| Total debt | £X,XXX |
| Monthly income (avg) | £X,XXX |
| Annualised income | £X,XXX |
| DTI ratio | X% |

### DTI trend line (below stat cards)
Line chart showing monthly DTI ratio over selected period.
```js
{
  type: 'line',
  data: { labels: monthLabels, datasets: [{
    label: 'DTI %', data: monthlyDTI,
    borderColor: '#f59e0b', tension: 0.3, pointRadius: 4,
  }] },
  options: {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false },
      annotation: { /* horizontal reference line at 36% */ }
    },
    scales: { y: { ticks: { callback: v => v+'%' } } }
  }
}
```

Reference line at 36% drawn as a dashed horizontal line using Chart.js annotation plugin (or drawn via `afterDraw` canvas hook to avoid plugin dependency).

---

## Period picker presets shown
`last_3`, `last_6`, `last_12`, `ytd`, `custom`

---

## Mobile notes
- Gauge: 240px canvas, half-circle, centred on screen
- Stat cards: 2×2 grid below gauge
- Trend line: 220px canvas
- All fits in single scroll without excessive swiping

---

## Edge cases
- No liability accounts: DTI = 0% — gauge at 0, "Excellent (Debt-free)" label.
- No income in period: DTI = ∞ or N/A — display "N/A — no income data in period."
- DTI > 100%: gauge fills completely (capped at 100 for rendering), shows "X% (High risk)" in red.
- Partial month income: use only complete months for income average.
