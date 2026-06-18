# Credit Card Account — ADD

> **Account type:** `credit-card`  
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

- `credit_limit` field is shown and should be populated (optional but strongly recommended for utilisation tracking and hard-block enforcement).
- **Liability balance convention:** balances represent the amount owed and must be entered as a negative number (e.g. `−1500`). The UI displays the absolute value with an "owed" label. A sign hint is shown in the form.
- `current_balance` starts equal to `opening_balance` at account creation.
- `utilisation_pct` is computed by the backend as `abs(current_balance) / credit_limit × 100` and returned with `list_accounts`. It is `null` when `credit_limit` is zero or blank.
- The credit utilisation bar is shown in the accounts table for any credit card with a non-zero `credit_limit`.

**Steps on success:**

1. Frontend passes all validations
2. `POST create_account` sent to backend
3. Backend validates: name, type, and currency present and valid
4. `id` generated: `ACC-YYYYMMDD-NNN` (sequential counter per calendar day)
5. Row appended to accounts sheet; `is_active` set to `TRUE`; `created_at` set to current UTC timestamp
6. Full account list re-fetched from backend (`state.accounts` and `state.accountMap` refreshed)
