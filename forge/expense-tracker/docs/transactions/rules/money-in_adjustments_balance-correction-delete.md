# Adjustments / Balance correction — DELETE

> **Type:** `money-in`  
> **Category:** Adjustments → Balance correction  
> **Operation:** `delete`

---

This category is used to reconcile the app balance with the actual account balance. Record a money-in Balance correction when the actual account balance is higher than the app shows — typically at end-of-day or end-of-month reconciliation.

---

**Steps:**

1. User confirms deletion
2. Backend reads stored row values
3. `from_account.current_balance -= amount`
4. Row deleted from transactions sheet
5. Standard Reload triggered

---

## money-out

All money-out transactions decrease `from_account.current_balance` by `amount`. Financial balance rules apply — the applicable rule depends on `from_account.type`. The data integrity checks and financial validations are identical for every money-out category. Each entry is documented in full.
