# Forge Expense Tracker — Backend Code Review: Round 2 Findings

**Reviewer**: Claude (automated, r2)
**Scope**: All `.gs` files in `expense-tracker/api/`
**Reference docs**: APP-BE.md, APP-AUTH.md, APP-CONVENTIONS.md, APP-LOGGING.md, APP-SHARED-UTILS.md
**Skipped**: All items confirmed fixed in r1 (see task brief)

---

## Summary Table

| ID | Severity | Domain | Title |
|---|---|---|---|
| H-01 | HIGH | advisor-core | `getSheetByName` called directly twice — violates core rule |
| H-02 | HIGH | advisor-core | `_callOpenAi` has no logging on success or failure |
| H-03 | HIGH | category-schema | `getCategorySchemaForClient` iterates the wrong set — sends wrong `account_types` to frontend |
| H-04 | HIGH | transaction-validation | `_checkBalanceRules` comment claims Rules 2 & 4 but code enforces neither — misleading |
| H-05 | HIGH | subscription-validation | `validateSubscriptionUpdate` doesn't validate `frequency`, `day_of_month`, `day_of_week`, or `source_account` |
| M-01 | MEDIUM | category-schema | Schema fields missing required `applies_to` and `required_for` keys |
| M-02 | MEDIUM | subscription-schema | Schema fields missing required `applies_to` key on every field |
| M-03 | MEDIUM | category-schema | Missing `getFieldsForCategoryType` required helper function |
| M-04 | MEDIUM | subscription-schema | Missing `getFieldsForSubscriptionType` required helper function |
| M-05 | MEDIUM | rate-schema | Missing `getFieldsForRateType` required helper function |
| M-06 | MEDIUM | app-router | `list_transactions` and `list_categories` no longer call their migration helpers |
| M-07 | MEDIUM | account-core | Currency cross-entity validation is in `createAccount` (core), not `validateAccountCreate` (validation) |
| M-08 | MEDIUM | advisor-core | `_callOpenAi` error returns `data.error.message` (free-form string), violating the error-code convention |
| M-09 | MEDIUM | subscription-core | `listSubscriptions` boolean coercion is inconsistent — misses the canonical pattern |
| M-10 | MEDIUM | app-auth | `recordAccess` and `checkPin` produce no logs — violating the required-events spec |
| L-01 | LOW | subscription-utils | `_dateGte` is defined but never called — dead code |
| L-02 | LOW | transaction-validation | `validateTransactionUpdate` does not reject immutable fields via `field_not_editable` |
| L-03 | LOW | subscription-validation | `validateSubscriptionUpdate` does not reject immutable fields via `field_not_editable` |
| L-04 | LOW | advisor-core | Advisor sheet columns passed as raw array literal in 5 call sites; no constant defined |
| L-05 | LOW | app-config | `ADVISOR_SHEET` constant defined after comment block about removed constants — ordering inconsistency |
| L-06 | LOW | category-core | `createCategory` returns `{ ok: true }` without an `id` field, inconsistent with all other creates |
| L-07 | LOW | transaction-validation | `_checkBalanceRules` comment heading still says "Rules 1–4" but only enforces 1 & 3 |

---

## HIGH Severity

---

**H-01 — `getSheetByName` called directly twice in `advisor-core.gs`**

Rule: "Always `getOrCreateSheet` — never `SpreadsheetApp.getActiveSpreadsheet().getSheetByName(...)` directly — it returns `null` if the sheet doesn't exist and the next call throws."

`_buildSnapshot` (advisor-core.gs:102) and `_fetchRequestedData` (advisor-core.gs:211) both call `ss.getSheetByName(TRANSACTIONS_SHEET)` directly. Both then guard for `null`, so the immediate crash is avoided, but they silently return empty data rather than creating the sheet and returning real data. When the transactions sheet doesn't exist yet (e.g. fresh deployment before first transaction), the advisor snapshot will always show zero transactions. More importantly, this violates the single rule that exists to keep sheet access consistent across the codebase.

`_buildSnapshot` (line 102–103):
```js
const txSheet = ss.getSheetByName(TRANSACTIONS_SHEET);
const allTx   = txSheet ? sheetToObjects(txSheet) : [];
```

`_fetchRequestedData` (line 211–212):
```js
const txSheet = ss.getSheetByName(TRANSACTIONS_SHEET);
if (!txSheet) return [];
```

Fix: replace both with `getOrCreateSheet(TRANSACTIONS_SHEET, getTransactionSheetColumns())`. The null guard can then be removed since `getOrCreateSheet` never returns null.

---

