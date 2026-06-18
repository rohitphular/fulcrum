# Adjustments / Balance correction — DELETE

> **Type:** `money-out`  
> **Category:** Adjustments → Balance correction  
> **Operation:** `delete`

---

This category is used to reconcile the app balance with the actual account balance. Record a money-out Balance correction when the actual account balance is lower than the app shows — typically at end-of-day or end-of-month reconciliation.

---

**Steps:**

1. User confirms deletion
2. Backend reads stored row values
3. `from_account.current_balance += amount`
4. Row deleted from transactions sheet
5. Standard Reload triggered

---

## money-transfer

Money-transfer transactions move funds between two of your own accounts. `from_account.current_balance` decreases by `amount`; `to_account.current_balance` increases by `amount` (same currency) or `amount × fx_rate` (cross-currency).

Financial balance rules apply to the `from_account`. Rule D (FX rate required) applies whenever the two accounts have different currencies.
