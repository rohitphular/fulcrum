# Frontend Standards Compliance Review — r1

**Scope**: All JS and HTML in `expense-tracker/app/` plus `_shared/ui.js` and `_shared/style-tokens.css`.
**Standards compared against**: APP-FE.md, UX-DESIGN.md, APP-CONVENTIONS.md, APP-LOGGING.md.

---

## Summary

| Severity | Count |
|---|---|
| HIGH | 9 |
| MEDIUM | 14 |
| LOW | 8 |
| **Total** | **31** |

---

## APP-FE violations

### HIGH

**FE-H1 — Sections call `renderXxx()` directly after mutations instead of dispatching `et:reload`**

Rule: "Always dispatch `<module>:reload` after a successful mutation — never call `loadAll()` or `renderXxx()` directly after a save."

`accounts.js` does not dispatch `et:reload` after any of its write operations. Instead, it calls `_refreshAccounts()` (a local re-fetch of accounts only), then calls `renderAccounts()` and `renderDashboard()` directly. This bypasses the `loadAll` cycle, leaving `state.transactions`, `state.categories`, and `state.rates` stale.

- `accounts.js` lines 617–619 (`_saveNew` success path): `await _refreshAccounts(); renderAccounts(); renderDashboard();`
- `accounts.js` lines 664–666 (`_saveEdit` success path)
- `accounts.js` lines 689–691 (`_confirmDelete` success path)
- `accounts.js` lines 731–733, 772–774 (`_archiveAccount`, `_submitImport`)

`categories.js` has the same pattern — calls `_reloadCategories()` then `renderCategories()` directly:

- `categories.js` lines 563–567 (`_saveNewCategory`)
- `categories.js` lines 620–623 (`_saveCatEdit`)
- `categories.js` lines 641–645 (`_deleteCat`)

`rates.js` calls `renderRates()` directly after all save/delete operations (lines 281, 316, 338, 348).

`transactions.js` **correctly** dispatches `et:reload` on save/update/delete.

---

**FE-H2 — `renderTransactions` interleaves `innerHTML` assignment with individual `addEventListener` calls**

Rule: "Set `innerHTML` first, attach events after — never interleave."
Rule: "No setTimeout for event binding. Events are always bound synchronously after `innerHTML` is set."

`renderTransactions()` sets `txEl.innerHTML` at line 194, but then immediately starts attaching individual `addEventListener` calls at lines 216–278 *inside the same function body*, interleaved with no clear separation. The calls at lines 216 (`txImportBtn`), 229 (`txAddBtn`), 242 (`txImportFile`), 257 (`txImportConfirm`), 261 (`txImportCancel`) are placed directly after `innerHTML` assignment, before `_attachEvents()` is called at line 271. This violates the clean "all HTML then all events" pattern mandated by the section pattern.

- `transactions.js` lines 216–278

---

**FE-H3 — `_attachFilterEvents` uses `document.querySelectorAll` instead of scoped delegation**

Rule: "Event delegation for table row actions — never per-button `addEventListener`. Do not use `querySelectorAll` + individual `addEventListener` for action buttons."

`_attachFilterEvents()` in `transactions.js` uses `document.querySelectorAll('[data-filter-type]').forEach(cb => cb.addEventListener('change', ...))` (line 1682) and `document.querySelectorAll('.chip-remove').forEach(btn => btn.addEventListener('click', ...))` (line 1713). These attach individual listeners to each checkbox/chip element. The correct pattern is a single delegated listener on the filter bar container.

- `transactions.js` lines 1682–1684, 1713–1720

---

**FE-H4 — `_attachFilterEvents` uses `document.querySelectorAll` (no scope)**

Rule: The delegated listener must be on the content element, not `document`. Using `document.querySelectorAll` means these listeners are being attached at the document level and can interfere with re-renders.

- `transactions.js` line 1682: `document.querySelectorAll('[data-filter-type]')`
- `transactions.js` line 1713: `document.querySelectorAll('.chip-remove')`

---

**FE-H5 — `accImportOpen`, `catImportOpen`, `txImportOpen`, `catActiveFilter`, `catFilter` are module-level state used via `state.*` but never declared in `core/state.js`**

Rule: "Add new state keys when you add a new section — don't invent local module variables for UI state."

