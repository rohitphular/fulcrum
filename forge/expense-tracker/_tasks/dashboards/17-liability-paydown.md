# Dashboard 17 — Liability Paydown Progress

**Group:** Account & net worth
**Chart type:** Multi-line (one per loan) + progress bars (HTML)
**Tabs:** Accounts only
**Period picker:** `last_6`, `last_12`, `ytd`, `last_year`, `custom`

---

## What it shows

Month-by-month balance remaining for each liability account (loans, credit cards), showing the paydown trajectory — lets you see which debts are shrinking fastest and project payoff dates.

---

## Data source
- `state.accounts` filtered to `type === 'liability'`
- `state.transactions` — debt-repayment transfers and credit card payments

### Computation
1. For each liability account, replay transactions to compute end-of-month balance for each month in selected period.
2. Liability balances are stored as negatives; display as `Math.abs(balance)` (amount owed).
3. Each account = one line in the chart.

### Projected payoff (optional, per account)
- Average monthly repayment = mean of monthly repayment amounts in last 3 months.
- Projected months to zero = `currentBalance / avgMonthlyRepayment`.
- Display as text below each progress bar: "Paid off in ~N months (Month Year)".

### Chart spec — Line chart
- **Type:** Line
- **X axis:** Month labels
- **Y axis:** Outstanding balance (GBP, shown as positive)
- **Series:** One line per liability account
- **Colour:** Each account gets a unique palette colour
- **Legend:** Account names below

### Chart.js config sketch
```js
{
  type: 'line',
  data: {
    labels: monthLabels,
    datasets: liabilityAccounts.map((acc, i) => ({
      label: acc.name,
      data: monthlyBalances[acc.id],
      borderColor: PALETTE[i],
      tension: 0.3,
      pointRadius: 4,
    }))
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { position: 'bottom' } },
    scales: {
      x: { ticks: { maxRotation: 0, maxTicksLimit: 6 } },
      y: { min: 0, ticks: { callback: v => '£'+v.toLocaleString() } }
    }
  }
}
```

### HTML Progress bars (below chart)
For each liability account, a visual progress bar:
```
Credisphere    ████████░░░░░░  £4,800 / £10,000 (52% paid)
Drafty Loan    ██████████████  £1,200 / £1,920  (38% owed)
```
Progress = `1 - (currentBalance / openingBalance)`.

Progress bar HTML:
```html
<div class="debt-progress-item">
  <div class="debt-name">Credisphere</div>
  <div class="progress-bar"><div class="progress-fill" style="width: 52%"></div></div>
  <div class="debt-meta">£4,800 remaining · ~14 months to clear</div>
</div>
```

---

## Period picker presets shown
`last_6`, `last_12`, `ytd`, `last_year`, `custom`

---

## Mobile notes
- Progress bars are natively mobile-friendly (full-width, touch-readable)
- Line chart: max 6 lines visible by default — hide others via legend toggle
- Canvas height: 260px
- Account names in legend: truncated to 16 chars

---

## Edge cases
- Account with increasing balance (new credit taken): line goes up — not hidden, shows realistic state.
- opening_value is blank: can't compute progress percentage — show "% paid: N/A".
- Credit card: balance may fluctuate up and down — still render as-is.
- Fully paid off account (balance = 0): line flatlines at 0, progress bar shows 100%.
