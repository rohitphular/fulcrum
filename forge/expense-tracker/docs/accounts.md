# Accounts

The set of pools of money tracked in the app. Every transaction references one or two accounts; account balances are kept in sync by the transaction lifecycle.

Schema reference: [data-model.md § Account](data-model.md#account).

## Capabilities

- Create, edit, archive, delete accounts (13 types across Asset and Liability groups)
- Per-type fields: loan terms, credit card limit / billing dates, overdraft limit, investment platform, interest rate, etc.
- Net Worth summary: Total Assets, Total Liabilities, Net Worth, Liquid Cash (current + savings + cash)
- Utilisation bar for credit cards and overdrafts; repayment progress bar for loans
- Currency dropdown sourced from the rates table — no free-text currency entry

## Rules

### Required fields

| Field | Applies to | Rule |
|---|---|---|
| `name` | All | Non-empty |
| `type` | All | Must be one of the sanctioned 13 types |
| `currency` | All | Must exist in `rates` |
| `loan_original_amount` | All loan types | Must be > 0 |
| `sub_type` | `mortgage` | Required, one of the 6 sanctioned mortgage sub-types |

### Optional with constraints

| Field | Constraint |
|---|---|
| `credit_card_billing_date`, `credit_card_due_date` | Range 1–31 |
| `credit_card_limit`, `overdraft_limit` | ≥ 0 |
| `loan_end_date` | Must be after `loan_start_date` (when both provided) |
| `loan_collateral` | Only honoured for `mortgage` and `auto_loan`; ignored for other loan types |

### Liability balance convention

The user enters the outstanding owed amount as a **positive** number in the opening balance field. The store negates it before persistence. The UI always displays `abs(current_balance)` for liabilities, labelled "owed".

### Immutable after creation

`id`, `type`, `currency`, `opening_balance`, `current_balance`, `loan_original_amount`, `loan_start_date`, `loan_first_repayment_date`, `created_at`. Attempting to update any of these returns a `field_not_editable:<name>` error.

`sub_type` IS editable post-creation — it is purely a classification label (investment → `stocks_shares`/`pension_sipp`/…, mortgage → `residential`/`buy_to_let`/…) with no side effects on balance arithmetic or validation. Use cases: correcting an initial mis-classification.

### current_balance is system-managed

There is no API to write `current_balance` directly. It changes only via the transaction lifecycle (see [balance-lifecycle.md](balance-lifecycle.md)). To correct a discrepancy between the recorded balance and reality, record an `Adjustments / Balance correction` transaction (`money-in` to credit, `money-out` to debit).

### Deletion semantics

- **Deletion is FK-guarded.** Before removing the row, the store counts transactions where `source_account == account.id` OR `target_account == account.id`. If that count is `> 0`, the delete is refused with `{ ok: false, error: 'account_in_use', referenced_count: N, hint: 'archive_instead' }`.
- The user's recovery path is either to delete/reassign every referencing transaction, or to **archive** the account (set `is_active = false`) — see [Archive (soft delete)](#archive-soft-delete) below. The UI offers a one-click "Archive instead" button when the FK check refuses a deletion.
- Once a deletion is permitted (no transactions reference the account), the row is removed unconditionally and the account disappears from all dropdowns.

The previous design (unconditional delete + orphaned transaction references) led to silent balance drift when later edits hit the now-missing account. The FK guard plus the fail-closed behaviour of `adjust_balance` together close that loop.

### Archive (soft delete)

Setting `is_active = false` removes the account from transaction form dropdowns but keeps it visible in the accounts list and its balance counted in the Net Worth summary. Use archive when you stop using an account but want to preserve its history without breaking past transactions' lookups.

## Net Worth summary

Four cards above the table, always in base currency:

| Card | Calculation |
|---|---|
| **Total Assets** | Sum of `toBase(current_balance, currency)` over all asset accounts. For `investment`, use `investment_current_value` if > 0 else `current_balance`. |
| **Total Liabilities** | Sum of `abs(toBase(current_balance, currency))` over all liability accounts |
| **Net Worth** | `Total Assets − Total Liabilities`. Negative renders in ember/red. |
| **Liquid Cash** | Sum of `toBase(current_balance)` over accounts where `type ∈ {current, savings, cash}` |

## Progress bars

### Credit card utilisation

For `credit_card` accounts with `credit_card_limit > 0`:

```
utilisation_pct = abs(current_balance) / credit_card_limit × 100
```

Coloured by band:

| Band | Colour |
|---|---|
| 0–30% | Teal |
| 30–60% | Amber (light) |
| 60–90% | Amber (dark) |
| > 90% | Ember |

### Overdraft utilisation

Same formula, same colour bands, using `overdraft_limit`. Shown only when `overdraft_limit > 0`.

### Loan repayment

For all 7 loan types:

```
repayment_pct = (loan_original_amount − abs(current_balance)) / loan_original_amount × 100
              clamped to [0, 100], rounded to 1 dp
```

Bar fills left → right.

## Derived fields (computed at read time, not stored)

| Field | Applies to | Formula |
|---|---|---|
| `utilisation_pct` | `credit_card`, `overdraft` | See above |
| `repayment_pct` | All loan types | See above |
| `next_payment_date` | All loan types | Advance `loan_first_repayment_date` one month at a time until result > today; return the first such date |

## API surface

| Operation | Behaviour |
|---|---|
| `list_accounts` | Return all rows; compute derived fields; no defaults seeded |
| `create_account` | Validate required + range checks; negate balance for liabilities; assign `id` and `created_at`; append |
| `update_account` | Validate editable fields only; reject `field_not_editable:<name>` for any locked field |
| `delete_account` | Unconditional delete by row identity |
| `get_account_schema` | Return the type taxonomy (13 types with labels and groups), liability types, loan types, investment sub-types, mortgage sub-types — frontend uses this to drive forms without hard-coding |

## Form behaviour

- Currency dropdown is populated from the rates table — adding a new currency requires adding it to `rates` first.
- Type-specific fields appear/disappear as `type` changes. Switching type clears any sub-type field values that no longer apply.
- For liability types, a hint is shown explaining the positive-input convention.
- Edit mode disables all immutable fields (greyed, not submitted).