`core/state.js` has no `accImportOpen`, `catImportOpen`, `txImportOpen`, `catActiveFilter` keys. The code in `accounts.js` (line 67: `state.accImportOpen`), `categories.js` (line 59: `state.catImportOpen`), `transactions.js` (`state.txImportOpen`) reads and writes these keys on `state` without them being declared. `catFilter` and `catActiveFilter` are declared in `state.js` (lines 30–31), but `accImportOpen`, `catImportOpen`, `txImportOpen` are not. These are ghost keys that only exist because JS objects accept arbitrary property assignment.

- `core/state.js` — keys `accImportOpen`, `catImportOpen`, `txImportOpen` are absent
- `accounts.js` lines 67, 71, 469–474
- `categories.js` lines 59, 63, 416–421
- `transactions.js` lines 202, 203, 217–226

---

**FE-H6 — `core/utils.js` uses `setTimeout(0)` for event binding deferral**

Rule: "No setTimeout for event binding. Events are always bound synchronously after `innerHTML` is set."

`openContextMenu` in `core/utils.js` at line 76 does `setTimeout(() => document.addEventListener('click', _ctxHandler, true), 0)` to defer attaching the dismiss handler.

- `core/utils.js` line 76

---

**FE-H7 — `advisor.js` uses native `confirm()` dialog**

Rule: The UX-DESIGN doc defines the confirm-delete pattern as an inline confirm strip within the page (replace the row or card), not a native browser dialog. Using `window.confirm` bypasses the Forge design pattern and creates inconsistent UX.

`advisor.js` line 139: `if (!confirm('Clear all advisor conversation history?')) return;`

- `sections/advisor.js` line 139

---

**FE-H8 — `advisor.js` does not call `showLoading()`/`hideLoading()` around API calls**

Rule (APP-FE.md): "Always wrap API calls in `showLoading()` / `hideLoading()`."
Rule (UX-DESIGN.md): "Always wrap API calls in `try/finally { hideLoading() }`."

`_loadHistory()`, `_sendMessage()`, and `_clearHistory()` in `advisor.js` make API calls via `ExpenseAPI` without calling `showLoading()`/`hideLoading()`. The section imports `showMsg` from `core/ui.js` but does not import `showLoading`/`hideLoading`.

- `sections/advisor.js` lines 46–54, 92–136, 138–151

---

**FE-H9 — `index.html` has no `<div class="loading-bar" id="loadingBar">` element**

Rule (APP-FE.md, UX-DESIGN.md): The shell template requires `<div class="loading-bar hidden" id="loadingBar"></div>` as the first element inside `<body>`.

The `_shared/ui.js` loading implementation creates a `#loadingOverlay` div dynamically (a spinner overlay), not a `#loadingBar`. The CSS in `expense-tracker.css` defines `.loading-bar` styles (lines 20–38) but no `#loadingBar` element exists in `index.html`. The two loading systems are inconsistent: the CSS implements a sliding bar (per the UX design spec) but `_shared/ui.js` injects a modal spinner overlay instead.

- `index.html` — `#loadingBar` element absent
- `_shared/ui.js` lines 3–12 — creates `#loadingOverlay` (spinner), not a bar
- `expense-tracker.css` lines 20–38 — `.loading-bar` CSS is dead code

---

### MEDIUM

**FE-M1 — `pinOverlay` starts as `hidden` in `index.html` (contrary to boot spec)**

Rule (APP-FE.md): The auth gate starts visible. `main.js` calls `hidePinGate()` when a session exists and `showPinGate()` when not. The template in UX-DESIGN.md renders the overlay without `hidden`.

`index.html` line 22: `<div class="overlay hidden" id="pinOverlay">`. The overlay starts hidden by default, meaning there is a flash where the app shell (also hidden) and the overlay are both invisible before `init()` runs. The spec assumes the overlay starts visible.

- `index.html` line 22

---

**FE-M2 — `pin-eyebrow` content does not follow the `forge · <module-name>` pattern**

Rule (UX-DESIGN.md): `<div class="pin-eyebrow">forge · <module-name></div>`

`index.html` line 24: `<div class="pin-eyebrow">Expense Tracker</div>` — missing the `forge ·` prefix.

- `index.html` line 24

---

**FE-M3 — `app-brand` does not include the `.eyebrow` element**

Rule (UX-DESIGN.md shell template): The brand block should include `<p class="eyebrow">forge · <module-name></p>` above the `<h1>`.

`index.html` lines 46–48 contain only the `<h1>` within `.app-brand`. The `.eyebrow` paragraph is absent.

