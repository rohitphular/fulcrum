# Dashboard 12 — Tag Spending Breakdown (Donut)

**Group:** Tag analysis
**Chart type:** Doughnut + ranked table
**Tabs:** None (transactions only)
**Period picker:** Full preset list

---

## What it shows

Proportional spend attributed to each tag for the selected period — useful for tracking shared-spend categories like `rohit`, `reena`, `aryan` or purpose tags like `reimbursable`, `work`.

---

## Data source
- `state.transactions`, `transaction_type === 'money-out'`
- Tags field: semicolon-separated string (e.g. `'rohit;reena;aryan'`)

### Computation
1. Filter `money-out` txs for selected period.
2. For each tx, split `tags` by `;` → array of tag strings, trimmed, lowercased.
3. Each tag on a transaction receives the **full transaction amount** (not divided). Rationale: a tag means "this tx is associated with this person/purpose", not "split evenly".
4. Aggregate: `{ rohit: £450, reena: £320, aryan: £180, ... }`.
5. Sort descending.
6. If > 8 tags: group tail as "Other tags".
7. Txs with no tags: excluded from this chart (or optionally grouped as "Untagged" — configurable).

### Chart spec
- **Type:** Doughnut
- **Segments:** One per tag
- **Centre text:** Number of distinct tags
- **Colour palette:** Fixed 8-colour palette (same as Dashboard 08)
- **Legend:** Below, tag name + total amount + count of txs

### Chart.js config sketch
```js
{
  type: 'doughnut',
  data: {
    labels: tagLabels,
    datasets: [{
      data: tagAmounts,
      backgroundColor: PALETTE,
      borderWidth: 2,
      hoverOffset: 8,
    }]
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    cutout: '55%',
    plugins: {
      legend: { position: 'bottom', labels: { font: { size: 12 } } },
      tooltip: {
        callbacks: {
          label: ctx => `£${ctx.parsed.toFixed(2)} — ${txCountByTag[ctx.label]} txs`
        }
      }
    }
  }
}
```

### Ranked table (below chart)
```
| Tag      | Transactions | Total (£) | Avg (£) |
| rohit    | 42           | 450.00    | 10.71   |
| reena    | 18           | 320.00    | 17.78   |
```

---

## Period picker presets shown
All presets.

---

## Mobile notes
- Doughnut renders well on mobile — square canvas
- Canvas height: 240px (smaller than full charts since table carries the detail)
- Table: 4 columns, font 12px, scrollable if needed

---

## Edge cases
- No tagged transactions in period: show notice "No tagged transactions in this period".
- All transactions have the same tag: full circle with one segment.
- Tag with whitespace or mixed case: normalise to lowercase trimmed before aggregation.
