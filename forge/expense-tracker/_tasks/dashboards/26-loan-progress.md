# Dashboard 26 — Loan Progress Detail

**Group:** Account & net worth
**Chart type:** Progress bars + area chart
**Tabs:** Accounts only
**Period picker:** Not applicable (shows full loan life from opening to now)

---

## What it shows

Per-loan paydown detail: original balance, amount repaid, amount remaining, repayment rate, and projected payoff date. More detailed than Dashboard 17 (Liability Paydown) which is a trend overview; this is the per-loan drill-down.

---

## Data source
- `state.accounts` where `type === 'liability'`
- `state.transactions` — money-transfer repayments targeting each liability account

### Computation per loan account
1. `originalBalance = account.opening_value` (absolute value).
2. `totalRepaid = sum of all repayment txs` targeting this account (money-transfer, where `target_account = account.name`).
3. `currentBalance = account.current_value` (absolute value).
4. `pctPaid = totalRepaid / originalBalance * 100`.
5. `avgMonthlyRepayment` = `totalRepaid / monthsSinceOpening`.
6. `monthsToPayoff = currentBalance / avgMonthlyRepayment`.
7. `projectedPayoffDate = now + monthsToPayoff months`.

---

## Display

### One card per loan account

```
┌─────────────────────────────────────────────┐
│  Credisphere by Fintern                     │
│  Category: Debt · Currency: GBP             │
│                                             │
│  ████████████░░░░░░░░  £5,120 repaid        │
│  Original: £8,640  Remaining: £3,520  59%   │
│                                             │
│  Avg monthly repayment: £128.14             │
│  Projected payoff: October 2027 (~27 mo)    │
│                                             │
│  [View repayment history ▾]                 │
└─────────────────────────────────────────────┘
```

### Expandable repayment history (per card)
- Line chart: cumulative repaid over time (area chart)
- Table: each repayment with date, amount

### Area chart config sketch (repayment cumulative)
```js
{
  type: 'line',
  data: {
    labels: repaymentDates,
    datasets: [{
      label: 'Cumulative repaid',
      data: cumulativeRepaid,
      borderColor: '#34d399',
      backgroundColor: 'rgba(52,211,153,0.15)',
      fill: true,
      tension: 0.3,
      pointRadius: 3,
    }]
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { min: 0, max: originalBalance, ticks: { callback: v => '£'+v.toLocaleString() } }
    }
  }
}
```

---

## Summary stat cards (top of page, across all loans)
| Card | Value |
|---|---|
| Total debt | £X,XXX |
| Total repaid (all time) | £X,XXX |
| Monthly debt burden | £X,XXX |
| Earliest payoff | Account name, Mon YYYY |

---

## Mobile notes
- Cards stack vertically — natural mobile layout
- Progress bar: full-width, 20px height, border-radius 10px
- Repayment history panel: collapses/expands with smooth transition (44px tap target on toggle)
- Area chart: 200px canvas height when expanded

---

## Edge cases
- `opening_value` is blank: show "Original balance unknown" — skip pctPaid and projection.
- No repayment transactions found: `totalRepaid = 0`, projection = N/A.
- Loan fully paid (balance = 0): show 100% progress bar, green badge "Paid off".
- Balance fluctuates up (new draw-down): `pctPaid` can decrease — show warning "Balance increased, projection updated."
