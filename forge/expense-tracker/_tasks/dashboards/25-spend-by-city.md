# Dashboard 25 — Spend by City

**Group:** Spending analysis (geographic)
**Chart type:** Horizontal bar
**Tabs:** Transactions only
**Period picker:** `this_month`, `last_month`, `last_3`, `last_6`, `last_12`, `ytd`, `custom`

---

## What it shows

Same as Dashboard 24 (Spend by Country) but granular to city level. Answers "which cities are my biggest spend locations?" — useful for tracking local vs travel spend.

---

## Data source
- `state.transactions` where `transaction_type === 'money-out'`
- City field: `tx.city` (schema field, may be blank)

### Computation
1. Filter `money-out` in period.
2. Group by `city` (case-insensitive, trimmed). Blank/null → "Unknown".
3. Sum `toBase(amount)` per city.
4. Sort descending.
5. Top 15 cities; rest → "Other".
6. Optional sub-grouping: city → country (shown in tooltip or as suffix).

### Additional stats per city
- Country (from `tx.country`)
- Transaction count
- Top category
- Most visited counterparty

---

## Chart spec
- **Type:** Horizontal bar
- **Y axis:** City name (+ country suffix in grey, e.g. "London, UK")
- **X axis:** GBP
- **Colour:** Domestic cities `--teal`; foreign cities `--amber`; "Unknown" grey

### Chart.js config sketch
```js
{
  type: 'bar',
  data: {
    labels: cityLabels, // ["London, UK", "Mumbai, IN", ...]
    datasets: [{
      data: spendAmounts,
      backgroundColor: cityColors,
      borderRadius: 4,
    }]
  },
  options: {
    indexAxis: 'y',
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false },
      tooltip: {
        callbacks: {
          label: ctx => `£${ctx.raw.toLocaleString()} · ${txCounts[ctx.dataIndex]} txns · ${topCats[ctx.dataIndex]}`
        }
      }
    },
    scales: {
      x: { ticks: { callback: v => '£'+v.toLocaleString() } },
      y: { ticks: { font: { size: 11 } } }
    }
  }
}
```

### Stat summary cards
| Card | Value |
|---|---|
| Cities visited | N |
| Domestic spend | £X,XXX (X%) |
| International spend | £X,XXX (X%) |

---

## Period picker presets shown
`this_month`, `last_month`, `last_3`, `last_6`, `last_12`, `ytd`, `custom`

---

## Mobile notes
- City + country suffix: may be long — truncate to 20 chars, full in tooltip
- Domestic vs international: use colour difference (teal vs amber) — readable without text
- Canvas height: `max(240, N * 44)` dynamic

---

## Edge cases
- `city` field blank for most transactions: show "Unknown" as dominant bar + note "Add city to transactions for a richer view."
- City name = blank but country = UK: group as "UK (city unknown)" rather than raw "Unknown".
- Same city in multiple countries (rare edge case like "Paris, TX vs Paris, FR"): use `${city}, ${country}` as composite key.
