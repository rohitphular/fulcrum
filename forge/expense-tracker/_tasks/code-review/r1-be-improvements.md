# Backend Standards Compliance Review — R1

**Scope**: All `.gs` files in `expense-tracker/api/`
**Standards reviewed**: APP-BE.md, APP-AUTH.md, APP-SHARED-UTILS.md, APP-LOGGING.md, APP-CONVENTIONS.md
**Date**: 2026-08-06

---

## Summary

| Severity | Count |
|---|---|
| HIGH | 14 |
| MEDIUM | 11 |
| LOW | 9 |
| **Total** | **34** |

---

## APP-BE — Backend Coding Guide

### Router

**[HIGH] BE-01 — Migration helpers not called before `list_transactions` and `list_categories`**

Rule (APP-BE.md §"app-router.gs — the entry point"): "List actions that call migration functions do so **before** calling the list function: `migrateXxx(); return json({ ok: true, data: listXxx() });`". The doc example shows `migrateTransactionColumnHeaders()` and `migrateCategoryMandatoryFlags()` invoked inline on their respective list actions.

Code: `app-router.gs` lines 34–35 dispatch directly to `listTransactions()` and `listCategories()` without calling any migration helper first. Neither `migrateTransactionColumnHeaders` nor `migrateCategoryMandatoryFlags` exist anywhere in the codebase.

File: `app-router.gs`, lines 34–35.

---

**[LOW] BE-02 — `doGet` router uses braces inconsistently across action lines**

Rule (APP-CONVENTIONS.md §"JavaScript style"): "Braces: Always for `if`/`for`/`while` bodies, even one-liners in module-level code."

Code: Some `doGet` dispatch lines use braces (`{ return ... }`) and some do not:
- Line 34–35 (list_transactions, list_categories): with braces
- Lines 36–44 (list_accounts through get_suggested_transactions): without braces

File: `app-router.gs`, lines 34–44.

---

### Schemas

**[HIGH] BE-03 — `RATE_SCHEMA` is missing required schema fields**

Rule (APP-BE.md §"`<domain>-schema.gs` — field registry"): every field in a schema object must have at minimum: `sheet_column_name`, `sheet_column_position`, `ui_label`, `type`, `enum_values`, `group`, `applies_to`, `required_for`, `editable`, `default_value`.

Code: `RATE_SCHEMA` in `rate-schema.gs` defines only `sheet_column_position`, `label` (not `ui_label`), and in one case `type`. It is missing `sheet_column_name`, `ui_label` (uses `label` instead), `enum_values`, `group`, `applies_to`, `required_for`, `editable`, and `default_value` on every field. The `getRateSheetColumns()` function also derives column names from the object keys (`Object.keys`) rather than from a `sheet_column_name` property, which deviates from the pattern used by every other domain.

File: `rate-schema.gs`, lines 6–18.

---

**[HIGH] BE-04 — `RATE_SCHEMA` missing four required schema helper functions**

Rule (APP-BE.md §"Required helper functions — every schema file must have all of these"): every schema file must define `get<Domain>SchemaField(key)`, `getFieldsFor<Domain>Type(type)`, and `get<Domain>SchemaForClient()`. The rate domain also has no `getRateSchemaForClient()` action.

Code: `rate-schema.gs` defines only `getRateSheetColumns()` and `rateColIndex()`. Missing: `getRateSchemaField(key)`, `getFieldsForRateType(type)`, and `getRateSchemaForClient()`. The router has no `get_rate_schema` action in `doGet`.

File: `rate-schema.gs` (missing functions); `app-router.gs` (missing route).

---

**[MEDIUM] BE-05 — `CATEGORY_SCHEMA` is missing `applies_to` and `required_for` fields**

Rule (APP-BE.md §"Schema object structure"): every field must include `applies_to` and `required_for` keys.

Code: No field in `CATEGORY_SCHEMA` has `applies_to` or `required_for` keys. The schema object for category omits these entirely on all 13 fields.

File: `category-schema.gs`, lines 12–157.

---

**[MEDIUM] BE-06 — `CATEGORY_SCHEMA` missing `getFieldsForCategoryType(type)` helper**

