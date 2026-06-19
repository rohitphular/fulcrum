# Credit Card Account — ADD

> **Account type:** `credit_card`
> **Group:** Liability
> **Operation:** `add`

---

**Validations:**

| Field | Condition that blocks | Error message |
|---|---|---|
| Name | Missing | `Name is required` |
| Type | Missing or not one of the 13 sanctioned types | `Type is required` |
| Currency | Missing or not present in the rates sheet | `Currency is required` |
| `credit_card_billing_date` | Provided but outside 1–31 | `Billing date must be between 1 and 31` |
| `credit_card_due_date` | Provided but outside 1–31 | `Due date must be between 1 and 31` |
| `credit_card_limit` | Provided but < 0 | `Credit limit must be 0 or greater` |

**Notes:**

- `opening_balance` represents the current outstanding balance — entered as a positive number (e.g. `1500`); the backend stores it as `−1500`.
- `current_balance` starts equal to the negated `opening_balance` at account creation.
- `credit_card_limit` is optional but strongly recommended — required for utilisation tracking and for Rule 2 hard-block enforcement on transactions.
- `utilisation_pct` is computed server-side as `abs(current_balance) / credit_card_limit × 100`; returned by `list_accounts`. It is `null` when `credit_card_limit` is zero or blank.
- The credit utilisation bar is shown in the accounts table for any credit card with a non-zero `credit_card_limit`.
- A balance sign hint is shown in the form when the liability type is selected.

**Steps on success:**

1. Frontend passes all validations
2. `POST create_account` sent to backend
3. Backend validates: name, type, and currency present and valid; numeric range checks on billing/due dates
4. `id` generated: `ACC-YYYYMMDD-NNN` (sequential counter per calendar day)
5. Row appended to accounts sheet; `is_active` set to `TRUE`; `created_at` set to current UTC timestamp; opening balance negated and stored
6. Full account list re-fetched from backend (`state.accounts` and `state.accountMap` refreshed)
