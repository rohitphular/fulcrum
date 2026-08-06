# R2 Frontend Code Review — Findings

Reviewed against: APP-FE.md, UX-DESIGN.md, APP-CONVENTIONS.md, APP-LOGGING.md, APP-SHARED-UTILS.md
Files inspected: index.html, main.js, core/{state,schema,nav,utils}.js, sections/{accounts,categories,transactions,subscriptions,advisor}.js, style/expense-tracker.css, _shared/{ui,auth}.js, _shared/style-tokens.css

R1 fixes confirmed present and skipped from this report.

---

## Summary Table

| ID   | Severity | File(s)                              | Short Title                                        |
|------|----------|--------------------------------------|----------------------------------------------------|
| H-01 | HIGH     | sections/transactions.js:1685,1716   | Unscoped document-level querySelectorAll           |
| H-02 | HIGH     | all sections                         | console.warn in catch blocks instead of console.error |
| H-03 | HIGH     | sections/accounts.js:784,787         | Unprefixed badge classes in import result table    |
| H-04 | HIGH     | core/utils.js:76                     | setTimeout used for event binding in openContextMenu |
| H-05 | HIGH     | style/expense-tracker.css:399,401    | Undefined CSS tokens --surface and --radius        |
| M-01 | MEDIUM   | style/expense-tracker.css:123,902    | Raw font-size pixel values in CSS                  |
| M-02 | MEDIUM   | style/expense-tracker.css:491        | Undefined CSS token --sans                         |
| M-03 | MEDIUM   | app/nav.js:21                        | dateRangeBar shown for transactions, not dashboard |
| M-04 | MEDIUM   | app/main.js:137                      | Reads et_date_range from sessionStorage — never written |
| M-05 | MEDIUM   | sections/subscriptions.js:455        | Wrong field name: sub?.counterparty should be sub?.counterparty_name |
| M-06 | MEDIUM   | sections/subscriptions.js            | Save buttons not disabled during API call          |
| M-07 | MEDIUM   | core/state.js:77                     | subViewRow declared but never read or written      |
| M-08 | MEDIUM   | sections/transactions.js:1651        | Duplicate delegated click listeners on transactionsContent |
| M-09 | MEDIUM   | app/index.html:80                    | Raw font-size:12px inline style                    |
| L-01 | LOW      | sections/advisor.js:1                | Spurious /* global SheetsClient */ comment         |
| L-02 | LOW      | _shared/auth.js                      | et_transactions_cache not cleared on logout        |

---

## HIGH

**H-01 — Unscoped document-level querySelectorAll in transactions filter**
Rule: "Event delegation for table row actions — never per-button addEventListener"
`_applyActiveFilters` (line 1685) and the chip-remove handler (line 1716) call `document.querySelectorAll('[data-filter-type]')` and `document.querySelectorAll('.chip-remove')` respectively. These queries are unscoped — they will match any element with those attributes anywhere in the document, not just inside the transactions section. They should be scoped to `el('transactionsContent')` or the nearest section container.

---

**H-02 — console.warn used in catch blocks across all section files**
Rule: "console.error — caught exceptions in catch blocks" (APP-LOGGING.md)
Every `catch` block in accounts.js, categories.js, transactions.js, subscriptions.js, and advisor.js uses `console.warn` instead of `console.error`. Caught exceptions are never recoverable at the point of the catch — `console.warn` is reserved for unexpected-but-recoverable conditions. Using `console.warn` here makes it impossible to distinguish logged errors from developer warnings in the console. All catch blocks that log a caught exception must use `console.error`.

Example occurrences (non-exhaustive):
- `accounts.js` — all mutation catch blocks
- `categories.js` — all mutation catch blocks
- `transactions.js` — line 894 and others
- `subscriptions.js` — all mutation catch blocks
- `advisor.js` — all catch blocks

---

