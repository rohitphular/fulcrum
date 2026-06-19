# HELOC — EDIT

> **Account type:** `heloc`
> **Group:** Liability
> **Operation:** `edit`

---

**Validations:**

| Field | Condition that blocks | Error message |
|---|---|---|
| Name | Missing | `Name is required` |
| `loan_end_date` | Provided and ≤ `loan_start_date` | `Loan end date must be after start date` |
| Any non-editable field | Sent in request body | `field_not_editable:X` (backend) |

**Notes:**

- **Editable fields:** `name`, `is_active`, `institution`, `account_number_last4`, `notes`, `loan_interest_rate`, `loan_interest_type`, `loan_tenure_months`, `loan_end_date`, `loan_monthly_repayment`.
- **Cannot change:** `id`, `type`, `sub_type`, `currency`, `opening_balance`, `current_balance`, `loan_original_amount`, `loan_start_date`, `loan_first_repayment_date`, `created_at`.
- `loan_collateral` is not applicable to HELOC and is not shown or editable.
- **`current_balance` is read-only.** Balance changes via repayment transactions only — record a `money-transfer` from a current/savings account to this HELOC account.
- `money-out` from a HELOC account is hard-blocked by Rule 5 in `transaction-validations.md`, except for `Debt & finance / Interest & charges` (capitalised interest).

**Steps on success:**

1. Frontend passes all validations
2. `POST update_account` sent to backend with editable fields only
3. Backend validates: name present; date range check; rejects any non-editable field with `field_not_editable:X`
4. Editable columns overwritten for the target row; `current_balance` is preserved unchanged
5. Full account list re-fetched from backend