- `index.html` lines 46–48

---

**FE-M4 — `subscriptions` section is not listed in the `SECTIONS` constant in `nav.js`**

Rule (APP-FE.md): `showSection` dispatches to every registered section.

`nav.js` line 11: `const SECTIONS = ['dashboard', 'accounts', 'transactions', 'subscriptions', 'categories', 'rates', 'advisor'];`. `subscriptions` IS present. (No finding — confirmed compliant.)

*Retracted — compliant.*

---

**FE-M5 — `_refreshAccounts()` and `_reloadCategories()` fetch partial data without dispatching reload**

Rule (APP-FE.md): "On any data mutation, the section dispatches `document.dispatchEvent(new CustomEvent('<module>:reload'))`. `main.js` listens on this event and re-runs `loadAll()`."

Beyond the HIGH finding (FE-H1), the local refresh helpers `_refreshAccounts()` (`accounts.js` lines 814–820) and `_reloadCategories()` (`categories.js` lines 662–665) only refresh one entity type, leaving `state.rateMap`, `state.accountMap`, `state.transactions`, etc. stale. If an account mutation affects the Net Worth dashboard (which depends on account balances converted via `rateMap`), that data is out of sync.

- `accounts.js` lines 814–820
- `categories.js` lines 662–665

---

**FE-M6 — `main.js` `setTheme()` calls individual `renderXxx()` functions on theme change instead of dispatching a reload**

Rule (APP-FE.md): "Re-render the active section when the theme changes (chart colours depend on CSS variables)." The doc says to call the render function of the active section. `main.js` currently re-renders every section individually (lines 37–43), which is expensive and bypasses the `showSection` abstraction. It also introduces duplicate render calls for whichever section is active.

- `main.js` lines 36–43

---

**FE-M7 — `main.js` renders `renderAccounts()` and `renderDashboard()` as background sections on every `loadAll()`**

Rule (APP-FE.md section pattern): "On any data mutation, the section dispatches `et:reload`..." The reload cycle calls `loadAll()` which should then call `showSection(activeSection)`. The additional calls at `main.js` lines 110–111 (`if (activeSection !== 'accounts') renderAccounts(); if (activeSection !== 'dashboard') renderDashboard();`) cause every section navigation and every mutation to re-render two hidden sections — creating unnecessary DOM work and potential Chart.js canvas side effects.

- `main.js` lines 109–111

---

**FE-M8 — `state.js` exports `VALID_TX_TYPES` as a hardcoded constant**

Rule (APP-FE.md): "Do not hardcode enum values in section HTML — read from `state.transactionSchema`."

`core/state.js` line 1 exports `export const VALID_TX_TYPES = ['money-in', 'money-out', 'money-transfer'];`. This is a hardcoded frontend enum. The transaction schema is loaded from the backend at boot precisely to avoid this. The array is then used in `transactions.js` line 187 to classify "warn rows". If the backend ever adds a new type, this check will false-positive.

- `core/state.js` line 1
- `transactions.js` line 187

---

**FE-M9 — `subscriptions.js` uses hardcoded `TX_TYPES` constant instead of `state.transactionSchema`**

Rule (APP-FE.md): "Do not hardcode enum values in section HTML — read from `state.transactionSchema`."

`subscriptions.js` lines 27–32 define a local `TX_TYPES` constant with hardcoded transaction type values. The form dropdown is built from this constant (line 33–39, `_txTypeOpts()`), not from `state.transactionSchema?.types`.

- `sections/subscriptions.js` lines 27–32

---

**FE-M10 — `categories.js` uses hardcoded type options in the form instead of `state.categorySchema`**

Rule (APP-FE.md): "Do not hardcode enum values in section HTML — read from `state.categorySchema`."

`categories.js` lines 91–93: `const typeOpts = ['money-in', 'money-out', 'money-transfer'].map(...)`. The transaction type list is hardcoded rather than read from `state.transactionSchema?.types` or `state.categorySchema`.

- `sections/categories.js` lines 91–93

---

**FE-M11 — `categories.js` has hardcoded account type fallback arrays at module level**

Rule (APP-FE.md): "Never hardcode enum values — read from `state.xxxSchema`."

