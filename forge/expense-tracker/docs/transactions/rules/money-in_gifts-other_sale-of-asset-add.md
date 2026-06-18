# Gifts & other / Sale of asset — ADD

> **Type:** `money-in`  
> **Category:** Gifts & other → Sale of asset  
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

No financial balance check — this is a money-in transaction.

**Steps on success:**

1. Frontend passes all validations
2. Date converted to UTC ISO: `new Date(datetimeLocalValue).toISOString()`
3. Currency resolved from `from_account.currency`
4. `POST create_transaction` sent to backend
5. Backend validates: date, type, amount > 0, from_account present
6. ID generated: `YYYY-MM-DD-NNN` (sequential counter per calendar day)
7. Row appended to transactions sheet
8. `from_account.current_balance += amount`
9. Standard Reload triggered
