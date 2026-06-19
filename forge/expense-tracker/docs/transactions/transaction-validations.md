# Transaction Validations

## Overview

Validations are split into two tiers:

- **Data integrity** — structural checks that must pass for the request to make sense (missing fields, invalid types, from = to). These exist today.
- **Financial rules** — balance checks that enforce the ledger discipline. These are the hard blocks described below.

Both tiers are enforced on the **frontend before submission**. The backend enforces data integrity only; financial rule checks are not currently repeated on the backend (acceptable for a single-user personal app).

---

## Hard Block Rules — Financial Balance

Insufficient balance is always a hard block. The user resolves discrepancies by recording an `Adjustments / Balance correction` transaction first, then re-attempting the original transaction.

---

### Rule 1 — money-out from asset account

**Applies to:** `from_account.type` is `current`, `savings`, `cash`, or `investment`

**Condition that blocks:**
```
from_account.current_balance < amount
```

**Error message:**
```
Insufficient balance.
[Account name] has £X — this transaction requires £Y.
Record an Adjustments / Balance correction first if your actual balance is higher.
```

**Show:** account name, current balance, transaction amount, resulting balance if it were to proceed (always negative — shown to make the shortfall clear).

---

### Rule 2 — money-out from credit card

**Applies to:** `from_account.type` is `credit-card`

**Prerequisite:** only applies if `from_account.credit_limit > 0`. If no limit is set on the account, this check is skipped.

**Derived value:**
```
available_credit = credit_limit + current_balance
// current_balance is negative (e.g. limit=1000, balance=−600 → available=400)
```

**Condition that blocks:**
```
amount > available_credit
```

**Error message (normal — available_credit ≥ 0):**
```
Credit limit exceeded.
[Account name] — limit £Y, currently £X owed, available £Z.
This transaction of £A would exceed the limit by £B.
```

**Error message (already over-limit — available_credit < 0):**
```
Credit limit exceeded.
[Account name] — limit £Y, currently £X owed, already £Z over the limit.
This transaction of £A cannot be applied.
```

**Show (normal):** account name, credit limit, current balance (as "owed"), available credit, transaction amount, over-limit shortfall.
**Show (already over-limit):** account name, credit limit, current balance (as "owed"), amount already over the limit. Never render a negative "available £−Z".

---

### Rule 3 — money-transfer from asset account

**Applies to:** `transaction_type` is `money-transfer` and `from_account.type` is an asset

**Same condition and message as Rule 1.**

---

### Rule 4 — money-transfer from credit card

**Applies to:** `transaction_type` is `money-transfer` and `from_account.type` is `credit-card`

**Same condition and message as Rule 2.** (e.g. a cash advance from a credit card)

---

### Rule 5 — money-out from loan account

**Applies to:** `from_account.type` is any loan type — `mortgage`, `auto_loan`, `heloc`, `personal_loan`, `student_loan`, `medical_loan`, or `debt_consolidation`

**Condition that blocks:** always — except the capitalised-interest exemption below.

**Error message:**
```
Cannot record money-out from a loan account.
Loan accounts track what you owe. To record a loan fee or charge, add it as a money-out from your current account, or record it directly in the sheet.
```

**Capitalised-interest exemption:** When `minor_category` is `Interest & charges` (major: `Debt & finance`), money-out from a loan account is permitted. A capitalised interest or fee added to a loan balance by the lender increases the amount owed without any cash leaving an account — recording it as money-out on the loan directly is the correct representation. The `from_account.current_balance` becomes more negative (balance decreases), reflecting the higher outstanding debt.

> **Not covered:** Capitalised interest is the only loan-debit case the app supports today. All other money-out from a loan account remains blocked.

---

### Rule 6 — cross-currency transfer without FX rate

**Applies to:** `transaction_type` is `money-transfer` and `from_account.currency ≠ to_account.currency`

**Condition that blocks:** `fx_rate` is blank or zero.

**FX rate direction (canonical):** The rate is expressed as **units of to-currency per 1 unit of from-currency**.

> Example: transferring GBP → INR at a rate of 105 means £1 = ₹105. The to_account receives `amount × 105`.
> Example: transferring USD → GBP at a rate of 0.79 means $1 = £0.79. The to_account receives `amount × 0.79`.

The UI must display the computed credited amount before the user confirms — e.g. "£500 will be sent; ₹52,500 will be credited to [To account] at 105 INR/GBP."

**Error message:**
```
FX rate required.
[From account] is in [CCY1] and [To account] is in [CCY2]. Enter the exchange rate to continue.
(Rate expressed as units of [CCY2] per 1 [CCY1].)
```

---

## Edit Validation — Post-Reversal Balance Check

When editing a transaction, the balance check cannot use the current stored balance directly — because Phase 1 of the edit (reversal) will first restore some balance before Phase 2 applies the new amount.