Rule (APP-BE.md §"Required helper functions"): "Fields applicable to a specific variant" must be provided as `getFieldsFor<Domain>Type(type)`.

Code: `category-schema.gs` exposes `getCategorySheetColumns()`, `getCategorySchemaField()`, and `catColIndex()` but does not define `getFieldsForCategoryType()`. The validation file cannot drive schema-based field checking without it.

File: `category-schema.gs`.

---

**[MEDIUM] BE-07 — `SUBSCRIPTION_SCHEMA` missing `getFieldsForSubscriptionType(type)` helper**

Same rule as BE-06.

Code: `subscription-schema.gs` exposes `getSubscriptionSheetColumns()`, `getSubscriptionSchemaField()`, and `subColIndex()` but does not define `getFieldsForSubscriptionType()`.

File: `subscription-schema.gs`.

---

**[LOW] BE-08 — `TRANSACTION_COLUMNS` constant retained as "backward compat" in schema file**

Rule (APP-BE.md §"app-config.gs — constants"): column definitions that belong to a domain live in the domain's schema file. The comment on `TRANSACTION_COLUMNS` (lines 219–225 of `transaction-schema.gs`) explicitly notes it is "kept for backward compat with any code that still references it by name."

Code: `TRANSACTION_COLUMNS` is used throughout `transaction-core.gs` (lines 6, 30, 75, 80, 167, 172) instead of calling `getTransactionSheetColumns()`. This makes the backward-compat note self-perpetuating: the constant is never removed because it is still actively used.

File: `transaction-schema.gs` lines 219–225; `transaction-core.gs` lines 6, 30, 75, 80, 167, 172.

---

### Core — CRUD

**[HIGH] BE-09 — `transaction-core.gs` `createTransaction` builds the sheet row with magic positional array literals, not `setCol`**

Rule (APP-BE.md §"create — row building pattern"): "Build a blank row array — all cells default to empty string" then populate it via `setCol(key, value)` so that column positions are driven by the schema, not by array index order.

Code: `transaction-core.gs` lines 40–57 use `sheet.appendRow([id, body.tx_date_time, body.tx_type, ...])` — a positional 16-element array literal with no schema lookup. Adding a column to `TRANSACTION_SCHEMA` in a non-terminal position would silently write wrong values into the sheet without any error.

File: `transaction-core.gs`, lines 40–57.

---

**[HIGH] BE-10 — `transaction-core.gs` `updateTransaction` writes fields via a positional `setValues` range call, not `writeField`**

Rule (APP-BE.md §"update — writeField pattern"): update functions must use `writeField` which checks `field.editable` before writing. "Using `setCol` in update" is listed as a common pitfall — it overwrites immutable fields.

Code: `transaction-core.gs` lines 143–159 call `sheet.getRange(rowNum, 2, 1, 15).setValues([[...]])` — a 15-element positional array covering columns 2–16. This bypasses `field.editable` checks entirely. `tx_type` (column 3, `editable: false`) is overwritten on every update.

File: `transaction-core.gs`, lines 143–159.

---

**[HIGH] BE-11 — `listTransactions` does not call `getOrCreateSheet` with the canonical helper**

Rule (APP-BE.md §"list — seed on first use"): "Always call `getOrCreateSheet` at the start of any function that reads or writes a sheet." The canonical call pattern is `getOrCreateSheet(TRANSACTIONS_SHEET, getTransactionSheetColumns())`.

Code: `transaction-core.gs` line 6 calls `getOrCreateSheet(TRANSACTIONS_SHEET, TRANSACTION_COLUMNS)` — passing the pre-computed constant array instead of calling `getTransactionSheetColumns()`. This means new columns added to `TRANSACTION_SCHEMA` after the constant was evaluated will not be auto-migrated by `getOrCreateSheet`'s column-append logic on list calls.

File: `transaction-core.gs`, line 6.

---

**[HIGH] BE-12 — `advisor-core.gs` reads the advisor sheet with `getSheetByName` directly instead of `getOrCreateSheet`**

