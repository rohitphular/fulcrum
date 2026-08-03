# Dashboard 08 — Category Breakdown (Donut)

**Group:** Category analysis
**Chart type:** Doughnut + summary table
**Tabs:** None (transactions only)
**Period picker:** Full preset list

---

## What it shows

Proportional spend by major category for the selected period, plus a ranked list of minor categories beneath the chart — the fastest way to see where money is going.

---

## Data source
- `state.transactions`, `transaction_type === 'money-out'`
- Selected period (default: this month)

### Computation
1. Filter `money-out` txs for selected period.
2. Group by `major_category`: `{ Food: 450, Transport: 120, ... }`.
3. Each segment = `sum toBase(amount)` for that major category.
4. Sort descending by value.
5. If more than 8 categories: group the tail as "Other".
6. Below the chart: table of top 10 minor categories sorted by total spend.

### Chart spec
- **Type:** Doughnut
- **Segments:** One per major category
- **Centre text:** Total spend for period (rendered via Chart.js plugin or CSS overlay)
- **Colour palette:** Fixed 8-colour palette (teal, amber, red, purple, blue, green, orange, grey)
- **Legend:** Below chart — category name + amount + percentage

### Chart.js config sketch
```js
{
  type: 'doughnut',
  data: {
    labels: majorCategories,
    datasets: [{
      data: majorAmounts,
      backgroundColor: PALETTE,
      borderWidth: 2,
      hoverOffset: 8,
    }]
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    cutout: '60%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: { font: { size: 12 }, padding: 12 }
      },
      tooltip: {
        callbacks: {
          label: ctx => `£${ctx.parsed.toFixed(2)} (${pct}%)`
        }
      }
    }
  }
}
```

### Minor category table (below chart)
Rendered as HTML table, not a chart:
```
| Category (Major → Minor) | Amount | % of total |
```
Top 10 minor categories sorted by amount descending.

---

## Period picker presets shown
All presets: `this_week`, `this_month`, `last_month`, `last_3`, `last_6`, `last_12`, `ytd`, `custom`

---

## Mobile notes
- Doughnut is inherently mobile-friendly (square container works well)
- Canvas height: 260px
- Legend: bottom, 2 columns on mobile (CSS: `display: grid; grid-template-columns: 1fr 1fr`)
- Minor category table: scrollable horizontally if needed, font-size 12px

---

## Edge cases
- No `money-out` txs in period: show "No spending data for this period" in place of chart.
- Single category: full circle, still renders correctly.
- Uncategorised txs (blank major_category): grouped under "Uncategorised" segment.
