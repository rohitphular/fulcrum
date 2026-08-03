# Dashboard 13 — Tag Spending Trend

**Group:** Tag analysis
**Chart type:** Line (multi-series, one per tag)
**Tabs:** None (transactions only)
**Period picker:** `last_3`, `last_6`, `last_12`, `ytd`, `custom`

---

## What it shows

Monthly spend attributed to each tag over the selected period — tracks whether per-person or per-purpose spend is growing or shrinking month by month.

---

## Data source
- `state.transactions`, `transaction_type === 'money-out'`
- Tags field: semicolon-separated

### Computation
1. Build month labels for selected period.
2. For each month, for each tx: split tags, add `toBase(amount)` to each tag's month bucket.
3. Collect all distinct tags seen across all months.
4. Build one dataset per tag: `[monthly_spend_jan, ..., monthly_spend_jul]`.
5. Sort datasets by total spend descending; show top 6 tags as lines, rest hidden by default (user can toggle via legend).

### Chart spec
- **Type:** Line
- **X axis:** Month labels
- **Y axis:** Monthly spend (GBP)
- **Series:** One line per tag (top 6 visible, others hidden — `hidden: true` in dataset)
- **Colours:** Palette, one colour per tag
- **Legend:** Below — clicking legend item toggles visibility

### Chart.js config sketch
```js
{
  type: 'line',
  data: {
    labels: monthLabels,
    datasets: tags.map((tag, i) => ({
      label: tag,
      data: monthlyByTag[tag],
      borderColor: PALETTE[i],
      backgroundColor: PALETTE[i] + '22',
      tension: 0.3,
      pointRadius: 4,
      hidden: i >= 6,    // only top 6 visible by default
    }))
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'bottom',
        onClick: (e, legendItem, legend) => {
          // default toggle behaviour
          const index = legendItem.datasetIndex;
          const ci = legend.chart;
          ci.getDatasetMeta(index).hidden = !ci.getDatasetMeta(index).hidden;
          ci.update();
        }
      }
    },
    scales: {
      x: { ticks: { maxRotation: 0, maxTicksLimit: 6 } },
      y: { ticks: { callback: v => '£'+v.toLocaleString() } }
    }
  }
}
```

---

## Period picker presets shown
`last_3`, `last_6`, `last_12`, `ytd`, `custom`

---

## Mobile notes
- Legend toggle is touch-friendly (Chart.js default)
- Keep max 6 lines visible by default — more than 6 is hard to distinguish on a small screen
- Canvas height: 280px
- Point radius: 5 on mobile

---

## Edge cases
- Only 1 tag used across all transactions: single line rendered.
- Tag used in only one month: line with a single peak, zeroes elsewhere.
- No tags at all: show notice "No tagged transactions in this period."
