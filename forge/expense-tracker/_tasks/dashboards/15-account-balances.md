# Dashboard 15 — Account Balances Snapshot

**Group:** Account & net worth
**Chart type:** Horizontal bar (grouped by account type)
**Tabs:** Accounts only
**Period picker:** Not applicable (snapshot of current balances)

---

## What it shows

Current balance of every active account, grouped by type (Asset / Liability / Investment) — a single-screen view of the full financial picture at this moment.

---

## Data source
- `state.accounts` — `current_value`, `type`, `sub_type`, `currency`, `is_active`

### Computation
1. Filter `is_active === true`.
2. Convert each account's `current_value` to GBP via `rateMap`.
3. Group accounts into three sections:
   - **Assets** (type = `asset`): current_value as positive bars
   - **Liabilities** (type = `liability`): stored as negative; display as positive (absolute value) in red
   - **Investments** (type = `investment`): current_value as positive bars in a separate colour
4. Sort within each group by balance descending.
5. Render as three separate horizontal bar charts (one per group), or one chart with visual separators.

### Preferred approach: three stacked card sections

Each section = a card with:
- Section header: "Assets" / "Liabilities" / "Investments" + total for that section
- Horizontal bar chart for that section

### Chart spec (per section)
- **Type:** Horizontal bar
- **X axis:** Balance in GBP
- **Y axis:** Account names
- **Colour:**
  - Assets: `--teal` shades (darker for current, lighter for savings/cash)
  - Liabilities: `--ember` (`rgba(248,113,113,0.8)`)
  - Investments: `--amber` (`rgba(251,191,36,0.8)`)
- **No legend** (section heading is the label)

### Chart.js config sketch (assets section)
```js
{
  type: 'bar',
  data: {
    labels: assetAccountNames,
    datasets: [{
      data: assetBalancesGBP,
      backgroundColor: '#38bdf8',
      borderRadius: 4,
    }]
  },
  options: {
    indexAxis: 'y',
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { callback: v => '£'+v.toLocaleString() } },
      y: { ticks: { font: { size: 12 } } }
    }
  }
}
```

### Summary totals (above charts)
- Total assets: £X,XXX
- Total liabilities: £X,XXX (shown as positive)
- Net: £X,XXX (assets − liabilities)

---

## Period picker presets shown
None — always shows current balance.

---

## Mobile notes
- Three separate card sections scroll naturally on mobile
- Each card's chart height: 40px per account + 40px padding (auto-height based on account count)
- Account name truncated to 20 chars with `text-overflow: ellipsis` on Y axis
- Summary totals: 3-column grid on mobile

---

## Edge cases
- Account with null/zero balance: still shown (bar = 0).
- Account in foreign currency, no rate: shown in native currency with a `?` badge, excluded from totals.
- No investment accounts: "Investments" section hidden entirely.
- Liability balance is positive (over-credited): show as teal bar instead of red, add note "Overpaid".