**H-02 — `_callOpenAi` produces no logs on success or failure**

Rule: "External API call | `log` | `_callOpenAi: status=200 tokens=312`" and "External API error | `warn` | `_callOpenAi: status=429 error="rate_limit_exceeded"`" (APP-LOGGING.md — What to always log).

`_callOpenAi` (advisor-core.gs:166–189) makes a live HTTP call but logs nothing — not the status code on success, not a warning on non-200, and not the caught error message. The catch block silently returns `{ ok: false, error: 'fetch_error: ...' }`. In GAS, the Executions tab is the only debuggability surface for an invocation. Without a log, there is no way to diagnose OpenAI rate-limit hits, quota exhaustion, or network failures after the fact.

Fix: add `console.log('_callOpenAi: status=' + code)` on the 200 path and `console.warn('_callOpenAi: status=' + code + ' error=' + ...)` on the non-200 path. In the catch: `console.error('_callOpenAi: ' + e.message)`.

---

**H-03 — `getCategorySchemaForClient` iterates `VALID_ACCOUNT_TYPES` but maps with sub-type labels**

Rule: "Client-safe schema subset (enums, labels, groupings) — returned by `get_<domain>_schema` action" (APP-BE.md — schema helper functions).

`getCategorySchemaForClient` (category-schema.gs:168) calls `VALID_ACCOUNT_TYPES.map(...)`. `VALID_ACCOUNT_TYPES` is `['asset', 'investment', 'liability']` (three items). The `labels` and `groups` maps inside the function, however, key on sub-type values (`current`, `savings`, `mortgage`, `credit_card`, etc.). None of those sub-type keys match `'asset'`, `'investment'`, or `'liability'`, so:

- `labels['asset']` → `undefined` → label falls back to `'asset'`
- `labels['investment']` → `'Investment'` (coincidentally present)
- `labels['liability']` → `undefined` → label falls back to `'liability'`

The frontend receives `account_types: [{value:'asset', label:'asset'}, {value:'investment', label:'Investment'}, {value:'liability', label:'liability'}]` — not the full sub-type list with labels and groups that the category form needs. The category `source_account_types` and `target_account_types` fields store top-level type values (`asset`, `investment`, `liability`), so the values array is technically correct, but the labels and groups are wrong for two of the three items.

Fix: Either change to iterate a dedicated label map for the three types, or (if the frontend needs sub-types here) change to iterate a combined sub-types array built from `ASSET_SUB_TYPES`, `INVESTMENT_SUB_TYPES`, and `LIABILITY_SUB_TYPES`.

---

**H-04 — `_checkBalanceRules` comment claims to enforce Rules 2 & 4 but does not**

Rule: "Server-side enforcement of the six financial rules" (financial-rules.md — Building this in any language → Required regardless of platform: "Server-side enforcement of the six financial rules").

The function header comment (transaction-validation.gs:159–160) states "Rules 2 & 4 — source-side credit-card limit cannot be exceeded." The actual code (lines 244–258) returns `null` for all liability accounts unconditionally:

```js
if (!isLiabilityType(sourceAccount.type)) {
  // ... check assets ...
  return null;
}
return null;   // ← liability always returns null (no limit check)
```

This is partially expected: financial-rules.md (Rule 2, line 21) says the rule is "defined but not enforced" pending reintroduction of a `credit_card_limit` field. The real problem is the comment on line 159 saying it *is* enforced. A developer reading the comment without reading the doc will think credit-card limit is enforced server-side. The misleading comment is a correctness risk for anyone who adds a limit field later.

Fix: update the comment on line 159 to reflect reality — something like "Rules 1 & 3 — asset/investment balance cannot go negative (Rules 2 & 4 are intentionally unenforced: credit_card_limit field not yet added; see financial-rules.md)."

---

**H-05 — `validateSubscriptionUpdate` does not validate `frequency`, `day_of_month`, `day_of_week`, or `source_account`**

Rule: "Validation order (always in this sequence): 1. Required fields — check presence before anything else. 2. Enum values — validate against the schema's `VALID_*` array. 3. Numeric ranges" (APP-BE.md — validation.gs section).

`validateSubscriptionUpdate` (subscription-validation.gs:32–49) only checks `row_num`, `name`, `amount` (optional), and `is_active` (optional). It does not validate:

- `frequency`: can be set to any string; an invalid value will pass and be written to the sheet, breaking `computeNextPaymentDate` silently
- `day_of_month` / `day_of_week`: range checks (1–31, 1–7) present in create are absent on update
- `source_account`: required on create, not checked on update — an empty or invalid account ID can be written

