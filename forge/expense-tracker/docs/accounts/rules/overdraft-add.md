# Overdraft — ADD

> **Account type:** `overdraft`
> **Group:** Liability
> **Operation:** `add`

---

**Validations:**

| Field | Condition that blocks | Error message |
|---|---|---|
| Name | Missing | `Name is required` |
| Type | Missing or not one of the 13 sanctioned types | `Type is required` |
| Currency | Missing or not present in the rates sheet | `Currency is required` |
| `overdraft_limit` | Provided but < 0 | `Overdraft limit must be 0 or greater` |

**Notes:**

- `opening_balance` represents the amount currently drawn on the overdraft — entered as a positive number (e.g. `500`); the backend stores it as `−500`. A zero or blank opening balance means the overdraft facility exists but is not currently drawn.
- `current_balance` starts equal to the negated `opening_balance` at account creation.
- `overdraft_arranged` (`TRUE` / `FALSE`) indicates whether this is an arranged (pre-agreed) or unarranged overdraft. Unarranged overdrafts typically carry higher fees.
- `utilisation_pct` is computed server-side as `abs(current_balance) / overdraft_limit × 100`; returned by `list_accounts`. It is `null` when `overdraft_limit` is zero or blank.
- The overdraft utilisation bar is shown in the accounts table for any overdraft account with a non-zero `overdraft_limit`.
- A balance sign hint is shown in the form when the liability type is selected.

**Steps on success:**

1. Frontend passes all validations
2. `POST create_account` sent to backend
3. Backend validates: name, type, and currency present and valid; `overdraft_limit` ≥ 0 if provided
4. `id` generated: `ACC-YYYYMMDD-NNN` (sequential counter per calendar day)
5. Row appended to accounts sheet; `is_active` set to `TRUE`; `created_at` set to current UTC timestamp; opening balance negated and stored
6. Full account list re-fetched from backend (`state.accounts` and `state.accountMap` refreshed)