Rule (APP-BE.md §"app-utils.gs — shared helpers"): "Never call `SpreadsheetApp.getActiveSpreadsheet().getSheetByName(...)` directly — it returns `null` if the sheet doesn't exist and the next call throws."

Code:
- `getAdvisorHistory()` line 42: `SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ADVISOR_SHEET)` — result used without null-guard on the immediately following `sheetToObjects(sheet)` call (line 43). If the sheet does not exist, `sheetToObjects` will throw a GAS runtime error and the handler returns HTML, not JSON.
- `clearAdvisorHistory()` line 51: same pattern. The null check on line 52 means it silently returns `{ ok: true }` when the sheet doesn't exist, which may mask data loss.
- `_getRecentHistory()` line 61: `getSheetByName(ADVISOR_SHEET)` — null check present, returns `[]`. This one is safe but still violates the "always use `getOrCreateSheet`" rule.
- `_buildSnapshot()` line 106: `ss.getSheetByName(TRANSACTIONS_SHEET)` — result null-guarded on line 107, functionally safe.
- `_fetchRequestedData()` line 214: `ss.getSheetByName(TRANSACTIONS_SHEET)` — null-guarded on line 215.

The HIGH severity applies specifically to `getAdvisorHistory` where the null path throws.

File: `advisor-core.gs`, lines 42, 51, 61, 106, 214.

---

**[HIGH] BE-13 — `advisor-core.gs` `_callClaude` does not log the external API call at `console.log` level**

Rule (APP-BE.md §"External HTTP calls" and APP-LOGGING.md §"What to always log"): "External API call — `log` — `_callClaude: status=200 tokens=312`". The doc example explicitly shows logging status and token count on every call.

Code: `advisor-core.gs` `_callClaude` (lines 169–192) makes an `UrlFetchApp.fetch` call and handles errors, but logs nothing on the success path (code 200). There is no `console.log` anywhere in `_callClaude`.

File: `advisor-core.gs`, lines 169–192.

---

**[MEDIUM] BE-14 — `listAccounts` does not coerce boolean fields**

Rule (APP-BE.md §"Boolean coercion rule"): "Always coerce: `v === true || String(v).toLowerCase() === 'true'`. Do this in list functions." The example shows this applied to `is_active` in `listCategories`.

Code: `account-core.gs` `listAccounts()` (lines 5–9) returns `sheetToObjectsWithRow(sheet)` directly. The `is_active` field (a boolean in `ACCOUNT_SCHEMA`) is not coerced. Consumers receiving `"TRUE"` strings instead of `true` booleans will evaluate boolean checks incorrectly.

File: `account-core.gs`, lines 5–9.

---

**[MEDIUM] BE-15 — `listSubscriptions` uses non-standard boolean coercion**

Rule (APP-BE.md §"Boolean coercion rule"): standard pattern is `v === true || String(v).toLowerCase() === 'true'`.

Code: `subscription-core.gs` line 11 coerces `is_active` as `row.is_active === true || row.is_active === 'true' || row.is_active === 'TRUE'`. This adds `=== 'TRUE'` as a third case. While this covers an additional variant, it deviates from the canonical single-expression pattern without justification. The field is checked for downstream `next_payment_date` computation but `is_active` is never normalised to a proper boolean in the returned rows — callers receive whatever the sheet stored.

File: `subscription-core.gs`, lines 10–12.

---

**[MEDIUM] BE-16 — `updateSubscription` validates only `name` and optionally `amount`/`is_active` but not `frequency`, `currency`, `source_account`, or day fields**

Rule (APP-BE.md §"`<domain>-validation.gs`"): validation order requires enum values and required fields to be checked. For updates, the doc states: "same checks as create" plus immutable-field rejection.

Code: `validateSubscriptionUpdate` (in `subscription-validation.gs`) checks `row_num`, `name`, optionally `amount`, and optionally `is_active`. It does not validate `frequency` (enum), `currency` (presence), `source_account` (presence), or `day_of_month`/`day_of_week` (numeric range). An update can set `frequency` to an invalid string or clear `source_account` and the write will succeed.

