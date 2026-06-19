# Accounts

## Overview

Manages the set of financial accounts tracked in the app. Every transaction must be linked to at least one account, and account balances are kept in sync automatically as transactions are created, edited, or deleted.

Accounts are split into two groups — **Assets** (accounts that hold value) and **Liabilities** (accounts that represent money owed). This distinction drives the Net Worth summary and controls how balances are displayed in the UI.

---

## Account Type Taxonomy

| Value | Label | Group | Sub-types |
|---|---|---|---|
| `current` | Current Account | Asset | — |
| `savings` | Savings Account | Asset | — |
| `cash` | Cash | Asset | — |
| `investment` | Investment | Asset | `stocks_shares`, `isa`, `pension_sipp`, `crypto`, `fixed_deposit`, `bonds`, `property`, `commodities`, `p2p_lending`, `other` |
| `mortgage` | Mortgage | Liability | `residential`, `buy_to_let`, `holiday_let`, `commercial`, `bridging`, `shared_ownership` |
| `auto_loan` | Auto Loan | Liability | — |
| `heloc` | HELOC | Liability | — |
| `personal_loan` | Personal Loan | Liability | — |
| `student_loan` | Student Loan | Liability | — |
| `medical_loan` | Medical Loan | Liability | — |
| `debt_consolidation` | Debt Consolidation | Liability | — |
| `credit_card` | Credit Card | Liability | — |
| `overdraft` | Overdraft | Liability | — |

Debt is modelled implicitly through liability account types. No separate debt tracker is needed — a credit card, loan, or overdraft account captures the balance owed, and repayments flow through normal `money-transfer` transactions.

---

## Data Model

Sheet: `accounts`

### Core fields (all account types, cols 1–12)

| Col | Field | Type | Description |
|---|---|---|---|
| 1 | `id` | string | Auto-generated: `ACC-YYYYMMDD-NNN` (sequential per calendar day) |
| 2 | `name` | string | Display name (e.g. `Barclays Current`) |
| 3 | `type` | string | One of the 13 sanctioned type values |
| 4 | `sub_type` | string | Sub-type within the type (investment and mortgage only); blank for all others |
| 5 | `currency` | string | ISO 4217 code (e.g. `GBP`, `INR`) |
| 6 | `opening_balance` | number | Balance at account creation; informational only |
| 7 | `current_balance` | number | Live balance updated on every transaction create, edit, or delete |
| 8 | `is_active` | boolean | `TRUE` for active; `FALSE` for archived |
| 9 | `institution` | string | Optional — bank or lender name |
| 10 | `account_number_last4` | string | Optional — last 4 digits of account number |
| 11 | `notes` | string | Optional free-text notes |
| 12 | `created_at` | UTC ISO datetime | Timestamp when the row was created |

### Savings / Current fields (cols 13–15)

| Col | Field | Type | Description |
|---|---|---|---|
| 13 | `savings_interest_rate` | number | Annual interest rate (%) |
| 14 | `savings_interest_frequency` | string | Compounding frequency: `monthly`, `quarterly`, or `annual` |
| 15 | `savings_maturity_date` | date | Maturity date — investment accounts only |

### Investment fields (cols 16–17)

| Col | Field | Type | Description |
|---|---|---|---|
| 16 | `investment_platform` | string | Platform or broker name (e.g. `Vanguard`) |
| 17 | `investment_risk_level` | string | Risk profile: `low`, `medium`, or `high` |

### Loan fields — all 7 loan types (cols 18–26)

Applies to: `mortgage`, `auto_loan`, `heloc`, `personal_loan`, `student_loan`, `medical_loan`, `debt_consolidation`

| Col | Field | Type | Description |
|---|---|---|---|
| 18 | `loan_original_amount` | number | Original principal at origination — **required** for all loan types |
| 19 | `loan_interest_rate` | number | Annual interest rate (%) |
| 20 | `loan_interest_type` | string | `fixed`, `variable`, or `tracker` |
| 21 | `loan_tenure_months` | number | Total loan term in months |
| 22 | `loan_start_date` | date | Date the loan was taken out |
| 23 | `loan_end_date` | date | Scheduled final repayment date |
| 24 | `loan_first_repayment_date` | date | Date of the first repayment — used to compute `next_payment_date` |
| 25 | `loan_monthly_repayment` | number | Regular monthly repayment amount |
| 26 | `loan_collateral` | string | Collateral description — `mortgage` and `auto_loan` only |