This means a `PUT`-style update can corrupt a subscription's schedule or account reference without any server-side rejection.

Fix: extract the frequency/schedule validation into a shared `_validateSchedule(body)` helper and call it from both `validateSubscriptionCreate` and `validateSubscriptionUpdate`.

---

## MEDIUM Severity

---

**M-01 — Category schema fields missing `applies_to` and `required_for` keys**

Rule: "Schema object structure" (APP-BE.md — every field in the schema object must have: `applies_to`, `required_for`, `editable`, `default_value`).

All 13 fields in `CATEGORY_SCHEMA` (category-schema.gs:12–157) are missing `applies_to` and `required_for`. These are mandatory keys in the schema object shape. Their absence makes schema-driven validation impossible (both the update-immutability check pattern and the `getFieldsFor*` pattern rely on these keys being present).

Fix: add `applies_to: null` and `required_for: []` to every field in `CATEGORY_SCHEMA`. Use `required_for: null` for fields that are required for all variants (equivalent to "required for any create").

---

**M-02 — Subscription schema fields missing `applies_to` key**

Rule: Same as M-01 — every schema field must include `applies_to`.

All 16 fields in `SUBSCRIPTION_SCHEMA` (subscription-schema.gs:13–207) have `required_for` but are missing `applies_to`. The field is not needed for current logic (there are no variant-specific fields for subscriptions) but its absence means any future schema-driven code will fail silently.

Fix: add `applies_to: null` to every field in `SUBSCRIPTION_SCHEMA`.

---

**M-03 — Category schema is missing the `getFieldsForCategoryType` required helper function**

Rule: "Required helper functions — every schema file must have all of these" — the fifth required function is `getFieldsFor<Domain>Type(type)` (APP-BE.md — domain-schema.gs section).

`category-schema.gs` defines only `getCategorySheetColumns`, `getCategorySchemaField`, and `catColIndex`. The `getFieldsForCategoryType` helper is absent. This also means schema-driven update validation (checking `editable` on each field before writing, or checking `required_for` for specific variants) is not structurally available for categories — the author has to manually enumerate fields in validation code instead of driving from the schema.

Fix: add `getFieldsForCategoryType(type)` following the pattern in account-schema.gs:193 and transaction-schema.gs:252.

---

**M-04 — Subscription schema is missing the `getFieldsForSubscriptionType` required helper function**

Rule: Same as M-03.

`subscription-schema.gs` defines `getSubscriptionSchemaForClient`, `getSubscriptionSheetColumns`, `getSubscriptionSchemaField`, and `subColIndex`. `getFieldsForSubscriptionType` is absent.

Fix: add the helper. Since `SUBSCRIPTION_SCHEMA` has no `applies_to` variants, the function will simply return all fields, but the interface must exist for consistency.

---

**M-05 — Rate schema is missing the `getFieldsForRateType` required helper function**

Rule: Same as M-03.

`rate-schema.gs` defines `getRateSheetColumns`, `getRateSchemaField`, `rateColIndex`, and `getRateSchemaForClient`. `getFieldsForRateType` is absent.

Fix: add the helper. Since rate has no variant types, it will return all fields for any input.

---

**M-06 — Router no longer calls migration helpers before `list_transactions` and `list_categories`**

Rule: "List actions that call migration functions do so **before** calling the list function: `migrateXxx(); return json({ ok: true, data: listXxx() });`" (APP-BE.md — Migration functions section). The doc explicitly names `migrateTransactionColumnHeaders()` and `migrateCategoryMandatoryFlags()` as the current migration functions.

The current router (app-router.gs:34–35) calls list functions directly:

```js
if (action === 'list_transactions')  { return json({ ok: true, data: listTransactions() }); }
if (action === 'list_categories')    { return json({ ok: true, data: listCategories() }); }
```

Neither `migrateTransactionColumnHeaders()` nor `migrateCategoryMandatoryFlags()` exist anywhere in the codebase, and neither is called by the router. If these migrations were removed intentionally (because the schema columns they back-filled now exist on all rows), the doc should be updated and the pattern note removed. If they were simply dropped in r1 cleanup without replacement, any sheets created before the current schema was final may silently serve old column names to the frontend.

Fix: either add the migration functions if the back-fill is still needed, or explicitly document in a code comment that they have been intentionally removed and why. The doc paragraph referencing them should be updated.

---

**M-07 — Currency cross-entity validation lives in `createAccount` core, not in `validateAccountCreate`**

Rule: "6. Cross-entity rules — e.g. account ID exists, currency is in the rates sheet" are the last step in the validation function sequence (APP-BE.md — validation.gs). "Validate first — nothing is written if validation fails" (core create pattern).

