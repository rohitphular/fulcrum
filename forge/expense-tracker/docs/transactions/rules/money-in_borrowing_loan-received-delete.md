# Borrowing / Loan received — DELETE

> **Type:** `money-in`  
> **Category:** Borrowing → Loan received  
> **Operation:** `delete`

---

**Steps:**

1. User confirms deletion
2. Backend reads stored row values
3. `from_account.current_balance -= amount`
4. Row deleted from transactions sheet
5. Standard Reload triggered
