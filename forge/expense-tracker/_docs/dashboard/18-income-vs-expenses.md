# Dashboard 18 — Income vs Expenses Monthly

**File:** `sections/dashboards/18-income-vs-expenses.js`
**Group:** Income & cash flow
**Chart type:** Grouped bar (income + expenses) with net line overlay
**Tabs:** None (transactions view only — no tab strip)

---

## What it shows

Monthly income and expense bars side by side, with a net line overlay showing surplus or deficit per month. A deeper, configurable alternative to the fixed 12-month view in Dashboard 06.

| Dashboard | Window | Tabs | Extra |
|---|---|---|---|
| 06 — Last 12 months | Fixed 12-month | Transactions + Accounts | — |
| 18 — Income vs Expenses | Configurable period | Transactions only | Savings rate in tooltip + avg savings rate stat |

---

## Data filtering

- **Income:** `transaction_type === 'money-in'`
- **Expenses:** `transaction_type === 'money-out'`
- **Excludes:** `money-transfer` (internal movements)
- Input `txs` is already period-filtered by the coordinator.

---

## Computation

`_buildMonthly(txs, monthKeys)`:
1. Groups income and expense txs by month using `groupByMonth`.
2. For the current calendar month (marked as partial): filters each tx to `transaction_date_utc <= todayLocal` to avoid counting future-dated entries.
3. Per month: `inc = sumAmountBase(inTxs)`, `exp = sumAmountBase(outTxs)`, `net = inc − exp`.
4. Returns `{ incomeArr, expenseArr, netArr, partial[] }`.

---

## Partial month

If the last month key equals the current calendar month (`YYYY-MM`), that month is flagged as partial:
- Its label gets an `*` suffix (e.g., `"Aug*"`).
- A `"* partial month"` note appears above the chart.
- Transactions in that month are filtered to `<= todayLocal` to exclude any future-dated entries.

---

## Chart

```js
{
  type: 'bar',                          // outer type for mixed chart
  datasets: [
    { label: 'Income',   type: 'bar',  order: 2, stack: barStack },
    { label: 'Expenses', type: 'bar',  order: 2, stack: barStack },
    { label: 'Net',      type: 'line', order: 1, fill: false, tension: 0.3 },
  ]
}
```

Colors:
- Income: `rgba(52,211,153,0.8)` (teal green)
- Expenses: `rgba(248,113,113,0.8)` (red)
- Net line: `#f59e0b` (amber)

**Desktop:** Bars are grouped (no `stack`). X-axis `maxTicksLimit: 6`.
**Mobile (`window.innerWidth < 640`):** Bars are stacked (`stack: 'io'`) to save horizontal space. X-axis `maxTicksLimit: 4`.

Canvas height: `280px`.

---

## Tooltip — savings rate

An `afterBody` callback on the tooltip computes the savings rate for the hovered month:

```js
afterBody: tooltipItems => {
  const inc  = tooltipItems[income].parsed.y;
  const net  = tooltipItems[net].parsed.y;
  const rate = Math.round(net / inc * 100);
  return [`  Savings rate: ${rate}%`];
}
```

Only rendered when `inc > 0`.

---

## Stat cards (4)

| Card | Value | Colour |
|---|---|---|
| Total income | Sum of `incomeArr` for period | `.positive` |
| Total expenses | Sum of `expenseArr` for period | `.negative` |
| Net | `totalIncome − totalExpense` | `.positive` / `.negative` |
| Avg savings rate | Mean of per-month `(net/income)*100` across months where income > 0; `"N/A"` if none | `.positive` if ≥ 0 |

---

## Shared utilities used

| Utility | Source |
|---|---|
| `monthRange` | `dashboard-utils.js` |
| `groupByMonth` | `dashboard-utils.js` |
| `sumAmountBase` | `dashboard-utils.js` |
| `fmtMonthKey` | `dashboard-utils.js` |
| `getCssColors`, `baseChartOptions` | `dashboard-utils.js` |

---

## Edge cases

| Scenario | Behaviour |
|---|---|
| Month with zero income | Income bar = 0; net = negative; savings rate omitted from tooltip |
| Month with zero expenses | Expense bar = 0; net = income |
| All months zero | Bars all at 0; net line flat; avg savings rate = "N/A" |
| Current partial month | Label gets `*`; txs filtered to today; asterisk note shown above chart |
| Mobile view | Bars stack via `stack: 'io'`; `maxTicksLimit` drops to 4 |
| INR/GBP mix | All amounts converted via `sumAmountBase` → quote currency |
