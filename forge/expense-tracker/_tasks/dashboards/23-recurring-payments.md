# Dashboard 23 — Recurring Payments

**Group:** Spending analysis
**Chart type:** Table + bar chart
**Tabs:** Transactions only
**Period picker:** `last_3`, `last_6`, `last_12`, `custom`

---

## What it shows

Automatically detected recurring payments — subscriptions, loan repayments, rent — showing amount, frequency, and last payment date. Total recurring spend as a % of income.

---

## Data source
- `state.transactions` where `transaction_type === 'money-out'`

### Recurring detection algorithm
A group of transactions is "recurring" if:
1. Same counterparty (case-insensitive) AND
2. Same or very similar amount (within 5% tolerance) AND
3. Appears ≥ 2 times in the selected period AND
4. Interval between occurrences is regular (weekly ±2 days, monthly ±5 days, or quarterly ±7 days).

```js
function detectRecurring(txs) {
  // group by counterparty
  const groups = groupBy(txs, tx => tx.counterparty.toLowerCase().trim());
  const recurring = [];
  for (const [counterparty, rows] of Object.entries(groups)) {
    if (rows.length < 2) continue;
    const sorted = rows.sort((a,b) => a.date - b.date);
    const amounts = sorted.map(r => toBase(r.amount, ...));
    const amtStdDev = stdDev(amounts);
    const amtMean = mean(amounts);
    if (amtStdDev / amtMean > 0.05) continue; // too variable
    const gaps = sorted.slice(1).map((r,i) => daysBetween(sorted[i].date, r.date));
    const gapMean = mean(gaps);
    const gapStdDev = stdDev(gaps);
    // detect frequency
    let freq = null;
    if (gapMean >= 5  && gapMean <= 9  && gapStdDev <= 2) freq = 'weekly';
    if (gapMean >= 28 && gapMean <= 35 && gapStdDev <= 5) freq = 'monthly';
    if (gapMean >= 85 && gapMean <= 95 && gapStdDev <= 7) freq = 'quarterly';
    if (!freq) continue;
    recurring.push({ counterparty, amount: amtMean, frequency: freq, count: rows.length, lastDate: sorted.at(-1).date, category: sorted.at(-1).major_category });
  }
  return recurring.sort((a,b) => b.amount - a.amount);
}
```

---

## Display

### Summary stat cards
| Card | Value |
|---|---|
| Total recurring / month | £X,XXX |
| % of monthly income | X% |
| Count | N subscriptions |
| Largest | Counterparty £X |

### Recurring payments table
| Payee | Category | Frequency | Amount | Last paid |
|---|---|---|---|---|
| Credisphere | Debt | Monthly | £128.14 | 28 Jul |
| Netflix | Entertainment | Monthly | £15.99 | 12 Jul |
| ... | ... | ... | ... | ... |

Table is sortable (tap column header).

### Bar chart
Horizontal bar: one bar per recurring payee, sorted by amount. Bars coloured by category (`--teal`, `--ember`, etc.).

---

## Chart.js config sketch (bar)
```js
{
  type: 'bar',
  data: {
    labels: payeeNames,
    datasets: [{ data: amounts, backgroundColor: catColors, borderRadius: 4 }]
  },
  options: {
    indexAxis: 'y',
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false },
      tooltip: { callbacks: { label: ctx => `£${ctx.raw.toFixed(2)} / ${freqs[ctx.dataIndex]}` } }
    },
    scales: { x: { ticks: { callback: v => '£'+v } } }
  }
}
```

---

## Period picker presets shown
`last_3`, `last_6`, `last_12`, `custom`

---

## Mobile notes
- Table: swipeable horizontally OR display as card list (one card per payee with freq badge)
- Bar chart below table for visual weight comparison
- Stat cards: 2×2 grid

---

## Edge cases
- No recurring detected: "No recurring payments detected in this period."
- Loan repayments (tagged `Debt repayment`): detected automatically; show with loan account name if available.
- Variable subscriptions (amount varies month to month like dynamic pricing): excluded (>5% stdDev).
- Annual payments: not detectable in 3–6 month windows — only detected in `last_12` or `custom > 10 months`.