File: `subscription-validation.gs`, lines 32–50.

---

**[MEDIUM] BE-17 — `validateCategoryUpdate` accepts mutations to `tx_type` which is editable in the schema but represents a structural discriminant**

Rule (APP-BE.md §"update — writeField pattern"): `writeField` checks `field.editable`. For category, `tx_type` has `editable: true`, meaning updates can change the type. However there is no cross-entity check to verify that changing `tx_type` would not break existing transactions that reference this category via (type, major, minor) triple. This is a validation gap rather than a schema error.

Code: `validateCategoryUpdate` (`category-validation.gs` lines 18–29) validates the new `tx_type` exists in `VALID_TRANSACTION_TYPES` but does not check whether any existing transaction row references this category under the old type.

File: `category-validation.gs`, lines 18–29; `category-core.gs` lines 68–98.

---

**[LOW] BE-18 — `category-core.gs` `deleteCategory` has no FK check**

Rule (APP-BE.md §"delete — FK check pattern"): "Before deleting, check whether any related entity references this row. Return a blocked response with `referenced_count` instead of deleting."

Code: `deleteCategory` (`category-core.gs` lines 101–110) performs the row-bounds check and then calls `sheet.deleteRow(rowNum)` immediately. It does not check whether any transaction references this (tx_type, major_category, minor_category) triple. Deleting an in-use category leaves orphaned categorisation data in transactions.

File: `category-core.gs`, lines 101–110.

---

**[LOW] BE-19 — `transaction-schema.gs` `getTransactionSchemaForClient` returns `transfer_fields` which will always be empty**

Rule (APP-BE.md §"Required helper functions"): client schema should accurately reflect the schema.

Code: `getTransactionSchemaForClient` (lines 230–248) filters for fields where `group === 'transfer'`. No field in `TRANSACTION_SCHEMA` has `group: 'transfer'` — the transfer-related fields (`fx_rate`, `target_account`) use `group: 'core'`. This causes `transfer_fields` to always be an empty array in the client payload.

File: `transaction-schema.gs`, lines 242–246.

---

**[LOW] BE-20 — `account-utils.gs` claim "No sheet I/O" in header comment is false**

Rule: internal documentation should be accurate to avoid developer confusion.

Code: `account-utils.gs` line 3 states "No sheet I/O. All functions are pure computations." However, `generateAccountId(sheet)` (line 6) calls `sheet.getDataRange().getValues()` — which is a sheet read. The `sheet` is passed as a parameter, but the comment is misleading.

File: `account-utils.gs`, lines 3–23.

---

## APP-AUTH — Authentication

**[HIGH] AUTH-01 — `app-auth.gs` implements `getOrCreateAuditSheet` directly instead of calling the shared `getOrCreateSheet` from `app-utils.gs`**

Rule (APP-BE.md §"app-utils.gs — shared helpers"): "Always call `getOrCreateSheet` — never `getSheetByName` directly." APP-AUTH.md §"Implementing auth in a new module" confirms auth code should rely on shared utils.

Code: `app-auth.gs` defines a private `getOrCreateAuditSheet()` function (lines 51–60) that calls `ss.getSheetByName(AUDIT_SHEET)` directly and, if missing, inserts a new sheet with `appendRow(AUDIT_COLUMNS)`. This duplicates the logic in the shared `getOrCreateSheet` helper, but critically it does not invoke `getOrCreateSheet`'s column-append migration path. If `AUDIT_COLUMNS` changes, existing audit sheets will not be auto-migrated.

File: `app-auth.gs`, lines 51–60.

---

**[HIGH] AUTH-02 — `verifyTotp` uses double-quotes for the `TOTP_ENABLED` property name**

Rule (APP-CONVENTIONS.md §"JavaScript style"): "Quotes: Single quotes `'...'` for strings."

Code: `app-auth.gs` line 36: `PropertiesService.getScriptProperties().getProperty("TOTP_ENABLED")` — uses double quotes. All other `getProperty` calls in the file and codebase use single quotes. While functionally identical in GAS V8, this is a consistent convention violation.

File: `app-auth.gs`, line 36.

---

