# Investments / Interest earned — EDIT

> **Type:** `money-in`  
> **Category:** Investments → Interest earned  
> **Operation:** `edit`

---

**Validations:**

| Field | Condition that blocks | Error message |
|---|---|---|
| Date | Missing | `Date is required` |
| Type | Missing or invalid | `Type is required` |
| From account | Missing | `From account is required` |
| Amount | Zero or negative | `Enter a positive amount` |
| Major category | Missing | `Major category is required` |
| Minor category | Missing | `Minor category is required` |

No financial balance check — the new transaction is money-in.

**Steps on success:**

1. Frontend passes all validations
2. Backend reads old row values from transactions sheet
3. **Phase 1 — Reverse old transaction:** `old_from_account.current_balance -= old_amount`
4. **Phase 2 — Apply new transaction:** `new_from_account.current_balance += new_amount`
5. Sheet row cols 2–16 overwritten with new values; col 1 (ID) unchanged
6. Standard Reload triggered