**H-03 — Unprefixed badge classes in accounts import result table**
Rule: "Module-specific badge classes must be prefixed: .badge-et-in, .badge-et-out" (APP-CONVENTIONS.md)
`accounts.js` lines 784 and 787 render `<span class="badge badge-in">created</span>` and `<span class="badge badge-out">...</span>` in the bulk-import result table. These must be `badge-et-in` and `badge-et-out` to match the convention and the CSS definitions. The CSS rules for the unprefixed `badge-in` / `badge-out` classes were removed as part of r1, so these badges currently receive no colour styling.

```js
// line 784
? `<span class="badge badge-in">created</span>`
// line 787
: `<span class="badge badge-out">${esc(r.error || 'unknown')}</span>`
```

---

**H-04 — setTimeout used for event binding in openContextMenu**
Rule: "No setTimeout for event binding — Events are always bound synchronously after innerHTML is set" (APP-FE.md)
`core/utils.js` line 76 defers attaching the global dismiss listener with `setTimeout(() => document.addEventListener('click', _ctxHandler, true), 0)`. The stated intent is to prevent the same click that opened the menu from immediately closing it. The correct pattern is to stop propagation on the opener click (`e.stopPropagation()`) and bind the dismiss listener synchronously. The setTimeout introduces a race: if the user clicks again before the next event loop tick the dismiss listener is not yet attached.

---

**H-05 — Undefined CSS tokens --surface and --radius**
Rule: "Use design tokens. Never raw hex or px values." (UX-DESIGN.md); tokens must exist in _shared/style-tokens.css
`style/expense-tracker.css` lines 399 and 401 reference `var(--surface)` and `var(--radius)` in the `.suggestion-card` rule:

```css
.suggestion-card {
  background: var(--surface);    /* line 399 — token not defined */
  border-radius: var(--radius);  /* line 401 — token not defined */
}
```

Neither `--surface` nor `--radius` is defined in `_shared/style-tokens.css`. Both resolve silently to their initial value (transparent / 0), meaning suggestion cards have no background and no rounded corners. `--surface` should be replaced with `var(--panel)` and `--radius` with the appropriate px value promoted to a new token (e.g. `--radius-md`) or replaced with an existing concrete value if no token is appropriate.

---

## MEDIUM

**M-01 — Raw font-size pixel values in CSS**
Rule: "Never font-size: 14px — use var(--text-md)" (UX-DESIGN.md)
Two rules use raw pixel font sizes:
- `style/expense-tracker.css` line 123: `.theme-btn { font-size: 16px; }` — nearest tokens are `--text-lg: 15px` and `--text-xl: 18px`; use `var(--text-xl)` or agree on which token fits, and update the token value if needed.
- `style/expense-tracker.css` line 902: `.rate-card-code { font-size: 16px; }` — same fix applies.

---

**M-02 — Undefined CSS token --sans**
Rule: "Use design tokens." (UX-DESIGN.md); tokens must exist in _shared/style-tokens.css
`style/expense-tracker.css` line 491: `.info-icon-wrap .info-tooltip { font-family: var(--sans, sans-serif); }`. The `--sans` token is not defined in `_shared/style-tokens.css`. The fallback `sans-serif` fires silently, bypassing the design system font. The correct token is `var(--grotesk)` (defined in style-tokens.css as the primary sans-serif stack).

---

**M-03 — dateRangeBar shown for transactions tab, comment says Dashboard only**
Rule: "Set innerHTML first, attach events after — never interleave" is not the applicable rule here. This is a product-correctness issue.
`core/nav.js` line 21 shows the date range bar when `id === 'transactions'`:

```js
el('dateRangeBar').style.display = id === 'transactions' ? '' : 'none';
```

The `index.html` comment on the bar's container reads "Date range bar (Dashboard only)". The bar and `state.dateRange` / `state.filteredTx` are in fact used by the transactions section, so the nav.js behaviour is likely intentional — but either the comment in index.html is wrong and should be updated to "transactions and dashboard", or the bar needs to be visible for both sections and the condition extended. As written, the mismatch between comment and code is misleading and will cause confusion. The HTML comment should be corrected.

---

