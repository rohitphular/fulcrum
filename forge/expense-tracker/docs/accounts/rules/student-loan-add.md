# Student Loan — ADD

> **Account type:** `student_loan`
> **Group:** Liability
> **Operation:** `add`

---

**Validations:**

| Field | Condition that blocks | Error message |
|---|---|---|
| Name | Missing | `Name is required` |
| Type | Missing or not one of the 13 sanctioned types | `Type is required` |
| Currency | Missing or not present in the rates sheet | `Currency is required` |
| `loan_original_amount` | Missing or ≤ 0 | `Loan original amount is required` |
| `loan_end_date` | Provided and ≤ `loan_start_date` | `Loan end date must be after start date` |

**Notes:**

- `opening_balance` represents the current outstanding balance — entered as a positive number (e.g. `25000`); the backend stores it as `−25000`.
- `current_balance` starts equal to the negated `opening_balance` at account creation.
- `loan_original_amount` is the original principal at origination and is **immutable after creation**.
- `loan_collateral` does not apply to student loans (mortgage and auto_loan only).
- `repayment_pct` is computed server-side: `(loan_original_amount − abs(current_balance)) / loan_original_amount × 100`.
- `next_payment_date` is derived from `loan_first_repayment_date` by advancing months to the next future date; not stored.
- A balance sign hint is shown in the form when the liability type is selected.

**Steps on success:**

1. Frontend passes all validations
2. `POST create_account` sent to backend
3. Backend validates: name, type, currency, `loan_original_amount` > 0, `loan_end_date` > `loan_start_date` if both provided
4. `id` generated: `ACC-YYYYMMDD-NNN` (sequential counter per calendar day)
5. Row appended to accounts sheet; `is_active` set to `TRUE`; `created_at` set to current UTC timestamp; opening balance negated and stored
6. Full account list re-fetched from backend (`state.accounts` and `state.accountMap` refreshed)
