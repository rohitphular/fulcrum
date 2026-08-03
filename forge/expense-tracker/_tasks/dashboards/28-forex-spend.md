# Dashboard 28 — Forex / Multi-Currency Spend

**Group:** Spending analysis
**Chart type:** Donut + table + bar
**Tabs:** Transactions only
**Period picker:** `this_month`, `last_month`, `last_3`, `last_6`, `last_12`, `ytd`, `custom`

---

## What it shows

Spend broken down by original transaction currency — shows FX exposure (how much you're spending in each currency). Highlights exchange-rate risk and foreign spend concentration.

---

## Data source
- `state.transactions` where `transaction_type === 'money-out'`
- Fields used: `amount`, `currency`, `fx_rate` (if populated), `quote_currency` from state

### Computation
1. Filter `money-out` in period.
2. Group by `currency` (the native transaction currency, NOT the base currency).
3. For each currency group:
   - `nativeTotal = sum amount` (in native currency)
   - `gbpEquivalent = sum toBase(amount, currency, fx_rate, rateMap, quoteCurrency)` (in base)
4. Sort by GBP equivalent descending.
5. Build donut: each currency = one slice.

### Exchange rate insight (bonus)
For each foreign currency (non-GBP), if `fx_rate` is populated on transactions:
- Show avg effective rate used at time of transaction vs current mid-market rate (from `state.rates`).
- Flag "You got X% above/below today's rate" as a stat pill.

---

## Sub-views
Two pill tabs within the dashboard:
- **By Currency** (default): donut of spend by currency
- **By FX Rate** (bonus): scatter plot — date on X, fx_rate on Y (one point per foreign-currency tx)

---

## Sub-view A — By Currency

### Chart spec — Donut
```js
{
  type: 'doughnut',
  data: {
    labels: currencyLabels,  // ['GBP', 'INR', 'EUR', ...]
    datasets: [{ data: gbpEquivalents, backgroundColor: PALETTE, borderWidth: 2 }]
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    cutout: '60%',
    plugins: {
      legend: { position: 'bottom' },
      tooltip: {
        callbacks: {
          label: ctx => {
            const native = nativeTotals[ctx.dataIndex];
            const sym = currencySymbols[ctx.label];
            return `${sym}${native.toLocaleString()} ≈ £${ctx.raw.toLocaleString()}`;
          }
        }
      }
    }
  }
}
```

### Table below donut
```
Currency   Native total     GBP equiv   Txns   Avg rate
GBP        £2,450.00        £2,450       32     1.0000
INR        ₹45,200.00       £432         8      104.63
EUR        €180.00          £152         3      0.8444
```

---

## Sub-view B — FX Rate Scatter

Shows exchange rates used over time — useful to check if you've been getting good rates at money transfers.

```js
{
  type: 'scatter',
  data: {
    datasets: foreignCurrencies.map((ccy, i) => ({
      label: ccy,
      data: fxPoints[ccy], // [{x: dateMs, y: fxRate}, ...]
      backgroundColor: PALETTE[i],
      pointRadius: 6,
    }))
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom' } },
    scales: {
      x: { type: 'time', time: { unit: 'month' }, ticks: { maxRotation: 0 } },
      y: { ticks: { callback: v => v.toFixed(4) } }
    }
  }
}
```

Only shown if ≥ 1 foreign currency transaction has `fx_rate` populated.

---

## Stat cards
| Card | Value |
|---|---|
| Currencies used | N |
| Domestic (GBP) spend | £X,XXX (X%) |
| Foreign spend total | £X,XXX (X%) |
| Largest foreign ccy | INR — ₹45,200 (£432) |

---

## Period picker presets shown
`this_month`, `last_month`, `last_3`, `last_6`, `last_12`, `ytd`, `custom`

---

## Mobile notes
- Donut: 220px canvas, cutout 60%, legend below in 3-column grid
- Table: horizontally scrollable, sticky currency column
- Scatter sub-view: `pointRadius: 8` for touch targets, `intersect: false` tooltips
- Sub-view pill tabs: "By Currency" | "FX Rates" — full-width on mobile

---

## Edge cases
- All transactions in GBP: only one donut slice. Still rendered — confirms no FX exposure.
- `fx_rate` = null on foreign transactions: use `rateMap` current rate for GBP conversion; flag these rows in table with `~` before amount indicating estimated.
- Currency not in `rateMap`: mark as "rate unavailable", exclude from GBP totals, show native amount only with a warning badge.
- Scatter sub-view: hidden if no foreign currency transactions have `fx_rate` populated.
