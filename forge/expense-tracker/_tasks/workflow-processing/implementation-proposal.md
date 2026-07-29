# Workflow Processing — Implementation Proposal

## Current State

Balance logic in `transaction-core.gs` is hardcoded as three `if`-chains across `createTransaction`,
`updateTransaction` (Phase 1 + Phase 2), and `deleteTransaction` — four copies of the same pattern:

```javascript
if (type === 'money-in')       adjustAccountBalance(target, +amount);
if (type === 'money-out')      adjustAccountBalance(source, -amount);
if (type === 'money-out' && target_account) adjustAccountBalance(target, +amount);  // loan/CC repayment
if (type === 'money-transfer') { adjustAccountBalance(source, -amount); adjustAccountBalance(target, +toAmount); }
```

`transaction_type` does two jobs: UI label and balance driver. They need to be separated.

---

## Architecture Decisions

### 1. `workflow_type` stored as a string enum on the category

Stored in the categories sheet as a string (e.g. `"transfer-fx"`). The step sequence it maps to
lives in the workflow engine in code — not in the sheet. This keeps the sheet simple and validated,
and lets us change step implementations without migrating data.

**Resolved open question:** string enum, not step array.

### 2. The engine lives entirely in the backend (GAS)

The frontend continues to use `transaction_type` for UI behaviour (show/hide fields, dropdowns).
The engine is invisible to the frontend. No frontend changes in this feature.

**Resolved open question:** backend only.

### 3. `workflow_type` is NOT stored on the transaction

The engine looks it up from the category at runtime. Storing it on the transaction would require
a schema migration and create a denormalisation problem (editing a category wouldn't affect
old transactions). The category sheet read is already happening inside `_findCategoryHints` —
we extend that function.

### 4. `workflow_type` is mandatory on every category

Every category must have a `workflow_type` set. There is no fallback. A transaction without a
resolvable `workflow_type` is blocked with `missing_workflow_type` before any balance mutation
occurs. This is enforced at two points:

- **Category create/update** — `validateCategoryCreate` and `validateCategoryUpdate` reject a
  category with a missing or unrecognised `workflow_type`.
- **Transaction create/update** — `resolveWorkflow` returns `{ ok: false, error: 'missing_workflow_type' }`
  if the category lookup yields no `workflow_type`. The caller treats this as a hard block,
  identical to a validation failure.

The migration function (`migrateWorkflowType`) must be run and verified before the engine is
wired into `transaction-core.gs`. Deploying the engine before all categories are populated will
block all transaction saves.

### 5. Step inverses are defined in the engine, not the sheet

Each step has a defined inverse (used by update Phase 1 and delete). The caller passes the same
context — the engine knows how to reverse it.

---

## Step Catalogue

| Step | Forward | Inverse | Notes |
|---|---|---|---|
| `deduct-source` | `adjustAccountBalance(source, -amount)` | `adjustAccountBalance(source, +amount)` | |
| `add-target` | `adjustAccountBalance(target, +toAmount)` | `adjustAccountBalance(target, -toAmount)` | `toAmount = fx_rate > 0 ? amount * fx_rate : amount` |
| `reduce-liability` | `adjustAccountBalance(target, +amount)` | `adjustAccountBalance(target, -amount)` | Target is a liability; adding positive reduces the magnitude of negative balance |

> `apply-fx` is not a balance step — it is a validation guard. It is enforced in `validateFxRate`
> (already exists) and annotated by `applyFxNote` (already exists). No new step needed.

---

## Workflow Type Definitions

Names are 2 words, hyphen-separated, 13–14 characters — consistent across all types.

| workflow_type | Steps | Categories |
|---|---|---|
| `account-credit` | `add-target` | All `money-in` categories |
| `account-debit` | `deduct-source` | Standard `money-out` categories |
| `debt-repayment` | `deduct-source` → `reduce-liability` | `Debt & finance / Loan repayment`, `Credit card payment`, `Overdraft repayment` |
| `funds-transfer` | `deduct-source` → `add-target` | `money-transfer` categories (same currency) |
| `forex-transfer` | `deduct-source` → `add-target` | `Cross-border`, `Currency exchange / FX conversion` (cross-currency; fx_rate scales toAmount) |