### Credit card fields (cols 27–34)

| Col | Field | Type | Description |
|---|---|---|---|
| 27 | `credit_card_limit` | number | Credit limit |
| 28 | `credit_card_apr` | number | Annual percentage rate (%) |
| 29 | `credit_card_interest_free_days` | number | Days interest-free on purchases |
| 30 | `credit_card_billing_date` | number | Day of month the statement is generated (1–31) |
| 31 | `credit_card_due_date` | number | Day of month payment is due (1–31) |
| 32 | `credit_card_minimum_payment_pct` | number | Minimum payment as % of balance |
| 33 | `credit_card_minimum_payment_fixed` | number | Minimum payment as a fixed amount |
| 34 | `credit_card_annual_fee` | number | Annual card fee |

### Overdraft fields (cols 35–37)

| Col | Field | Type | Description |
|---|---|---|---|
| 35 | `overdraft_limit` | number | Maximum overdraft facility |
| 36 | `overdraft_arranged` | boolean | `TRUE` if arranged overdraft; `FALSE` if unarranged |
| 37 | `overdraft_apr` | number | Overdraft annual percentage rate (%) |

---

## Computed Fields

These fields are not stored in the sheet — they are derived by `list_accounts` at query time.

| Field | Applies to | Formula |
|---|---|---|
| `utilisation_pct` | `credit_card`, `overdraft` | `abs(current_balance) / limit × 100`, rounded to 1 decimal. `limit` is `credit_card_limit` or `overdraft_limit`. `null` when limit is zero or blank. |
| `repayment_pct` | All 7 loan types | `(loan_original_amount − abs(current_balance)) / loan_original_amount × 100`, rounded to 1 decimal. Represents the share of the loan that has been repaid. |
| `next_payment_date` | All 7 loan types | Derived from `loan_first_repayment_date` by advancing N months so the result is the next future payment date. Not stored; recalculated on every `list_accounts` call. |

---

## Features

- Net Worth summary: Total Assets, Total Liabilities, and Net Worth in the quote currency
- Account table grouped into Assets and Liabilities sections, each with a group subtotal
- Add new accounts for any of the 13 supported types and any configured currency
- Sub-type selection for `investment` (10 options) and `mortgage` (6 options)
- Edit any account inline — editable fields are type-dependent (see `account-validations.md`)
- Archive an account (`is_active = FALSE`) without deleting it
- Delete an account with an inline confirmation step
- Credit card utilisation bar — balance used against credit limit, colour-coded
- Overdraft utilisation bar — drawn amount against overdraft limit, colour-coded
- Loan repayment progress bar — share of principal repaid, with `repayment_pct`
- Next payment date displayed for all loan accounts
- Credit card billing and due date information displayed per account
- Liability balance displayed as `X owed` in a distinct colour
- Balance sign hint shown in add and edit forms when a liability type is selected

---

## User Interactions

| Action | How |
|---|---|
| Add an account | Click **+ Add account** → fill name, type, currency, and type-specific fields → **Save** |
| Edit an account | Click **Edit** on a row → inline form with editable fields only → **Save** |
| Archive an account | Click **Edit** → set `is_active` to `FALSE` → **Save** |
| Delete an account | Click **Delete** → inline confirmation → **Yes, delete** |
| Cancel any action | Click **Cancel** |

---

## Business Rules / Validations

