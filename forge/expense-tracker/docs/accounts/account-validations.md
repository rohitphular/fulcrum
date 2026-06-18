# Account Validations

## Overview

Validations are enforced on the **frontend before submission**. The backend repeats the data integrity checks (name, type, currency) but does not enforce any financial rules at the account level.

---

## Data Integrity Checks

Applied on Add and Edit.

| Check | Error |
|---|---|
| Name missing | `Name is required` |
| Type missing or not a valid type | `Type is required` |
| Currency missing or not in rates sheet | `Currency is required` |

These block before any backend call is made.

---

## Type-Specific Rules

### Credit card (`credit-card`)

- `credit_limit` field is shown in the Add and Edit forms. It is optional but strongly recommended.
- `available_credit = credit_limit + current_balance` (current_balance is negative). This is used in transaction validation (Rule 2 and Rule 4 in `transaction-validations.md`).
- If `credit_limit` is zero or blank, the credit limit hard-block on transactions is skipped entirely.
- `utilisation_pct` is computed server-side and returned by `list_accounts` as `Math.abs(current_balance) / credit_limit × 100`, rounded to one decimal. It is `null` when `credit_limit` is zero or blank.

### Loan (`loan`)

- `credit_limit` field is not shown.
- `money-out` transactions from a loan account are hard-blocked except for `Debt & finance / Interest & charges` (capitalised interest). See Rule 5 in `transaction-validations.md`.
- Repayments are modelled as `money-transfer` from a current/savings account to the loan account.

### Asset types (`current`, `savings`, `cash`, `investment`)

- No balance upper bound — insufficient balance blocks outgoing transactions (Rule 1 and Rule 3 in `transaction-validations.md`), but there is no cap on inflows.
- `credit_limit` field is not shown; stored as blank.

---

## Liability Balance Convention

Balances on `credit-card` and `loan` accounts represent the **amount owed** and are stored as **negative numbers**.

- A credit card with £600 owed has `current_balance = −600`.
- A loan with £15,000 outstanding has `current_balance = −15000`.
- The UI displays the absolute value with an "owed" label.
- A balance sign hint is shown in the Add and Edit forms whenever a liability type is selected.

Net Worth deducts the absolute value of all liability balances:
```
Net Worth = Total Assets − Total Liabilities
          = Σ(asset current_balance in quote CCY)
          − Σ(abs(liability current_balance) in quote CCY)
```

---

## current_balance — Read-Only After Creation

`current_balance` is a derived value: `opening_balance + Σ(all transaction effects on this account)`. It is set once at account creation (equal to `opening_balance`) and thereafter updated exclusively by `adjustAccountBalance` inside the transaction handlers.

**The account edit form does not include `current_balance` as an input.** It is shown as a read-only display field. The backend `update_account` handler preserves the existing `current_balance` — it is excluded from the column writes (cols 2–5 and 7–9 are overwritten; col 6 is untouched).

**To correct a balance discrepancy** (e.g. the app shows £800 but the real balance is £1,050):
1. Record an `Adjustments / Balance correction` money-in transaction for £250 from the account.
2. The Standard Reload updates `current_balance` to £1,050 via the transaction handler.

This keeps every balance change traceable through transaction history.

---

## Not Validated (intentional omissions)

| Scenario | Reason not blocked |
|---|---|
| Opening balance left blank | Treated as 0; informational field only |
| Positive balance on a liability account | Not blocked at account level; transaction rules govern how balances move |
| Duplicate account name | No deduplication — user is responsible |
| Currency change on existing account | Allowed; no automatic balance conversion |
| Type change between asset and liability | Allowed; balance sign is not adjusted — reconcile manually if needed |
