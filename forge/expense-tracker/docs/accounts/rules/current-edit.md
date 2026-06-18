# Current Account — EDIT

> **Account type:** `current`  
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
- **`current_balance` is read-only.** It is shown in the form as a display field only and is not submitted. Corrections go through `Adjustments / Balance correction` transactions. See `account-validations.md`.
- **Currency change:** does not convert `current_balance` or `opening_balance` — balances retain their numeric value in the new currency. Record an `Adjustments / Balance correction` if the displayed balance needs to differ after a currency change.
- **Type change:** switching to a liability type changes how the balance is displayed and used in Net Worth. The balance value itself is not adjusted.
- `credit_limit` field is not shown for this type; if the account is reclassified to `credit-card`, the `credit_limit` will need to be set in a subsequent edit.

**Steps on success:**

1. Frontend passes all validations
2. `POST update_account` sent to backend
3. Backend validates: name, type, and currency present and valid
4. Cols 2–5 and 7–9 of the target row overwritten (name, currency, type, opening_balance, credit_limit, is_active, notes); col 6 (`current_balance`) is preserved unchanged
5. Full account list re-fetched from backend
