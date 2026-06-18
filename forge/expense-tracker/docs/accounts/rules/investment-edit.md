# Investment Account — EDIT

> **Account type:** `investment`  
> **Group:** Asset  
> **Operation:** `edit`

---

**Validations:**

| Field | Condition that blocks | Error message |
|---|---|---|
| Name | Missing | `Name is required` |
| Type | Missing or not one of the six sanctioned types | `Type is required` |
| Currency | Missing or not present in the rates sheet | `Currency is required` |

**Notes:**

- **Editable fields:** name, currency, type, opening_balance, is_active, notes.
- **`current_balance` is read-only.** Shown as a display field only. Corrections go through `Adjustments / Balance correction` transactions. See `account-validations.md`.
- **Currency change:** does not convert balances — numeric values are retained in the new currency.
- **Type change:** changing to a liability type changes balance interpretation and Net Worth contribution.
- `credit_limit` field is not shown for this type.

**Steps on success:**

1. Frontend passes all validations
2. `POST update_account` sent to backend
3. Backend validates: name, type, and currency present and valid
4. Cols 2–5 and 7–9 of the target row overwritten (name, currency, type, opening_balance, credit_limit, is_active, notes); col 6 (`current_balance`) is preserved unchanged
5. Full account list re-fetched from backend
