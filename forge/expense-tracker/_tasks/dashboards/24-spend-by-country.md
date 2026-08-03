# Dashboard 24 — Spend by Country

**Group:** Spending analysis (geographic)
**Chart type:** Horizontal bar + stat table
**Tabs:** Transactions only
**Period picker:** `this_month`, `last_month`, `last_3`, `last_6`, `last_12`, `ytd`, `custom`

---

## What it shows

Total spend grouped by country — answers "how much am I spending in each country?" Useful for tracking international spend, travel costs, or FX exposure.

---

## Data source
- `state.transactions` where `transaction_type === 'money-out'`
- Country field: `tx.country` (schema field, may be blank)

### Computation
1. Filter `money-out` in period.
2. Group by `country` (case-insensitive, trimmed).
3. Blank/null country → grouped as "Unknown".
4. Sum `toBase(amount)` per country.
5. Sort descending by total.
6. Show top 15 countries; collapse rest into "Other".

### Additional stats per country
- Transaction count
- Average transaction amount
- Most common counterparty in that country
- Most common category in that country

---

## Chart spec
- **Type:** Horizontal bar
- **Y axis:** Country names
- **X axis:** GBP
- **Colour:** Top country = `--teal`; others = progressively lighter teal; "Unknown" = grey
- **No legend**

### Chart.js config sketch
```js
{
  type: 'bar',
  data: {
    labels: countryNames,
    datasets: [{
      data: spendAmounts,
      backgroundColor: countryColors,
      borderRadius: 4,
    }]
  },
  options: {
    indexAxis: 'y',
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false },
      tooltip: {
        callbacks: {
          label: ctx => `£${ctx.raw.toLocaleString()} · ${txCounts[ctx.dataIndex]} txns`
        }
      }
    },
    scales: { x: { ticks: { callback: v => '£'+v.toLocaleString() } } }
  }
}
```

### Stat table below chart
```
Country         Spend      Txns   Avg/txn    Top category
United Kingdom  £3,200     42     £76        Transport
India           £800       12     £67        Food & Dining
France          £320       6      £53        Travel
Unknown         £140       5      £28        Shopping
```

---

## Period picker presets shown
`this_month`, `last_month`, `last_3`, `last_6`, `last_12`, `ytd`, `custom`

---

## Mobile notes
- Horizontal bars: mobile-native
- Stat table: horizontal scroll with sticky first column (Country)
- Canvas height: `max(240, N * 44)` dynamic

---

## Edge cases
- Country field empty on all transactions: only "Unknown" bar shown; note "Country data missing — add it when entering transactions."
- Single country: one bar, still rendered (no special handling).
- Country names inconsistent ("UK" vs "United Kingdom"): normalise on display but do not mutate data; use a lookup map: `{ 'UK': 'United Kingdom', 'GB': 'United Kingdom', ... }`.
