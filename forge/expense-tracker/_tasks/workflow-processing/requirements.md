# Workflow Processing — Requirements

## Problem

The current app hardcodes balance logic inside `transaction-core.gs` based on `transaction_type` (`money-in`, `money-out`, `money-transfer`). This works but has two limitations:

1. **Semantically blunt** — `money-transfer` covers both "move money between your own accounts" and "pay off a loan", which are financially different operations.
2. **Not extensible** — adding a new behaviour (e.g. send a reminder, apply an FX rate, close an account on full settlement) requires touching core transaction logic.

---

## Proposed Solution

Move balance logic out of `transaction_type` and into the **category**. Each category carries a `workflow_type` that defines what the app does when a transaction of that category is created, updated, or deleted.

---

## Design Decisions

### 1. `workflow_type` lives on the category

Each category in `category-seed.gs` gets a `workflow_type` field. The workflow fires automatically when a transaction is saved under that category.

### 2. `transaction_type` is retained as a display label only

`money-in`, `money-out`, `money-transfer` stay in the schema for UI filtering and display. They no longer drive balance logic — `workflow_type` does.

### 3. `source_account_mandatory` and `target_account_mandatory` are unchanged

These boolean flags already exist on categories and continue to handle validation (which accounts are required). `workflow_type` only handles what to do with those accounts once validated.

### 4. Category maps to exactly one workflow

A well-designed category implies a single workflow. Two transactions in the same category always execute the same steps. The `workflow_type` adapts based on whether `target_account` is populated (already governed by `target_account_mandatory`).

---

## Workflow Steps

Each `workflow_type` is a sequence of atomic steps executed in order.

### Step catalogue

| Step | What it does |
|---|---|
| `deduct-source` | Subtract `amount` from `source_account.current_balance` |
| `add-target` | Add `amount` to `target_account.current_balance` (same currency) |
| `reduce-liability` | Subtract `amount` from `target_account.current_balance` (liability accounts — loan, credit card) |
| `apply-fx` | Convert `amount` using `fx_rate` before crediting `target_account` |
| `send-notification` | Trigger a notification (channel TBD — email, push, etc.) |

### Built-in workflow types

| workflow_type | Steps | Example categories |
|---|---|---|
| `in` | `add-target` | Salary, Freelance income, Refunds |
| `out` | `deduct-source` | Food, Utilities, Shopping |
| `transfer` | `deduct-source` → `add-target` | Between own accounts, ATM withdrawal |
| `transfer-fx` | `deduct-source` → `apply-fx` → `add-target` | Cross-border / UK to India |
| `repay-liability` | `deduct-source` → `reduce-liability` | Loan repayment, Credit card payment |
| `out-notify` | `deduct-source` → `send-notification` | TBD |

---

## Open Questions

- [ ] Is `workflow_type` stored as a string enum (e.g. `"transfer-fx"`) or as a structured step array (e.g. `["deduct-source", "apply-fx", "add-target"]`)? String enum is simpler to seed and validate; step array is more flexible.
- [ ] Does the workflow engine live exclusively in the backend (GAS), or does the frontend also need to know the workflow to drive UI behaviour (e.g. show/hide FX rate field)?
- [ ] How does the two-phase reversal on edit/delete work with named steps? Each step needs a defined inverse (`deduct-source` ↔ `credit-source`, etc.).
- [ ] What triggers `send-notification` and what does it send? Needs a notification subsystem that does not exist yet.

---

## Scope

### In scope
- Add `workflow_type` to category schema and seed data
- Implement a workflow engine in GAS that executes steps on create/update/delete
- Update `transaction-core.gs` to delegate balance logic to the workflow engine
- Update `category-seed.gs` with `workflow_type` for all existing categories

### Out of scope
- Notification subsystem (step defined, implementation deferred)
- Frontend workflow awareness (deferred — frontend continues to use `transaction_type` for UI)
- Per-transaction running balance (separate concern, not part of this feature)