**[MEDIUM] AUTH-03 — `recordAccess` does not log when an IP is locked**

Rule (APP-LOGGING.md §"What to always log"): "IP locked — `log` — `recordAccess: locked ip=1.2.3.4 failures=3`".

Code: `recordAccess` (`app-auth.gs` lines 72–111) computes `shouldLock` and sets `isLocked = true` when failures reach `MAX_FAILURES`, but there is no `console.log` call in this code path. The locking event is not recorded in Stackdriver.

File: `app-auth.gs`, lines 86–88.

---

**[MEDIUM] AUTH-04 — `recordAccess` does not log on successful access following prior failures**

Rule (APP-LOGGING.md §"What to always log"): "IP unlocked (first success after failures) — `log` — `recordAccess: success ip=1.2.3.4`".

Code: `recordAccess` does not contain any `console.log` call for the success path. There is no logging of auth events at all in `recordAccess`.

File: `app-auth.gs`, lines 72–111.

---

**[LOW] AUTH-05 — `checkLocked` reads `is_locked` by hardcoded array index 10 rather than by column name**

Rule (APP-BE.md §"Common pitfalls"): "Row `[7]` instead of schema index — breaks silently when columns are added. Use `<domain>ColIndex('field')`."

Code: `checkLocked` (`app-auth.gs` line 67): `values[i][10] === true` — hardcoded index 10 (0-based), which corresponds to the `is_locked` column. APP-AUTH.md §"Sheet: `audit_access`" documents this and acknowledges: "Column positions matter — `checkLocked` reads `is_locked` by index 10 (0-based)". However, the audit sheet does not use `getColIndex`/schema lookup, making it brittle.

File: `app-auth.gs`, line 67.

---

## APP-LOGGING — Logging Standards

**[HIGH] LOG-01 — `transaction-suggestions.gs` uses `Logger.log` instead of `console.log`**

Rule (APP-LOGGING.md §"Functions to use"): "Use `console.log(msg)`" — GAS routes all three console methods to Stackdriver. `Logger.log` is the legacy GAS logging API and is not mentioned anywhere in the standards.

Code: `transaction-suggestions.gs` uses `Logger.log` on lines 19, 25, 39, 109, 175, 274. All logging calls in this file are via the legacy `Logger` class, not via `console`.

File: `transaction-suggestions.gs`, lines 19, 25, 39, 109, 175, 274.

---

**[HIGH] LOG-02 — `adjustAccountBalance` log on miss uses `console.log` when `console.warn` is required**

Rule (APP-LOGGING.md §"What to always log"): "Missing referenced entity (non-fatal) — `warn` — `adjustAccountBalance: account_not_found id=ACC-...`". APP-BE.md's own example shows `console.warn` for the account-not-found path.

Code: `transaction-utils.gs` line 47: `console.log('adjustAccountBalance: account_not_found ...')` — uses `console.log` (INFO severity) rather than `console.warn` (WARNING severity).

File: `transaction-utils.gs`, line 47.

---

**[MEDIUM] LOG-03 — `_callClaude` error path logs at wrong level**

Rule (APP-LOGGING.md §"Error handling pattern"): the catch block should use `console.error`. The non-200 response path (API error, not exception) should use `console.warn`.

Code: `advisor-core.gs` `_callClaude` (lines 169–192): the `catch` block on line 190 does not log at all — it silently returns `{ ok: false, error: 'fetch_error: ...' }`. The non-200 branch (line 186) also does not log. Both paths are silent in Stackdriver.

File: `advisor-core.gs`, lines 183–191.

---

**[MEDIUM] LOG-04 — `transaction-suggestions.gs` log lines do not follow `<functionName>: key=value` format**

Rule (APP-LOGGING.md §"Log format"): "`<functionName>: <key>=<value> <key>=<value>`". Function name must prefix the log line.

Code: Multiple log lines in `transaction-suggestions.gs` use a local variable `fnName` as the prefix but not consistently:
- Line 19: `Logger.log(fnName + ': total_transactions=' + allTx.length)` — correct pattern
- Line 109 (`_applyRecurringMonthly`): `Logger.log(fnName + ': surfaced key=' + key + ' confidence=' + confidence)` — key and confidence are not in `key=value` form; `confidence` value is a float and not quoted despite potentially containing spaces