`categories.js` lines 11–13 define `_ASSET_FALLBACK`, `_CREDIT_FALLBACK`, `_LOAN_FALLBACK` as module-level constants hardcoding sub-type values that should come from `state.accountSchema`. While these are labeled as fallbacks, the `_acctTypeGroups()` function at lines 15–22 uses them whenever schema keys are absent. Hardcoded fallbacks for schema-driven enums run counter to the schema-first rule.

- `sections/categories.js` lines 11–13

---

**FE-M12 — `rates.js` disables buttons via inline `style.opacity` and `style.pointerEvents` instead of `disabled`**

Rule (APP-FE.md): Forms should use the standard button-disable pattern (`btn.disabled = true`). The UX-DESIGN.md spinner pattern shows `el('submitBtn').disabled = true`.

`rates.js` `_saveNewRate()` and `_saveEdit()` at lines 273, 285, 289, 308, 321, 325 set `saveBtn.style.opacity = '.4'; saveBtn.style.pointerEvents = 'none'` instead of `btn.disabled = true`. This is an inconsistent pattern — all other sections use `btn.disabled`.

- `sections/rates.js` lines 273, 285, 289, 308, 321, 325

---

**FE-M13 — `transactions.js` sorts on column `tx_date_time` but `state.txSort.col` is initialised to `'tx_date_time'`**

State is correct (line 26 in `state.js`). However, the `thSort` helper in `transactions.js` line 291 passes `'tx_date_time'` as `col`, which matches the field name used in `_sortTx`. (Confirmed correct — no violation here.)

*Retracted — compliant.*

---

**FE-M14 — `_submitTxImport` success path calls `renderTransactions()` directly after a local re-fetch instead of dispatching `et:reload`**

Rule: After a successful mutation, dispatch `et:reload` — do not call `loadAll` or `renderXxx` directly.

`transactions.js` lines 1594–1601: after a successful bulk import, the code does `const r = await ExpenseAPI.listTransactions(); if (r.ok) { state.transactions = r.data || []; ... } renderTransactions();` instead of dispatching `et:reload`. This re-renders transactions but leaves accounts and dashboard balances stale (account balances change when transactions are created).

- `transactions.js` lines 1594–1597, 1626–1628

---

### LOW

**FE-L1 — `daterange.js` exports `txInRange` but APP-FE.md documents only `getRangeBounds()` and `filteredTx()`**

Rule (APP-FE.md): The documented exports from `core/daterange.js` are `getRangeBounds()` and `filteredTx()`.

`daterange.js` also exports `txInRange` (line 27) which is not in the specification. This is minor — it is a reasonable extraction — but it is undocumented.

- `core/daterange.js` line 27

---

**FE-L2 — `core/utils.js` exports `openContextMenu` and `closeContextMenu` — not listed in utility catalog**

Rule (APP-FE.md / APP-SHARED-UTILS.md): The utility catalog lists specific functions; new shared utilities should be documented.

The context menu functions in `core/utils.js` lines 40–77 are not documented in `APP-SHARED-UTILS.md` or `APP-FE.md`.

- `core/utils.js` lines 40–77

---

**FE-L3 — `subscriptions.js` uses `AbortController` pattern for event cleanup, not present anywhere else**

Rule (APP-FE.md): The section pattern says "attach events after innerHTML is set." There is no documented pattern for `AbortController`-based listener cleanup.

`subscriptions.js` lines 379–383 use `AbortController` to abort previous event listeners before re-attaching. No other section does this. While technically valid, it is an inconsistent pattern that differs from the documented approach (re-render replaces DOM, so old listeners become orphaned naturally).

- `sections/subscriptions.js` lines 379–383

---

---

## UX-DESIGN violations

### HIGH

*(See FE-H7 for `confirm()` dialog, FE-H9 for loading bar mismatch — both have UX-DESIGN roots.)*

### MEDIUM

**UX-M1 — CSS badge classes for transaction types are not prefixed with the module slug**

Rule (APP-CONVENTIONS.md, UX-DESIGN.md): "Module-specific badge or colour variants are prefixed with the module slug: `.badge-et-in`, `.badge-et-out`."

`expense-tracker.css` lines 524–526 define `.badge-in`, `.badge-out`, `.badge-transfer` without the `et` slug prefix. The convention doc explicitly shows `.badge-et-in` and `.badge-et-out` as examples.

- `expense-tracker.css` lines 524–526, 820–821
- `sections/transactions.js` (usages throughout, e.g. line 300: `'badge-in'`)
- `sections/categories.js` line 288

---