**M-04 — Reads et_date_range from sessionStorage — key is never written**
Rule: "Storage keys always prefixed with module slug" (APP-CONVENTIONS.md); beyond that, reading a key that is never written is dead code.
`main.js` line 137 reads `sessionStorage.getItem('et_date_range')` to initialise `state.dateRange`. This key is never written anywhere in the codebase. `state.dateRange` is always initialised to `'this_month'` in `state.js` and mutated in-memory only. The `sessionStorage.getItem` call always returns `null`, making the conditional branch dead. The line should be removed.

---

**M-05 — Wrong field name: sub?.counterparty instead of sub?.counterparty_name**
Rule: "Never hardcode enum values — read from state.xxxSchema" is adjacent, but this is a direct field name bug.
`sections/subscriptions.js` line 455 builds a search term for the transaction suggestion search:

```js
const searchTerm = sub?.counterparty || sub?.name || '';
```

The subscription row object has no `counterparty` field — the field is `counterparty_name` (as confirmed by `state.subPrefill` shape in state.js line 80). `sub?.counterparty` is always `undefined`, so the search term falls back to `sub?.name`, which is also likely undefined on a subscription row (the field is `sub_name`). The result is that the search term is always empty and no transaction suggestions are ever found. Fix: `sub?.counterparty_name || sub?.sub_name || ''`.

---

**M-06 — Save buttons not disabled during API call in subscriptions**
Rule: "Disable the submit button before the first await and re-enable in the finally block" (APP-FE.md)
`subscriptions.js` `_saveAdd()` and `_saveEdit()` do not disable the Save button during the API call. Both functions are triggered via `data-action="sub-save"`, but the button has no ID, so `el()` cannot target it. A double-submit produces duplicate subscription records. The fix is to add an `id` attribute to the Save button in the rendered form HTML and use `el('subSaveBtn').disabled = true` / `false` around the await.

---

**M-07 — subViewRow declared but never used**
Rule: "State model: single mutable state object" — dead keys are noise.
`core/state.js` line 77 declares `subViewRow: null`. Nothing in `sections/subscriptions.js` reads or writes this key — view state for subscriptions uses `subEditRow` for the edit panel. If a subscription detail/view panel is not implemented, the key should be removed. If it is planned, add a TODO comment.

---

**M-08 — Duplicate delegated click listeners on transactionsContent**
Rule: "Event delegation for table row actions — never per-button addEventListener" is the base rule; the extension is: attach one delegated listener, not two.
`sections/transactions.js` attaches a delegated `click` listener to `transactionsContent` in `_attachEvents` (line 398) and a second delegated `click` listener to the same element in `_attachSuggestionEvents` (line 1651). Both listeners are added every time `renderTransactions()` runs without an AbortController or explicit cleanup. On the second render there are four listeners; on the third, six. The suggestion-handling logic should be merged into `_attachEvents` or extracted and attached only once.

---

**M-09 — Raw font-size:12px inline style in index.html**
Rule: "Never font-size: 14px — use var(--text-md)" (UX-DESIGN.md)
`app/index.html` line 80 contains:

```html
<span style="color:var(--muted);font-size:12px">–</span>
```

`font-size:12px` should use `var(--text-xs)` (defined as 12px in style-tokens.css). The inline style should be extracted to the module CSS file, or at minimum use the token.

---

## LOW

**L-01 — Spurious /* global SheetsClient */ comment in advisor.js**
Rule: Codebase hygiene.
`sections/advisor.js` line 1 reads `/* global SheetsClient */`. `SheetsClient` is never referenced anywhere in advisor.js — all API calls go through the `ExpenseAPI` wrapper imported on the next line. The comment is a stale copy from another section and should be removed.

---

**L-02 — et_transactions_cache not cleared on session logout**
Rule: "Never log session objects, PINs, or TOTP codes" is the auth rule; the extension is that stale cached data should not persist across a logout.
`main.js` line 56 writes `et_transactions_cache` to `sessionStorage`. `_shared/auth.js` `clearSession()` removes `et_session` and the legacy key `et_pin`, but does not remove `et_transactions_cache`. After logout, a new user who opens the same browser tab without a hard reload will see the previous session's transaction cache until the next API call overwrites it. Add `sessionStorage.removeItem('et_transactions_cache')` inside `clearSession()`, or move cache invalidation to the `et:logout` event handler in main.js.
