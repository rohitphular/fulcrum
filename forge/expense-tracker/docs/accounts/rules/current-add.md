# Current Account — ADD

> **Account type:** `current`  
> **Group:** Asset  
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
- Opening balance is optional and informational only; it is not used in calculations.
- `current_balance` starts equal to `opening_balance` at account creation.

**Steps on success:**

1. Frontend passes all validations
2. `POST create_account` sent to backend
3. Backend validates: name, type, and currency present and valid
4. `id` generated: `ACC-YYYYMMDD-NNN` (sequential counter per calendar day)
5. Row appended to accounts sheet; `is_active` set to `TRUE`; `created_at` set to current UTC timestamp
6. Full account list re-fetched from backend (`state.accounts` and `state.accountMap` refreshed)
