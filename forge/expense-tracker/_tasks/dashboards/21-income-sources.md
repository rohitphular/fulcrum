# Dashboard 21 — Income Sources

**Group:** Income & cash flow
**Chart type:** Donut + horizontal bar table
**Tabs:** Transactions only
**Period picker:** `this_month`, `last_month`, `last_3`, `last_6`, `last_12`, `ytd`, `custom`

---

## What it shows

Where income comes from — broken down by counterparty (source name), major category, and over time. Helps understand income diversification and stability.

---

## Data source
- `state.transactions` where `transaction_type === 'money-in'`

### Computation
1. Filter to `money-in` transactions in selected period.
2. **By source:** Group by `counterparty` → sum `toBase(amount)`. Top 8 sources + "Other".
3. **By category:** Group by `major_category` → sum.
4. **Over time:** Monthly income sum for trend line.

---

## Sub-views (tabs within this dashboard)
- **By Source** (default): donut of top counterparties
- **By Category**: donut of major categories
- **Trend**: monthly income line chart

---

## Sub-view A — By Source

### Chart spec
- Donut chart, top 8 counterparties + "Other"
- Below donut: horizontal bar table (counterparty | amount | % of total)

### Chart.js config sketch
```js
{
  type: 'doughnut',
  data: {
    labels: sourceLabels,
    datasets: [{ data: sourceAmounts, backgroundColor: PALETTE, borderWidth: 2 }]
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { boxWidth: 12, padding: 8 } },
      tooltip: { callbacks: { label: ctx => `${ctx.label}: £${ctx.raw.toLocaleString()} (${pct(ctx)}%)` } }
    },
    cutout: '60%'
  }
}
```

### Table below donut
```
Vega Investments     £5,200  68%
Freelance XYZ        £1,400  18%
Interest             £200     3%
...
```

---

## Sub-view B — By Category

Same donut structure, group by `major_category` instead.

---

## Sub-view C — Trend

Line chart: monthly income totals for the selected period.

```js
{
  type: 'line',
  data: { labels: monthLabels, datasets: [{ label: 'Income', data: monthlyIncome, borderColor: '#34d399', tension: 0.3, pointRadius: 4 }] },
  options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
    scales: { y: { ticks: { callback: v => '£'+v.toLocaleString() } } } }
}
```

Stat cards above trend: total income, avg monthly, peak month.

---

## Period picker presets shown
`this_month`, `last_month`, `last_3`, `last_6`, `last_12`, `ytd`, `custom`

---

## Mobile notes
- Sub-view selector: pill tabs (By Source | By Category | Trend)
- Donut: cutout 60%, 200px canvas, legend below with 2-column wrapping
- Horizontal table: full-width, 44px row height

---

## Edge cases
- No income in period: "No income recorded for this period."
- Counterparty = blank: grouped as "Unknown source".
- One dominant source (>90%): still render donut, but flag "Concentrated income" note.
