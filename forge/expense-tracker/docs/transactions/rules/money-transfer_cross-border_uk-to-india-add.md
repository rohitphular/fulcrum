# Cross-border / UK to India — ADD

> **Type:** `money-transfer`  
> **Category:** Cross-border → UK to India  
> **Operation:** `add`

---

This category is used for international transfers where the two accounts hold different currencies. An FX rate is required.

---

**Validations:**

| Field | Condition that blocks | Error message |
|---|---|---|
| Date | Missing | `Date is required` |
| Type | Missing or invalid | `Type is required` |
| From account | Missing | `From account is required` |
| To account | Missing | `To account is required for transfers` |
| Amount | Zero or negative | `Enter a positive amount` |
| Major category | Missing | `Major category is required` |
| Minor category | Missing | `Minor category is required` |
| Balance — asset from account | `from_account.type` is `current`, `savings`, `cash`, or `investment` AND `from_account.current_balance < amount` | `Insufficient balance. [Account name] has £X — this transaction requires £Y. Record an Adjustments / Balance correction first if your actual balance is higher.` |
| Credit limit — credit card from | `from_account.type` is `credit-card` AND `from_account.credit_limit > 0` AND `amount > available_credit` | `Credit limit exceeded. [Account name] — limit £Y, currently £X owed, available £Z. This transaction of £A would exceed the limit by £B.` |
| FX rate — cross-currency | `from_account.currency ≠ to_account.currency` AND `fx_rate` is blank or zero | `FX rate required. [From account] is in [CCY1] and [To account] is in [CCY2]. Enter the exchange rate to continue.` |

**Steps on success:**

1. Frontend passes all validations including FX rate
2. Date converted to UTC ISO: `new Date(datetimeLocalValue).toISOString()`
3. Currency resolved from `from_account.currency`
4. `POST create_transaction` sent to backend
5. Backend validates: date, type, amount > 0, from_account and to_account present
6. ID generated: `YYYY-MM-DD-NNN` (sequential counter per calendar day)
7. Row appended to transactions sheet; fx_rate stored
8. `from_account.current_balance -= amount`
9. `to_account.current_balance += amount × fx_rate`
10. Standard Reload triggered