`validateAccountCreate` (account-validation.gs:6) does not check whether `body.currency` is in the rates sheet. That check happens in `createAccount` (account-core.gs:20–27) after the validation call returns `{ ok: true }`. While this still prevents sheet writes on an unknown currency, it splits validation logic across two files — the currency rejection happens in core code, not validation code. If another path ever calls `validateAccountCreate` to pre-check a body (e.g. in a future bulk endpoint that wants to pre-validate before committing), the currency check will be skipped.

Fix: move the currency existence check (the `listRates` lookup) into `validateAccountCreate` as step 6. Keep only the account creation mechanics in the core function.

---

**M-08 — `_callOpenAi` returns `data.error.message` as the `error` field — a free-form string, not a snake_case error code**

Rule: "Error codes: `snake_case`, returned as the `error` field in `{ ok: false, error: '...' }` responses. Describe the condition, not the HTTP verb." (APP-CONVENTIONS.md — Error codes).

On a non-200 response, `_callOpenAi` (advisor-core.gs:183) does:

```js
return { ok: false, error: data.error ? data.error.message : 'api_error_' + code };
```

`data.error.message` from the OpenAI API is a human-readable string like `"The model 'gpt-4o' does not exist"` — multiple words, spaces, not snake_case. The frontend consuming this response will receive a non-conforming `error` value.

Fix: map it to a structured code: `'openai_' + code` (e.g. `'openai_429'`) and put the message into a `detail` key: `{ ok: false, error: 'openai_' + code, detail: data.error.message }`. This makes the error machine-readable while preserving the human-readable detail.

Similarly, the catch block returns `'fetch_error: ' + e.message` — the colon+space turns the value into two words, violating the convention. This should be `{ ok: false, error: 'fetch_error', detail: e.message }`.

---

**M-09 — `listSubscriptions` boolean coercion is incomplete and non-canonical**

Rule: "Boolean coercion rule: Always coerce: `v === true || String(v).toLowerCase() === 'true'`. Do this in list functions, not in core create/update." (APP-BE.md — list pattern).

`listSubscriptions` (subscription-core.gs:11) uses:
```js
const isActive = row.is_active === true || row.is_active === 'true' || row.is_active === 'TRUE';
```

This adds a third case (`=== 'TRUE'`) that is unnecessary because the canonical pattern lowercases before comparing: `String(v).toLowerCase() === 'true'` already matches `'TRUE'`, `'True'`, etc. More importantly, `is_active` is coerced but the result is only used to compute `next_payment_date` — the `row.is_active` property on the returned object is NOT replaced with the coerced boolean. The frontend will receive `is_active` as whatever string Sheets stored (`"TRUE"`, `"FALSE"`, `true`, `false`). For every other domain (accounts, categories), the coerced value is written back: `r.is_active = toBool(r.is_active)`.

Fix: add `row.is_active = isActive;` inside the `forEach`, and use the canonical two-case pattern to match all other list functions.

---

**M-10 — Auth events produce no logs — violating the required-events list**

Rule: APP-LOGGING.md specifies these as mandatory log events:
- Auth failure (PIN wrong): `log` — `checkPin: fail ip=1.2.3.4`
- IP locked: `log` — `recordAccess: locked ip=1.2.3.4 failures=3`
- IP unlocked (first success after failures): `log` — `recordAccess: success ip=1.2.3.4`

`checkPin` (app-utils.gs:57–60) produces no log on failure. `recordAccess` (app-auth.gs:61–100) produces no logs at all — neither on lock trigger nor on success. This is the most important audit trail in the system (PIN failures and IP lockouts) and it is entirely silent in Stackdriver.

Fix:
- In `checkPin`, after the result is computed: `if (!result) console.log('checkPin: fail');` (note: the IP is not available here — the router can log after a `checkPin` failure with `console.log('doGet: auth_fail ip=' + meta.ip)`)
- In `recordAccess`, add `console.log('recordAccess: locked ip=' + ip + ' failures=' + failureCount)` when `shouldLock` is true
- Add `console.log('recordAccess: success ip=' + ip)` when `success` is true and the previous failure count was > 0 (first clean pass after failures)

---

## LOW Severity

---

**L-01 — `_dateGte` in `subscription-utils.gs` is dead code**

Rule: "Don't use generic names" / general codebase hygiene; functions that are not called should be removed.

`_dateGte(d, year, month, day)` (subscription-utils.gs:108–111) is defined but never called anywhere in the codebase. It was presumably a helper considered during the implementation of `_nextCycleDate` but the final implementation used inline `Date` comparison instead.