> `funds-transfer` and `forex-transfer` have identical steps — the only difference is `forex-transfer`
> requires `fx_rate > 0`, which is already enforced by `validateFxRate`. They are named separately
> so a future step (e.g. `log-fx-audit`) can be attached to `forex-transfer` without touching
> `funds-transfer`.

---

## Files Changed

### New file — `api/workflow-engine.gs`

Owns the engine entirely. No sheet I/O.

```
WORKFLOW_STEPS      — step name → { forward(ctx), inverse(ctx) }
WORKFLOW_DEFS       — workflow_type → ordered step name array
executeWorkflow(workflowType, ctx)        — run forward steps; returns { ok, error } on unknown type
reverseWorkflow(workflowType, ctx)        — run inverse steps; returns { ok, error } on unknown type
resolveWorkflow(major, minor, txType)     — look up workflow_type from category sheet;
                                            returns { ok: false, error: 'missing_workflow_type' }
                                            if not found or empty — never falls back to txType
```

`ctx` shape:
```javascript
{ source_account, target_account, amount, fx_rate }
```

### Modified — `api/category-schema.gs`

Add `workflow_type` as column 13. `sort_order` stays at 12.

```javascript
workflow_type: {
  sheet_column_name: 'workflow_type',
  sheet_column_position: 13,
  ui_label: 'Workflow Type',
  type: 'enum',
  enum_values: ['account-credit', 'account-debit', 'funds-transfer', 'forex-transfer', 'debt-repayment'],
  group: 'core',
  applies_to: null,
  required_for: null,   // required for all category types
  editable: true,
  default_value: null,
}
```

### Modified — `api/category-seed.gs`

Add `workflow_type` as the 13th element on every seed row. Examples:

```javascript
['money-in',       'Salary',           'Monthly pay',          ..., false, true,  0, 'account-credit'],
['money-out',      'Food',             'Eating out',           ..., true,  false, 0, 'account-debit'],
['money-out',      'Debt & finance',   'Loan repayment',       ..., true,  true,  0, 'debt-repayment'],
['money-out',      'Debt & finance',   'Credit card payment',  ..., true,  true,  0, 'debt-repayment'],
['money-transfer', 'Between own accounts', 'Account to account',..., true, true, 0, 'funds-transfer'],
['money-transfer', 'Cross-border',     'UK to India',          ..., true,  true,  0, 'forex-transfer'],
```

### Modified — `api/transaction-core.gs`

Replace the four hardcoded if-chains with two calls per operation:

```javascript
// createTransaction — replace the if-chain at the bottom with:
const wf = resolveWorkflow(body.transaction_type, body.major_category, body.minor_category);
executeWorkflow(wf, { source_account: body.source_account, target_account: body.target_account,
                      amount: amount, fx_rate: fxRate });

// updateTransaction — replace Phase 1 + Phase 2 with:
const oldWf = resolveWorkflow(oldType, oldMajor, oldMinor);
reverseWorkflow(oldWf, { source_account: oldSourceAccountId, target_account: oldTargetAccountId,
                         amount: oldAmount, fx_rate: oldFxRate });

const newWf = resolveWorkflow(newType, body.major_category, body.minor_category);
executeWorkflow(newWf, { source_account: body.source_account, target_account: body.target_account,
                         amount: newAmount, fx_rate: newFxRate });

// deleteTransaction — replace the if-chain with:
const wf = resolveWorkflow(txType, txMajor, txMinor);
reverseWorkflow(wf, { source_account: sourceAccountId, target_account: targetAccountId,
                      amount: txAmount, fx_rate: fxRate });
```

