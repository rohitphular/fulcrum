# Housing / Council/Property tax — DELETE

> **Type:** `money-out`  
> **Category:** Housing → Council/Property tax  
> **Operation:** `delete`

---

**Steps:**

1. User confirms deletion
2. Backend reads stored row values
3. `from_account.current_balance += amount`
4. Row deleted from transactions sheet
5. Standard Reload triggered