The check must use the **post-reversal balance**:

```
post_reversal_balance = current_balance + reversal_amount

where reversal_amount is:
  old type = money-in       → reversal = −old_amount       (balance decreases)
  old type = money-out      → reversal = +old_amount       (balance increases)
  old type = money-transfer → reversal = +old_amount       (from_account balance increases)
```

Then apply Rules 1–6 against `post_reversal_balance` instead of `current_balance`.

**Example:**
- Account balance: £100
- Old transaction being edited: money-out £50 → reversal restores £50 → post-reversal balance = £150
- New transaction: money-out £120 → £150 ≥ £120 → **allowed**
- New transaction: money-out £200 → £150 < £200 → **blocked**

**to_account check on transfer edits:** When editing a `money-transfer`, apply the same post-reversal logic to `to_account` before Phase 2 credits it. The Phase 1 reversal first subtracts the previously credited amount from `to_account.current_balance`; then check that Phase 2's credit does not cause a credit-card overpayment (Rule 4 equivalent). For asset-type to_accounts there is no upper bound, so only credit-card to_accounts need this check.

---

## Existing Data Integrity Checks (already implemented)

Listed here for completeness. These block before financial rules are evaluated.

| Check | Error |
|---|---|
| Date missing | `Date is required` |
| Type missing or invalid | `Type is required` |
| From account missing | `From account is required` |
| To account missing on transfer | `To account is required for transfers` |
| Amount zero or negative | `Enter a positive amount` |
| Major category missing | `Major category is required` |
| Minor category missing | `Minor category is required` |

---

## Resolution Path for Blocked Transactions

When a transaction is blocked by a financial rule, the user must either:

1. **Correct the data** — wrong account selected, wrong amount entered.
2. **Record a balance correction first** — if the app balance is genuinely behind reality, add an `Adjustments / Balance correction` money-in (to increase the balance to match reality), then re-attempt the original transaction.

This is the intended EOD/EOM reconciliation workflow and keeps the ledger internally consistent at all times.

---

## Not Validated (intentional omissions)

| Scenario | Reason not blocked |
|---|---|
| money-in on a credit card | Valid — refund posted directly to a card reduces the amount owed |
| money-in on a loan | Valid — partial write-off or overpayment return |
| money-out amount is very small (e.g. £0.01) | Structurally valid; not a financial rule violation |
| Duplicate transactions (same date, account, amount) | No deduplication — user is responsible |
| Cash advance from credit card recorded as money-in | Not a hard block, but misleading — the correct model is a `money-transfer` from the credit card to the cash account. The UI should guide the user toward this model; see `transaction-lifecycle.md` Group D note. |
| "Loan received" transaction targeting the loan account | Not blocked, but incorrect — loan proceeds should go to the receiving current account as money-in; the loan account's opening balance captures the liability. Attempting money-in on the loan account will over-count assets. The UI should guide users appropriately. |
| Cross-currency transfer without FX rate (1:1 fallback) | Rule 6 now hard-blocks this — the 1:1 fallback silently stores wrong-currency-unit values in to_account and is not permitted. |

---

## Known Limitations & Architecture Decisions

### Non-atomic EDIT (two-phase write)

The two-phase Edit (Phase 1 reversal, Phase 2 application) involves two separate GAS write operations against the accounts sheet. If the backend crashes between the two phases, the ledger is left in an inconsistent intermediate state with no automatic recovery.

**Current state:** There is no reconciliation utility. Manual repair requires re-reading all transaction rows and recomputing account balances from scratch.

**Roadmap requirement:** A balance reconciliation utility — `reconcileAllBalances()` — that recomputes every account's `current_balance` from the full transaction history must be built before the app handles significant transaction volumes or becomes multi-session. Until then, this is a known and accepted risk for single-user personal use.

---

### Hard DELETE (no recovery path)

Deleting a transaction is permanent — the row is removed from the sheet and the balance adjustment is applied immediately. There is no soft-delete, trash, or undo mechanism.

**Implication:** A mis-delete requires the user to re-enter the transaction manually. The inline confirmation step ("Yes, delete") is the only safeguard.

**Roadmap note:** A soft-delete flag (e.g. `deleted_at` column) or an audit-log sheet could provide recovery, but is not currently planned.

---

### Financial rules are frontend-only

The hard-block financial rules (Rules 1–6) are enforced on the frontend before submission. The GAS backend validates data integrity only (required fields, valid types, positive amount). A user with direct Sheets API access or who edits the sheet manually can bypass all financial rules.

**This is an accepted architectural trade-off** for a single-user personal finance app. The alternative — repeating all financial checks server-side — would require the backend to re-read account balances and transaction state on every write, which is feasible but not currently implemented.

**Mitigation:** The balance invariant check (via the reconciliation utility, once built) will surface any violations regardless of how they were introduced.
