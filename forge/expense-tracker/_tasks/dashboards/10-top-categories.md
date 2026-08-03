# Dashboard 10 — Top Categories MoM Comparison

**Group:** Category analysis
**Chart type:** Horizontal grouped bar
**Tabs:** None (transactions only)
**Period picker:** Month selector (default: current month vs previous month)

---

## What it shows

Top 10 minor categories by spend in the selected month, each shown with a paired bar for the previous month — instantly reveals which categories grew or shrank.

---

## Data source
- `state.transactions`, `transaction_type === 'money-out'`
- Period A: selected month
- Period B: month immediately before Period A

### Computation
1. Filter `money-out` txs for Period A, group by `minor_category`, sum amounts.
2. Filter `money-out` txs for Period B, group by `minor_category`, sum amounts.
3. Merge: collect all minor categories that appear in either period.
4. Sort by Period A amount descending.
5. Take top 10.
6. For categories missing in Period B: value = 0.

### Chart spec
- **Type:** Horizontal bar (better on mobile for labelled categories)
- **X axis:** Amount (GBP)
- **Y axis:** Minor category labels (top 10)
- **Dataset 1:** Current month — colour `--teal`
- **Dataset 2:** Previous month — colour `--muted`
- **Legend:** "Jul 2026" | "Jun 2026"

### Chart.js config sketch
```js
{
  type: 'bar',
  data: {
    labels: topMinorCategories,    // ['Eating out', 'Groceries', ...]
    datasets: [
      { label: currentMonthLabel, data: currentAmounts, backgroundColor: '#38bdf8', borderRadius: 4 },
      { label: prevMonthLabel,    data: prevAmounts,    backgroundColor: '#94a3b8', borderRadius: 4 },
    ]
  },
  options: {
    indexAxis: 'y',   // horizontal bar
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { position: 'bottom' } },
    scales: {
      x: { ticks: { callback: v => '£'+v } },
      y: { ticks: { font: { size: 11 } } }
    }
  }
}
```

### Delta indicators (below chart or in tooltip)
For each category show: `▲ +£23.50` or `▼ −£11.00` compared to previous month — rendered in the tooltip or as a small HTML table below.

---

## Period picker presets shown
Month selector dropdown: any month of available data. Automatically compares to the preceding month.

---

## Mobile notes
- Horizontal bar is the right chart type here — long category labels read left-to-right
- Canvas height: 320px (10 rows of bars)
- Y tick font: 11px
- Delta badge rendered below chart as a `<ul>` list (easier than inside chart on mobile)

---

## Edge cases
- Fewer than 10 minor categories with data: show all available (< 10 bars).
- New category in current month (0 in previous): still included, previous bar = 0.
- Category only in previous month (not current): excluded from top 10 (sorted by current month).
