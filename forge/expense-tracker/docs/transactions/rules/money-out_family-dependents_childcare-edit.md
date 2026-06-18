# Family & dependents / Childcare — EDIT

> **Type:** `money-out`  
> **Category:** Family & dependents → Childcare  
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
| Balance — asset account | `from_account.type` is `current`, `savings`, `cash`, or `investment` AND `post_reversal_balance < amount` | `Insufficient balance. [Account name] has £X — this transaction requires £Y. Record an Adjustments / Balance correction first if your actual balance is higher.` |
| Credit limit — credit card | `from_account.type` is `credit-card` AND `from_account.credit_limit > 0` AND `amount > (credit_limit + post_reversal_balance)` | `Credit limit exceeded. [Account name] — limit £Y, currently £X owed, available £Z. This transaction of £A would exceed the limit by £B.` |
| Loan restriction | `from_account.type` is `loan` | `Cannot record money-out from a loan account. Loan accounts track what you owe. To record a loan fee or charge, add it as a money-out from your current account, or record it directly in the sheet.` |

Financial balance rules applied against `post_reversal_balance = from_account.current_balance + old_amount`.

**Steps on success:**

1. Frontend computes `post_reversal_balance = from_account.current_balance + old_amount`
2. Frontend passes all validations, applying financial balance rules against `post_reversal_balance`
3. Backend reads old row values from transactions sheet
4. **Phase 1 — Reverse old transaction:** `old_from_account.current_balance += old_amount`
5. **Phase 2 — Apply new transaction:** `new_from_account.current_balance -= new_amount`
6. Sheet row cols 2–16 overwritten with new values; col 1 (ID) unchanged
7. Standard Reload triggered