- **Name is required.** Saving without a name is blocked with an inline error.
- **Type is required.** Must be one of the 13 sanctioned values; enforced on both frontend and backend.
- **Currency is required.** Only currencies present in the `rates` sheet are accepted.
- **`loan_original_amount` is required for all loan types.** Must be greater than 0. Applies to: `mortgage`, `auto_loan`, `heloc`, `personal_loan`, `student_loan`, `medical_loan`, `debt_consolidation`.
- **Sub-type is required for mortgage.** Must be one of the 6 `MORTGAGE_SUB_TYPES` values.
- **`loan_end_date` must be after `loan_start_date`** when both are provided.
- **`credit_card_billing_date` and `credit_card_due_date`** must be in the range 1–31 if provided.
- **`credit_card_limit` and `overdraft_limit`** must be ≥ 0 if provided.
- **`loan_collateral` applies only to `mortgage` and `auto_loan`.** Ignored for all other loan types.
- **Liability balance convention.** User enters the outstanding amount as a positive number; the backend negates it before storing (e.g. entering £15,000 stores `−15000`). The UI displays the absolute value with an "owed" label.
- **Immutable fields after creation.** `id`, `type`, `sub_type`, `currency`, `opening_balance`, `current_balance`, `loan_original_amount`, `loan_start_date`, `loan_first_repayment_date`, and `created_at` cannot be changed via the Edit form. The backend rejects any attempt to update a non-editable field with a `field_not_editable:X` error.
- **`current_balance` is not directly editable.** It is updated exclusively by `adjustAccountBalance` inside transaction handlers. To correct a discrepancy, record an `Adjustments / Balance correction` transaction.
- **Deleting an account does not cascade to transactions.** Existing transactions retain their stored account references; the account disappears from the account list and form dropdowns.
- **Archived accounts remain in the sheet.** They appear in the accounts table but are excluded from transaction form dropdowns.

---

## Net Worth Summary

Three read-only summary cards appear above the account table, always in the quote currency:

| Card | Calculation |
|---|---|
| **Total Assets** | Sum of `toBase(current_balance, currency)` for all asset accounts (`current`, `savings`, `cash`, `investment`) |
| **Total Liabilities** | Sum of `abs(toBase(current_balance, currency))` for all liability accounts |
| **Net Worth** | Total Assets − Total Liabilities |

All figures use current exchange rates from `state.rateMap`. Negative net worth is displayed in ember/red.

---

## Progress Bars

### Credit Card Utilisation

For `credit_card` accounts with a non-zero `credit_card_limit`, the balance cell shows:

- Balance as `X owed`
- A line showing `X of Y (Z%)` in monospace
- A thin coloured progress bar

| Utilisation | Colour |
|---|---|
| 0–30% | Teal |
| 30–60% | Amber (light) |
| 60–90% | Amber (dark) |
| >90% | Ember / red |

### Overdraft Utilisation

For `overdraft` accounts with a non-zero `overdraft_limit`, the same bar pattern is shown using `abs(current_balance) / overdraft_limit × 100`. The same colour thresholds apply.

### Loan Repayment Progress

For all 7 loan types, a progress bar shows `repayment_pct` — the share of the original principal that has been repaid. Bar fills from left (0%) to right (100%).

---

## Backend API

| Action | Trigger | Behaviour |
|---|---|---|
| `list_accounts` (doGet) | App startup and after any account change | Returns all rows; computes `utilisation_pct` for credit card and overdraft, `repayment_pct` and `next_payment_date` for loan types; seeds no defaults |
| `create_account` (doPost) | User saves a new account | Validates name, type, currency, `loan_original_amount` for loan types; negates balance for liabilities; appends a new row |
| `update_account` (doPost) | User saves an inline edit | Validates editable fields; rejects non-editable fields with `field_not_editable:X`; overwrites only editable columns |
| `delete_account` (doPost) | User confirms deletion | Deletes the row by sheet row number |
| `get_account_schema` (doGet) | Form initialisation | Returns all 13 types with labels and groups, liability types, loan types, investment sub-types, mortgage sub-types |

Balance adjustments (`adjustAccountBalance`) are performed inside transaction create, update, and delete handlers — not via a dedicated account endpoint.

---

## Notes

- `state.accountMap` is a `{ id → account }` lookup rebuilt whenever accounts are refreshed. Used by the transactions section to resolve account names in the table and form dropdowns.
- After any create, update, or delete, the full account list is re-fetched from the backend to keep `state.accounts` and `state.accountMap` in sync.
- Only currencies present in the `rates` sheet appear in the currency dropdown. Adding a new currency requires adding a row to the `rates` sheet first.
- `get_account_schema` is called at form initialisation so the frontend never hard-codes type lists — they come from the backend.
