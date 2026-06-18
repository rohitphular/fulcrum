# Refunds & reimbursements / Purchase refund — DELETE

> **Type:** `money-in`  
> **Category:** Refunds & reimbursements → Purchase refund  
> **Operation:** `delete`

---

**Steps:**

1. User confirms deletion
2. Backend reads stored row values
3. `from_account.current_balance -= amount`
4. Row deleted from transactions sheet
5. Standard Reload triggered
