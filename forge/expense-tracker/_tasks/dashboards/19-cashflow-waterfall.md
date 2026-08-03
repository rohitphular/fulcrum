# Dashboard 19 — Cash Flow Waterfall

**Group:** Income & cash flow
**Chart type:** Waterfall (stacked bar simulation in Chart.js)
**Tabs:** Transactions only
**Period picker:** `this_month`, `last_month`, `custom` (month-level only)

---

## What it shows

Starting balance → income → spending by major category → ending balance, as a waterfall chart. Each category bar drops the running total. Instantly shows where money went within a single month.

---

## Data source
- `state.transactions`, selected month
- Starting balance: `state.accounts` computed opening balance for the month

### Computation
1. Starting value = total asset balance at start of selected month (from account replay logic).
2. Income = sum of all `money-in` txs for the month (one positive bar).
3. Expenses by major category: for each `major_category`, sum `money-out` txs → negative bars.
4. Sort expense categories largest → smallest.
5. Final "Ending Balance" bar = running total after all adjustments.
6. Waterfall X labels: `['Opening', 'Income', ...majorCategories, 'Closing']`

### Waterfall simulation in Chart.js
Chart.js does not have a native waterfall type. Simulate with stacked bar chart:
- Each bar has an invisible "base" segment (transparent) to float the visible segment.
- For positive bars (income): base = 0, visible = income amount.
- For negative bars (expense categories): base = running_total_before, visible = −expense_amount.

```
runningTotal = startBalance
segments = [
  { label: 'Opening',  base: 0,            value: startBalance },
  { label: 'Income',   base: startBalance,  value: +income },
  { label: 'Food',     base: runningTotal,  value: -foodExpense },
  { label: 'Housing',  base: runningTotal - foodExpense, value: -housingExpense },
  ...
  { label: 'Closing',  base: 0,            value: closingBalance },
]
```

### Chart spec
- **Type:** Stacked bar
- **X axis:** Category labels (Opening, Income, Food, Transport, …, Closing)
- **Y axis:** GBP
- **Colours:**
  - Opening/Closing bars: `--teal`
  - Income: green
  - Expense bars: `--ember` (red)
  - Transparent base segments: `rgba(0,0,0,0)`

### Chart.js config sketch
```js
{
  type: 'bar',
  data: {
    labels: waterfallLabels,
    datasets: [
      { label: '',         data: baseValues,    backgroundColor: 'rgba(0,0,0,0)', stack: 'wf' },
      { label: 'Amount',   data: visibleValues, backgroundColor: barColors,       stack: 'wf', borderRadius: 4 },
    ]
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false },
      tooltip: {
        callbacks: {
          label: ctx => ctx.datasetIndex === 1 ? '£'+Math.abs(ctx.raw).toLocaleString() : null
        }
      }
    },
    scales: {
      x: { stacked: true, ticks: { maxRotation: 30, font: { size: 11 } } },
      y: { stacked: false, ticks: { callback: v => '£'+v.toLocaleString() } }
    }
  }
}
```

---

## Period picker presets shown
`this_month`, `last_month`, `custom`

---

## Mobile notes
- Waterfall with many categories can overflow on mobile — rotate X labels 30° (`maxRotation: 30`)
- Cap at 10 expense categories; group the rest as "Other"
- Canvas height: 300px
- Consider horizontal waterfall for mobile (swap indexAxis) — implementation note: horizontal waterfall is harder to simulate; vertical with rotated labels is acceptable

---

## Edge cases
- Month with no income: Income bar = 0 (still shown for visual context).
- Opening balance = 0 (first month): waterfall starts at 0.
- Closing balance < 0 (overdraft): closing bar goes below zero — render in red.
- More than 10 expense categories: group smallest into "Other expenses".