These are minor formatting deviations but the bigger issue is all logging uses the wrong function (LOG-01).

File: `transaction-suggestions.gs`, lines 19, 25, 39, 109, 175, 274.

---

**[LOW] LOG-05 — `validateFxRate` uses a template literal for the error code string**

Rule (APP-CONVENTIONS.md §"Error codes"): error codes are `snake_case`, returned as `error` field in `{ ok: false, error: '...' }`. They describe the condition, not a human-readable sentence.

Code: `transaction-validation.gs` line 148: `return { ok: false, error: \`FX rate required for ${fromCcy} → ${toCcy} transaction.\` }`. The error value is a full English sentence with a Unicode arrow, not a `snake_case` code. This breaks the contract that the frontend switch-cases on error codes.

File: `transaction-validation.gs`, line 148.

---

## APP-CONVENTIONS — Naming & Code Conventions

**[MEDIUM] CON-01 — `app-utils.gs` uses `var` at module level inside `splitToList` and `normaliseTags`**

Rule (APP-CONVENTIONS.md §"JavaScript style"): "Declarations: `const` by default; `let` when the variable is reassigned; never `var` at module level."

Code:
- `splitToList` (`app-utils.gs` line 86): uses `function(s)` callback with no `var`, but the function itself is declared with `function` keyword at module level — acceptable. However the `.map(function(s) { return s.trim(); })` style, while not using `var`, mixes function declaration styles. More concretely:
- `getColIndex` (`app-utils.gs` line 97): `var f = schema[name];` — uses `var` at function-body level which the convention says is "acceptable inside a nested function where you need function scope". This is borderline but the `getColIndex` function itself is at module scope and `var` has no function-scoped advantage here over `const`.

The clearest violation: `app-utils.gs` line 97 uses `var` inside a top-level function without needing function scope.

File: `app-utils.gs`, line 97.

---

**[MEDIUM] CON-02 — `category-utils.gs` `normaliseAccountTypes` is a public function (no `_` prefix) that should be private**

Rule (APP-CONVENTIONS.md §"Functions"): "Private (file-internal): `_camelCase` (leading underscore)." And APP-BE.md §"Global namespace": "Prefix private helpers with `_`."

Code: `category-utils.gs` defines `normaliseKeywords`, `normaliseCandidates`, and `normaliseAccountTypes` as public functions. They are only called from within `category-core.gs` and are domain-specific helpers with no reason to be globally accessible. They pollute the global GAS namespace and could collide with similarly-named helpers in future domains.

File: `category-utils.gs`, lines 5, 9, 13.

---

**[MEDIUM] CON-03 — `transaction-suggestions.gs` module-level variable uses `var`**

Rule (APP-CONVENTIONS.md §"JavaScript style"): "`const` by default … never `var` at module level."

Code: `transaction-suggestions.gs` line 8: `var _SUGGESTION_DAY_NAMES = [...]` — a module-level constant array declared with `var`. Per convention this should be `const _SUGGESTION_DAY_NAMES = [...]`.

File: `transaction-suggestions.gs`, line 8.

---

**[LOW] CON-04 — `category-core.gs` `onEdit` uses `var` for loop-scoped variables at function top level**