Fix: delete the function.

---

**L-02 — `validateTransactionUpdate` does not reject immutable fields with `field_not_editable`**

Rule: "For update validation, also reject requests that send immutable fields (`editable: false`): `return { ok: false, error: 'field_not_editable:' + field.key }`" (APP-BE.md — validation.gs section).

`validateTransactionUpdate` (transaction-validation.gs:30–50) checks required fields, type validity, amount, and financial rules, but never iterates the schema to reject incoming immutable fields (e.g. `id`, `tx_type`, `created_at`). By contrast, `validateAccountUpdate` (account-validation.gs:36–42) does implement this check. `tx_type` is marked `editable: false` in the transaction schema but `updateTransaction` uses `body.tx_type` for workflow resolution — deliberately allowing type changes across an update. If the intent is to allow type changes, the field should be marked `editable: true`. If not, the update handler reads an immutable field without a validation gate.

Fix: determine whether `tx_type` is intentionally editable on update (change schema `editable: true`) or not (add the field rejection loop to `validateTransactionUpdate` and stop using `body.tx_type` in the update path — re-read it from `oldRow`).

---

**L-03 — `validateSubscriptionUpdate` does not reject immutable fields with `field_not_editable`**

Rule: Same as L-02.

`validateSubscriptionUpdate` (subscription-validation.gs:32–49) does not iterate the schema to reject attempts to set `id` or `created_at`. Given that these fields are `editable: false` in the schema and `writeField` silently skips them, the risk is low — the immutable values cannot be overwritten. But the convention says to explicitly reject them at the validation gate.

Fix: add the immutable-field rejection loop (same pattern as `validateAccountUpdate`).

---

**L-04 — Advisor sheet columns repeated as a raw array literal in 5 call sites**

Rule: "Every sheet name is a constant here. Never use a raw string like `'transactions'` in a core file." (APP-BE.md — app-config.gs). By extension, column definitions also belong to named constants, not raw literals scattered across call sites.

`advisor-core.gs` calls `getOrCreateSheet(ADVISOR_SHEET, ['timestamp', 'role', 'content'])` on lines 42, 49, 58, 68, and 73. The column array is duplicated five times. If a column is added or renamed, all five must be updated manually.

Fix: define `const ADVISOR_COLUMNS = ['timestamp', 'role', 'content'];` in `app-config.gs` (near the `ADVISOR_SHEET` constant) and replace all five occurrences.

---

**L-05 — `ADVISOR_SHEET` constant placement in `app-config.gs`**

Rule: "Defines sheet name constants and module-level config values. Nothing else." (APP-BE.md — app-config.gs section). "Comments mark removed constants so collaborators know where they moved."

`app-config.gs` lists `ADVISOR_SHEET = 'advisor_chat'` (line 20) after the block of removal comments (lines 13–19) that document moved constants. The logical grouping is broken — all sheet-name constants should appear together before any removal notes. Minor but affects readability.

Fix: move the `ADVISOR_SHEET` declaration up to sit alongside the other sheet constants (lines 6–11).

---

**L-06 — `createCategory` returns `{ ok: true }` without an `id` field**

Rule: "Every function that succeeds: `{ ok: true, ...data }`" (APP-BE.md — return shape consistency). All other create functions return `{ ok: true, id: id }`: `createAccount` returns `id`, `createSubscription` returns `id`, `createTransaction` returns `id`.

`createCategory` (category-core.gs:65) returns only `{ ok: true }`. Categories do not have an auto-generated `id` field (the key is the composite `(tx_type, major_category, minor_category)` triple), so there is no single ID to return. However, the return shape is inconsistent with every other create. The frontend may rely on `r.id` to update local state after a create.

Fix: if no natural ID is warranted, document the exception with a comment in the function. If a synthetic ID is desirable for frontend state management, add a `CAT-` prefixed ID field to the category schema.

---

**L-07 — `_checkBalanceRules` function comment heading is incorrect**

Rule: Code comments must accurately describe what the code does (general correctness).

The comment on transaction-validation.gs:239 reads: `// Rules 1–4 (source side): asset insufficient balance, credit-card limit exceeded.`

The function only enforces Rules 1 and 3. Rules 2 and 4 are intentionally not enforced (per financial-rules.md). The comment creates a false sense of security.

Fix: change the comment to `// Rules 1 & 3 (source side): asset/investment balance cannot go negative.` and add a note that Rules 2 & 4 are pending a credit_card_limit schema field.

---

*End of r2 findings — 7 HIGH+MEDIUM issues require fixes before next deploy; LOW items can be batched.*
