# Dashboard 11 — Category Drill-down

**Group:** Category analysis
**Chart type:** Horizontal bar (two levels: major → minor)
**Tabs:** None (transactions only)
**Period picker:** Full preset list

---

## What it shows

Major categories as horizontal bars; tap any bar to drill into its minor categories — a one-tap exploration flow optimised for mobile.

---

## Data source
- `state.transactions`, `transaction_type === 'money-out'`
- Selected period

### Computation — Level 1 (major categories)
1. Filter `money-out` txs for period.
2. Group by `major_category` → sum `toBase(amount)`.
3. Sort descending.
4. Render as horizontal bar chart.

### Computation — Level 2 (minor categories within selected major)
1. On tap of a bar, filter txs to that `major_category`.
2. Group by `minor_category` → sum amounts.
3. Sort descending.
4. Render a new horizontal bar chart replacing the major chart.

### State management
- `state.dashDrillMajor` — currently drilled major category (null = top level).
- "← Back" button resets to top level.

### Chart spec — Level 1
- **Type:** Horizontal bar
- **X:** Amount (GBP)
- **Y:** Major category labels
- **Colour:** Each bar a different palette colour
- **Tap interaction:** `onClick` callback → set `dashDrillMajor`, re-render

### Chart spec — Level 2
- Same horizontal bar structure
- Title above chart: `"Food & Drink — minor breakdown"`
- Back button (44×44px) above chart
- Bars coloured with the same colour as the parent major category (tint variations)

### Chart.js config sketch (level 1)
```js
{
  type: 'bar',
  data: {
    labels: majorLabels,
    datasets: [{ data: majorAmounts, backgroundColor: PALETTE, borderRadius: 4 }]
  },
  options: {
    indexAxis: 'y',
    responsive: true, maintainAspectRatio: false,
    onClick: (evt, elements) => {
      if (elements[0]) drillInto(majorLabels[elements[0].index]);
    },
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { callback: v => '£'+v.toLocaleString() } },
      y: { ticks: { font: { size: 12 } } }
    }
  }
}
```

---

## Mobile notes
- Tap target: `onClick` covers the full bar height — no precision needed
- Back button: `position: sticky; top: 0` so it stays visible when scrolling
- Canvas height: auto-sized to number of bars (approx 36px per bar + 40px padding)
- Level 2 chart animates in (Chart.js animation = 400ms)

---

## Edge cases
- Major category with only one minor: drill still works (single bar shown).
- Uncategorised txs: `major_category = ''` → grouped as "Uncategorised" at level 1.
- Tapping "Uncategorised" at level 1 → level 2 groups by `minor_category` (may also be blank → shown as "Other").