**UX-M2 — Raw hex values used in CSS for badge colours instead of design tokens**

Rule (UX-DESIGN.md, APP-FE.md): "Never use raw hex values — always use tokens."

`expense-tracker.css` lines 524–525:
- `.badge-in { color: #0B6F63; background: #E6F5F2; }` — these hex values are not design tokens
- `.badge-out { color: #9A2C1A; background: #FEF0EC; }` — same
- Dark mode overrides at lines 820–821 also use raw hex values

- `expense-tracker.css` lines 524–525, 820–821

---

**UX-M3 — Raw hex `#fff` and other hardcoded colours used in CSS**

Rule: "Never define raw pixel sizes or hex colours in module CSS — always use tokens."

Multiple instances of `#fff` and other raw hex values appear in the CSS, notably:
- Line 189: `.range-btn.active { color: #fff; }` — should be a token (e.g. a `--on-accent` token, or just `white`)
- Line 318: `.btn-danger { color: #fff; }` 
- Line 606: `color: #fff;` (teal button active state)
- Lines 1135, 1140, 1154, 1204, 1266: multiple `color: #fff` in advisor section styles

- `expense-tracker.css` lines 189, 318, 606, 1135, 1140, 1154, 1204, 1266

---

**UX-M4 — Raw pixel `font-size` values in CSS instead of type scale tokens**

Rule: "Never use `font-size: 14px`. Use `font-size: var(--text-md)`."

`expense-tracker.css` uses raw px values in multiple places:
- Line 85: `font-size: 20px` (pin input)
- Line 144: `font-size: 16px` (theme button)
- Line 215: `font-size: 18px`
- Line 353: `font-size: 18px`
- Line 927: `font-size: 16px`
- Lines 972, 1004, 1036: `font-size: 9px`, `10px`, `8px` (dot indicators — no token exists for these)
- Line 1173: `font-size: 28px`
- Line 1268: `font-size: 20px`
- Line 1285: `font-size: 18px`

These should use type scale tokens (`var(--text-xl)`, `var(--text-2xl)`, etc.).

- `expense-tracker.css` — multiple lines cited above

---

**UX-M5 — Heavy use of inline `style=` on HTML elements in section templates instead of CSS classes**

Rule (UX-DESIGN.md): "Do not invent new utility-style classes... use the existing token-based CSS." Inline styles should be used sparingly for dynamic values only (e.g. `display: none` toggling, JS-computed positions).

Section templates across `accounts.js`, `transactions.js`, `categories.js`, `rates.js` contain extensive inline styles for static layout values that should be CSS classes:

Examples:
- `accounts.js` line 66: `style="display:flex;gap:8px"` (header button group)
- `accounts.js` line 105: `style="margin-bottom:20px"` (summary grid)
- `accounts.js` line 370: `style="color:var(--muted);font-size:11px"` (ID cell — raw `11px`)
- `accounts.js` line 372: `style="color:var(--muted);font-size:12px"` (type cell — raw `12px`)
- `accounts.js` line 385: full inline styling for group header `<td>`
- `transactions.js` line 490: `style="max-width:240px"` (FX rate input)
- `transactions.js` line 1058: `style="display:inline-flex;gap:8px;margin-left:16px"` (delete confirm strip)
- `transactions.js` line 1561: `style="font-size:13px;color:var(--muted);margin:0"` (raw `13px`)

- Affects: `accounts.js`, `transactions.js`, `categories.js`, `rates.js`, `subscriptions.js`

---

### LOW

**UX-L1 — `accounts.js` inline `_renderNetWorth()` uses `.summary-grid` and `.summary-card` classes; `subscriptions.js` uses the same — these are undocumented shared classes**

Rule: CSS classes that appear in multiple sections should be in documented shared CSS or at minimum be clearly intentional cross-section classes. Neither `.summary-grid` nor `.summary-card` appears in `UX-DESIGN.md`.

- `accounts.js` lines 104–122
- `subscriptions.js` lines 220–231
- `expense-tracker.css` (class must be defined there)

---

---

## APP-CONVENTIONS violations

### MEDIUM

**CONV-M1 — `state.txSort.col` is initialised to `'tx_date_time'` but the field name on transactions is `tx_date_time` which is correct; however the label in the sort header says `'Date'` not `'Date & time'`**

Minor label/naming inconsistency — no conventions violation.

*Retracted.*

---

