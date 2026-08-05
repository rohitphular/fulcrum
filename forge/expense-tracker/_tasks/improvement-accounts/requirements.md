# Accounts — Metadata & Job Module Requirements

## Context

Accounts currently store transactional-adjacent data (opening_value, current_value) but no
type-specific metadata. This task adds structured metadata fields for Credit Card, Personal
Loan, and Mortgage account types, and introduces a local job module to compute and write
derived values back to the Accounts sheet.

---

## Existing schema (unchanged)

| # | Column | Notes |
|---|---|---|
| 1 | id | |
| 2 | name | |
| 3 | type | |
| 4 | sub_type | |
| 5 | currency | |
| 6 | opening_value | Reused as loan_original_amount for loan/mortgage types |
| 7 | current_value | Reused as outstanding_balance — job writes here |
| 8 | is_active | |
| 9 | notes | |
| 10 | created_at | |

---

## New columns (sparse — empty for non-applicable types)

All type-specific fields are prefixed by account type for clarity and to avoid ambiguity
in the sheet. Every field is unambiguously owned by one type — no shared columns.

### Credit Card (cols 11–15)

| # | Column | Type | Written by |
|---|---|---|---|
| 11 | cc_annual_interest_rate | number (%) | User |
| 12 | cc_credit_limit | number | User |
| 13 | cc_billing_month_day | integer (day of month, 1–31) | User |
| 14 | cc_payment_month_day | integer (day of month, 1–31) | User |
| 15 | cc_interest_and_charges_paid | number | Job |

### Loans — Personal Loan & Mortgage (cols 16–22)

Applies to all loan-type accounts (`type = personal_loan`, `type = mortgage`).
The `type` field on the account distinguishes between them when needed.

| # | Column | Type | Written by |
|---|---|---|---|
| 16 | loan_original_amount | number | User |
| 17 | loan_annual_interest_rate | number (%) | User |
| 18 | loan_start_date | date (YYYY-MM-DD) | User |
| 19 | loan_tenure_months | integer | User |
| 20 | loan_installment_amount | number | User |
| 21 | loan_installments_completed | integer | Job |
| 22 | loan_interest_and_charges_paid | number | Job |

---

## Field reuse decisions

| Field | Reused as | Rationale |
|---|---|---|
| opening_value | account opening balance | No longer reused for loans — `loan_original_amount` is the explicit source of truth |
| current_value | outstanding_balance (loan/mortgage) / current balance (CC) | Job writes here; FE reads it as-is |

---

## Job module

### Location

`forge/expense-tracker/job/`

### Language

Python (already in stack)

### Trigger

Manual (CLI) for now. Cron-schedulable later.

### Responsibilities

1. Read all accounts from the Accounts sheet
2. Read all transactions from the Transactions sheet
3. For each loan/mortgage account:
   - Count transactions linked to the account → `installments_completed`
   - Compute `current_value` (outstanding balance) — see accuracy level below
4. For each credit card account:
   - Sum unpaid charges linked to the account → `current_value`
5. Write computed values back to the Accounts sheet

### Outstanding balance accuracy

Two options — decision pending:

**Option A — Simple approximation**
`outstanding = loan_original_amount − (loan_installments_completed × loan_installment_amount)`
Ignores principal/interest split. Fast to implement, slightly inaccurate over time.

**Option B — Full amortization**
Derives exact principal paid per installment from `annual_interest_rate`,
`loan_tenure_months`, and `loan_start_date`. Accurate, slightly more complex.

---

## Open questions

1. Outstanding balance accuracy: simple approximation (`opening_value − installments_completed × emi_amount`) or full amortization schedule?
2. How are loan/mortgage repayment transactions identified? By account linkage only, or does the transaction category also need to match?
3. CC outstanding: does the job compute from transactions, or is it always manual?
4. Any metadata needed for Investment or Savings account types?
