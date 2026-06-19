# Account Validations

## Overview

Validations are enforced on the **frontend before submission**. The backend repeats data integrity checks (name, type, currency, `loan_original_amount`, date range, numeric range) but does not enforce financial rules at the account level.

---

## Data Integrity Checks

Applied on both Add and Edit.

| Check | Applies on | Error |
|---|---|---|
| Name missing | Add + Edit | `Name is required` |
| Type missing or not one of the 13 sanctioned values | Add | `Type is required` |
| Currency missing or not in rates sheet | Add | `Currency is required` |
| `loan_original_amount` missing or ≤ 0 for any loan type | Add | `Loan original amount is required` |
| `loan_end_date` ≤ `loan_start_date` (when both provided) | Add | `Loan end date must be after start date` |
| `credit_card_billing_date` or `credit_card_due_date` outside 1–31 | Add | `Billing/due date must be between 1 and 31` |
| Non-editable field sent in update body | Edit | `field_not_editable:X` (backend) |

---

## Required-for-type Fields

| Field | Required for | Reason |
|---|---|---|
| `loan_original_amount` | `mortgage`, `auto_loan`, `heloc`, `personal_loan`, `student_loan`, `medical_loan`, `debt_consolidation` | Used to compute `repayment_pct`; immutable baseline for the loan |
| `sub_type` | `mortgage` (required), `investment` (optional) | Mortgage sub-type drives display and reporting |

---

## Numeric Range Checks

| Field | Constraint |
|---|---|
| `loan_interest_rate` | ≥ 0 |
| `loan_tenure_months` | > 0 if provided |
| `credit_card_limit` | ≥ 0 if provided |
| `overdraft_limit` | ≥ 0 if provided |
| `credit_card_billing_date` | 1–31 if provided |
| `credit_card_due_date` | 1–31 if provided |
| `loan_end_date` | > `loan_start_date` if both provided |

---

## Immutable After Creation

The following fields are set at account creation and **cannot be changed via the Edit form**. The backend rejects any attempt to update these fields with a `field_not_editable:X` error.

| Field | Reason |
|---|---|
| `id` | Primary key — must never change |
| `type` | Changing type would invalidate transaction history and balance-rule assumptions |
| `sub_type` | Derived from type at creation; changing independently is meaningless |
| `currency` | Changing would silently misrepresent all historical balances |
| `opening_balance` | Part of balance derivation — changes must go through transactions |
| `current_balance` | Derived value; updated exclusively by `adjustAccountBalance` in transaction handlers |
| `loan_original_amount` | Immutable principal baseline used for `repayment_pct` calculation |
| `loan_start_date` | Date the loan was originated; historical fact |
| `loan_first_repayment_date` | Used to compute rolling `next_payment_date`; must not change |
| `created_at` | Audit timestamp; must never change |

**To correct a balance discrepancy:** record an `Adjustments / Balance correction` transaction. The transaction handler updates `current_balance` via `adjustAccountBalance`, keeping every balance change traceable through transaction history.

---

## Editable Fields by Type

| Type group | Editable fields |
|---|---|
| **All types** | `name`, `is_active`, `institution`, `account_number_last4`, `notes` |
| **Current / Savings** | + `savings_interest_rate`, `savings_interest_frequency` |
| **Investment** | + `savings_maturity_date`, `investment_platform`, `investment_risk_level` |
| **All 7 loan types** | + `loan_interest_rate`, `loan_interest_type`, `loan_tenure_months`, `loan_end_date`, `loan_monthly_repayment` |
| **Mortgage + Auto loan** | + `loan_collateral` (in addition to the loan fields above) |
| **Credit card** | + `credit_card_limit`, `credit_card_apr`, `credit_card_interest_free_days`, `credit_card_billing_date`, `credit_card_due_date`, `credit_card_minimum_payment_pct`, `credit_card_minimum_payment_fixed`, `credit_card_annual_fee` |
| **Overdraft** | + `overdraft_limit`, `overdraft_arranged`, `overdraft_apr` |

---

## Liability Balance Convention

Balances on all liability account types (`mortgage`, `auto_loan`, `heloc`, `personal_loan`, `student_loan`, `medical_loan`, `debt_consolidation`, `credit_card`, `overdraft`) represent the **amount owed** and are **stored as negative numbers**.

- The user enters the outstanding amount as a **positive number** in the form.
- The backend negates it before storage (e.g. entering `15000` stores `−15000`).
- The UI displays the absolute value with an "owed" label.
- A balance sign hint is shown in the Add and Edit forms whenever a liability type is selected.

Net Worth deducts the absolute value of all liability balances:

```
Net Worth = Total Assets − Total Liabilities
          = Σ(asset current_balance in quote CCY)
          − Σ(abs(liability current_balance) in quote CCY)
```

Computed fields using liability balances always use the absolute value:
- `utilisation_pct` = `abs(current_balance) / limit × 100`
- `repayment_pct` = `(loan_original_amount − abs(current_balance)) / loan_original_amount × 100`