Rule (APP-CONVENTIONS.md §"JavaScript style"): "`const` by default; `let` when reassigned; `var` acceptable inside nested function for function scope." The `onEdit` function itself is nested (it's a module-level function), but the variables inside it do not require `var`'s function-scoping behaviour.

Code: `category-core.gs` lines 165–215 use `var` throughout the `onEdit` function body where `const`/`let` would be correct per the style guide.

File: `category-core.gs`, lines 165–215.

---

**[LOW] CON-05 — `account-core.gs` and most domain core files mix `var` and `const`/`let` within the same file**

Rule (APP-CONVENTIONS.md §"JavaScript style"): consistent declaration style.

Code:
- `account-core.gs`: functions `listAccounts`, `createAccount`, `createAccountsBulk`, `updateAccount`, `deleteAccount` use `var`. However the `_countTransactionsReferencingAccount` private helper and `getAccountById` also use `var`. Meanwhile `transaction-core.gs` uses `const`/`let` throughout.
- `category-core.gs`, `category-validation.gs`, `account-validation.gs`, `subscription-core.gs`, `subscription-validation.gs` all use `var` exclusively.
- `transaction-core.gs`, `transaction-validation.gs`, `transaction-utils.gs`, `rate-core.gs`, `workflow-engine.gs` use `const`/`let` exclusively.

The codebase has no uniform style. The convention says V8 modern ES is available and `const`/`let` should be used.

File: `account-core.gs`, `category-core.gs`, `category-validation.gs`, `account-validation.gs`, `subscription-core.gs`, `subscription-validation.gs`.

---

**[LOW] CON-06 — `_SUGGESTION_DAY_NAMES` uses `_` prefix for a module-level constant, violating constant naming rule**

Rule (APP-CONVENTIONS.md §"Constants and schema objects"): "`UPPER_SNAKE_CASE` for module-level constants." The `_` prefix convention is for private *functions*, not constants.

Code: `transaction-suggestions.gs` line 8: `var _SUGGESTION_DAY_NAMES = [...]`. Module-level constants should be `SUGGESTION_DAY_NAMES` (or if truly private, the `_` prefix is not the correct mechanism — GAS has no module privacy; all globals are accessible).

File: `transaction-suggestions.gs`, line 8.

---

**[LOW] CON-07 — `advisor-core.gs` function name `_callClaude` should be `_callOpenAi` or similar**

Rule (APP-CONVENTIONS.md §"Never abbreviate field names"): names should reflect what the value represents. More specifically, the function is calling OpenAI's API (as shown by the URL `https://api.openai.com/v1/chat/completions`), not a Claude endpoint. The system prompt inside also calls it OpenAI. The function name `_callClaude` is factually incorrect.

File: `advisor-core.gs`, line 169.

---

**[MEDIUM] CON-08 — `subscription-validation.gs` day-of-week range is wrong (validates 1–7 but stores/uses 0-based JS days)**

Rule (APP-BE.md §"`<domain>-validation.gs`"): "Numeric ranges — valid day-of-month, etc."

Code: `validateSubscriptionCreate` (`subscription-validation.gs` lines 18–22) checks `dow < 1 || dow > 7` (i.e., accepts 1–7 where 1=Mon, 7=Sun). However, `computeNextPaymentDate` in `subscription-utils.gs` (lines 37–64) calls `_nextWeeklyDate` which calls `d.getDay()` (JS 0=Sun, 1=Mon … 6=Sat) and maps 7→0 for Sunday. The validation rejects `0` (lines 20–21: `!body.day_of_week && body.day_of_week !== 0`) but the stored 1–7 values are passed directly to `_nextWeeklyDate` where `dayOfWeek === 7` maps to Sunday. This means `dayOfWeek = 1` (valid per validation) maps to Monday in `_nextWeeklyDate`, which matches. But the validation rejection of `0` is a dead code path because the frontend presumably uses 1–7. The mismatch between the validation's 1–7 domain and `_nextWeeklyDate`'s mapping needs explicit documentation or a single normalisation point.

File: `subscription-validation.gs`, lines 18–22; `subscription-utils.gs`, lines 68–76.

---

**[MEDIUM] CON-09 — `account-validation.gs` `validateAccountUpdate` does not validate `name` content beyond presence**

Rule (APP-BE.md §"`<domain>-validation.gs`"): validation order requires "Required fields — check presence before anything else" and cross-field rules as appropriate.

Code: `validateAccountUpdate` (`account-validation.gs` lines 31–45) checks `!body.row_num` and `!String(body.name || '').trim()` (presence). It does not check uniqueness of the new name against existing accounts, even though `createAccount` enforces name uniqueness. An account can be renamed to collide with another existing account's name.

File: `account-validation.gs`, lines 31–45; compare with `account-core.gs` lines 31–38.

---
