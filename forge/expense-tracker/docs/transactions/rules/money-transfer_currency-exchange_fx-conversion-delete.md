# Currency exchange / FX conversion — DELETE

> **Type:** `money-transfer`  
> **Category:** Currency exchange → FX conversion  
> **Operation:** `delete`

---

This category is used for a pure foreign currency exchange between two accounts of different currencies. An FX rate is required.

---

**Steps:**

1. User confirms deletion
2. Backend reads stored row values
3. `from_account.current_balance += amount`
4. `to_account.current_balance -= (fx_rate > 0 ? amount × fx_rate : amount)`
5. Row deleted from transactions sheet
6. Standard Reload triggered
