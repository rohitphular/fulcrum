# Loan Account — ADD

> **Account type:** `loan`  
> **Group:** Liability  
> **Operation:** `add`

---

**Validations:**

| Field | Condition that blocks | Error message |
|---|---|---|
| Name | Missing | `Name is required` |
| Type | Missing or not one of the six sanctioned types | `Type is required` |
| Currency | Missing or not present in the rates sheet | `Currency is required` |

**Notes:**

- `credit_limit` field is not shown — not applicable to this account type.
- **Liability balance convention:** balances represent the amount outstanding and must be entered as a negative number (e.g. `−15000`). A sign hint is shown in the form.
- `current_balance` starts equal to `opening_balance` at account creation.
- Loan accounts can only receive `money-transfer` transactions for repayments (reducing the balance) and `money-out` for capitalised interest/fees (`Debt & finance / Interest & charges` only). All other `money-out` from a loan is hard-blocked. See `transaction-validations.md` Rule 5.

**Steps on success:**

1. Frontend passes all validations
2. `POST create_account` sent to backend
3. Backend validates: name, type, and currency present and valid
4. `id` generated: `ACC-YYYYMMDD-NNN` (sequential counter per calendar day)
5. Row appended to accounts sheet; `is_active` set to `TRUE`; `created_at` set to current UTC timestamp
6. Full account list re-fetched from backend (`state.accounts` and `state.accountMap` refreshed)