**CONV-M2 — `subscriptions:reload` is a non-standard custom event slug**

Rule (APP-CONVENTIONS.md): "Custom events use `<slug>:<verb>` format. The expense tracker slug is `et`."

`subscriptions.js` dispatches `new CustomEvent('subscriptions:reload')` (lines 532, 571, 609, 625). The correct event for the `et` module is `et:reload`. `main.js` listens for both `et:reload` and `subscriptions:reload` (line 174), suggesting this was a deliberate workaround, but it violates the slug convention. The event name should be `et:reload`.

- `sections/subscriptions.js` lines 532, 571, 609, 625
- `main.js` line 174

---

**CONV-M3 — `subViewRow` state key is missing from `core/state.js`**

Rule (APP-CONVENTIONS.md state key pattern): Each section should have `xxxAddOpen`, `xxxViewRow`, `xxxEditRow`, `xxxDeleteRow`.

`core/state.js` has `subAddOpen`, `subEditRow`, `subDeleteRow`, `subPrefill` (lines 74–77) but no `subViewRow`. The subscriptions section does not implement a view card, so this may be intentional, but it deviates from the documented pattern without explanation.

- `core/state.js` lines 74–77

---

**CONV-M4 — Generic variable names used in catch blocks**

Rule (APP-CONVENTIONS.md): "`data`, `info`, `result`, `item`, `obj`, `temp` are banned as standalone variable names."

Catch blocks throughout the codebase use `catch (_)` — an underscore as a throwaway — which is acceptable (it signals intentional discard). However several places use a bare `_` which technically could conflict with lodash if ever imported. This is a minor style note rather than a hard convention breach.

- Not a hard violation; noting for completeness.

---

### LOW

**CONV-L1 — `core/utils.js` defines module-level mutable variables `_ctxMenuEl` and `_ctxHandler`**

Rule (APP-CONVENTIONS.md): Module-level mutable state should live in `core/state.js`. Private module-level `let` variables for UI state (context menu element, handler reference) are not in `state` and not mentioned in the state shape.

- `core/utils.js` lines 37–38

---

**CONV-L2 — `dashboard.js` uses a module-level `let _renderId` and `let _shellAbort` outside of `state`**

Rule (APP-CONVENTIONS.md / APP-FE.md): "Add new state keys when you add a new section — don't invent local module variables for UI state."

`dashboard.js` lines 65–66: `let _renderId = 0; let _shellAbort = null;`. These are module-level mutable variables tracking render lifecycle. `_renderId` is incremented on every `renderDashboard()` call and used to cancel stale async renders — this is a valid optimization but the mutable state lives outside `core/state.js`.

- `sections/dashboard.js` lines 65–66

---

---

## APP-LOGGING violations

### MEDIUM

**LOG-M1 — No frontend logging at any warning or error level in any section**

Rule (APP-LOGGING.md): "Backend returns `ok: false` on a call that should not fail → `console.warn('[api] ...' + response)`; Caught exception → `console.error('[transactions] renderTransactions: ' + err)`."

None of the section files (`transactions.js`, `accounts.js`, `categories.js`, `rates.js`, `advisor.js`, `subscriptions.js`) emit a single `console.warn` or `console.error` call. All API failures are surfaced only via `showMsg()` visible to the user, but no console logging exists for developer debugging. If the app behaves unexpectedly, there is zero console evidence.

The `_loadHistory` function in `advisor.js` (lines 46–54) silently swallows exceptions with `catch (_) {}` — no logging at all.

- All section files
- `sections/advisor.js` lines 46–54

---

**LOG-M2 — `main.js` swallows the top-level `loadAll` exception with no logging**

Rule (APP-LOGGING.md): "Caught exception in an async section handler → `console.error`."

`main.js` line 113: `} catch (_) { showMsg('Connection error — check your internet and reload.', 'warn'); }` — the exception is caught, the user sees a message, but nothing is logged to the console for the developer.

- `main.js` line 113

---

### LOW

**LOG-L1 — `core/schema.js` does not log schema fetch failures**

Rule (APP-LOGGING.md): "Schema load failure → `console.warn('[schema] account schema fetch failed, using fallback')`."

`loadAccountSchema()`, `loadTransactionSchema()`, `loadCategorySchema()` in `schema.js` (lines 7–44) return `null` silently when `res.ok` is false. No `console.warn` is emitted.

- `core/schema.js` lines 7–44

---
