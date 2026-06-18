# Utilities / Internet — ADD

> **Type:** `money-out`  
> **Category:** Utilities → Internet  
> **Operation:** `add`

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
| Balance — asset account | `from_account.type` is `current`, `savings`, `cash`, or `investment` AND `from_account.current_balance < amount` | `Insufficient balance. [Account name] has £X — this transaction requires £Y. Record an Adjustments / Balance correction first if your actual balance is higher.` |
| Credit limit — credit card | `from_account.type` is `credit-card` AND `from_account.credit_limit > 0` AND `amount > available_credit` | `Credit limit exceeded. [Account name] — limit £Y, currently £X owed, available £Z. This transaction of £A would exceed the limit by £B.` |
| Loan restriction | `from_account.type` is `loan` | `Cannot record money-out from a loan account. Loan accounts track what you owe. To record a loan fee or charge, add it as a money-out from your current account, or record it directly in the sheet.` |

**Steps on success:**

1. Frontend passes all validations including financial balance rules
2. Date converted to UTC ISO: `new Date(datetimeLocalValue).toISOString()`
3. Currency resolved from `from_account.currency`
4. `POST create_transaction` sent to backend
5. Backend validates: date, type, amount > 0, from_account present
6. ID generated: `YYYY-MM-DD-NNN` (sequential counter per calendar day)
7. Row appended to transactions sheet
8. `from_account.current_balance -= amount`
9. Standard Reload triggered