`transaction-core.gs` shrinks significantly — the balance logic moves entirely to `workflow-engine.gs`.

### Modified — `api/transaction-validation.gs`

`_findCategoryHints` extended to also read and return `workflow_type` from the category row.
The returned object gains one field: `workflow_type: String(values[i][ci.workflowType] || '')`.

### Modified — `api/category-core.gs`

`createCategory` and `updateCategory` — add `setCol('workflow_type', ...)` / `writeField('workflow_type', ...)`.
Add migration function `migrateWorkflowType()` — see Migration section below.

---

## Implementation Order

Steps are ordered by dependency. Each step is independently deployable.

**Step 1 — Add `workflow_type` to category schema**
- `category-schema.gs`: add the field at column 13
- No sheet impact yet (column doesn't exist in live sheet until migration runs)

**Step 2 — Seed data**
- `category-seed.gs`: add 13th element to every row
- Affects only fresh installs (re-seed from scratch). Migration covers existing installs.

**Step 3 — Workflow engine**
- Create `workflow-engine.gs` with `WORKFLOW_STEPS`, `WORKFLOW_DEFS`, `executeWorkflow`,
  `reverseWorkflow`, `resolveWorkflow`
- Write and test in isolation — no dependencies on other changes

**Step 4 — Category CRUD + migration**
- `category-core.gs`: add `workflow_type` to create/update, add `migrateWorkflowType()`
- `transaction-validation.gs`: extend `_findCategoryHints` to return `workflow_type`
- Deploy and run `migrateWorkflowType()` — verify every category row has a non-empty `workflow_type`
  before proceeding. Do not proceed to Step 5 until this is confirmed.

**Step 5 — Wire engine into transaction-core**
- `transaction-core.gs`: replace if-chains with engine calls
- Safe to deploy only after Step 4 migration is confirmed complete — `resolveWorkflow` will block
  any transaction whose category is missing a `workflow_type`

**Step 6 — Enforce mandatory in validation**
- `validateCategoryCreate` and `validateCategoryUpdate`: reject missing or unrecognised `workflow_type`
- At this point the full contract is enforced end-to-end

---

## Migration Strategy

`migrateWorkflowType()` runs once against the existing categories sheet:

```
For each row:
  1. Read transaction_type, major_category, minor_category, target_account_mandatory
  2. Derive workflow_type:
     - money-in                                        → 'account-credit'
     - money-out, target_account_mandatory = false     → 'account-debit'
     - money-out, target_account_mandatory = true      → 'debt-repayment'
     - money-transfer, major = 'Cross-border'
       OR major = 'Currency exchange'                  → 'forex-transfer'
     - money-transfer (all others)                     → 'funds-transfer'
  3. Write to workflow_type column
  4. Skip rows where workflow_type is already set (idempotent)
```

The function is idempotent — safe to run multiple times.

---

## Risks & Notes

| Risk | Mitigation |
|---|---|
| `resolveWorkflow` does a sheet read on every transaction save | Acceptable for GAS personal-use scale. If it becomes slow, cache `listCategories()` result within a single request. |
| Existing sheet has no `workflow_type` column | `migrateWorkflowType()` adds header + populates. Must be run and verified before Step 5. |
| Step 5 deployed before migration completes | All transaction saves will be blocked. Verify every category row has a non-empty `workflow_type` before deploying Step 5. |
| `deleteTransaction` reads `major_category` and `minor_category` from the stored row — but those columns are currently NOT read in the delete path | Add reads for `major_category` (col 8) and `minor_category` (col 9) in `deleteTransaction` before the `reverseWorkflow` call. |
| `debt-repayment` vs `funds-transfer` for loan repayments — currently the seed has `Debt & finance / Loan repayment` as `money-out`, but transactions in `tx-formatted-updated.md` use `money-transfer` | With the workflow engine, `tx-type` is a label — both can map to `debt-repayment`. Recommend changing the seed category `transaction_type` to `money-transfer` for consistency. |
