# Investments / From investment — EDIT

> **Type:** `money-transfer`  
> **Category:** Investments → From investment  
> **Operation:** `edit`

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
| Balance — asset from account | `from_account.type` is `current`, `savings`, `cash`, or `investment` AND `post_reversal_balance < amount` | `Insufficient balance. [Account name] has £X — this transaction requires £Y. Record an Adjustments / Balance correction first if your actual balance is higher.` |
| Credit limit — credit card from | `from_account.type` is `credit-card` AND `from_account.credit_limit > 0` AND `amount > (credit_limit + post_reversal_balance)` | `Credit limit exceeded. [Account name] — limit £Y, currently £X owed, available £Z. This transaction of £A would exceed the limit by £B.` |
| FX rate — cross-currency | `from_account.currency ≠ to_account.currency` AND `fx_rate` is blank or zero | `FX rate required. [From account] is in [CCY1] and [To account] is in [CCY2]. Enter the exchange rate to continue.` |

Financial balance rules applied against `post_reversal_balance = from_account.current_balance + old_amount`.

**Steps on success:**

1. Frontend computes `post_reversal_balance = from_account.current_balance + old_amount`
2. Frontend passes all validations, applying financial balance rules against `post_reversal_balance`
3. Backend reads old row values from transactions sheet
4. **Phase 1 — Reverse old transaction:** `old_from_account.current_balance += old_amount`; `old_to_account.current_balance -= (old_fx_rate > 0 ? old_amount × old_fx_rate : old_amount)`
5. **Phase 2 — Apply new transaction:** `new_from_account.current_balance -= new_amount`; `new_to_account.current_balance += (new_fx_rate > 0 ? new_amount × new_fx_rate : new_amount)`
6. Sheet row cols 2–16 overwritten with new values; col 1 (ID) unchanged
7. Standard Reload triggered
