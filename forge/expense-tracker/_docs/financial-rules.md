# Financial Rules

Hard-block rules enforced before a transaction is saved (create or update). Each rule returns either `pass` or a blocking error message. The frontend runs them pre-save; the backend re-enforces them on submission as a safety net.

The rules apply to the **post-reversal balance** during an update (see [balance-lifecycle.md](balance-lifecycle.md)).

## Rule 1 — Insufficient balance on asset accounts

**Triggers when:** `transaction_type ∈ {money-out, money-transfer}` AND `source_account.type ∈ {current, savings, cash, investment}`.

**Blocks if:** `source_account.current_balance < amount`.

**Rationale:** Asset accounts cannot go negative through the app. Genuine overdrafts should be modelled as `overdraft` accounts.

**Recovery:** Record an `Adjustments / Balance correction` transaction to bring the recorded balance in line with reality, then retry.

## Rule 2 — Credit limit exceeded on credit card

**Triggers when:** `transaction_type ∈ {money-out, money-transfer}` AND `source_account.type = credit_card` AND `source_account.credit_card_limit > 0`.

**Available credit:** `credit_card_limit + current_balance` (note: balance is stored negative for liabilities, so this evaluates to `limit − amount_owed`).

**Blocks if:** `amount > available_credit`.

**Recovery:** Reduce the amount, or increase the credit limit on the account if your real-world limit has changed.

## Rule 3 — Insufficient balance applies to transfers too

Rule 1 also applies when `transaction_type = money-transfer` and the source is an asset account. The destination type is irrelevant.

## Rule 4 — Credit limit applies to credit-card transfers too

Rule 2 also applies when `transaction_type = money-transfer` and the source is a credit card. Additionally, when the **target** is a credit card with a non-zero limit (e.g. paying *into* a credit card from another card — unusual but representable), the credited amount must not exceed the target's available credit; same formula on the target side. This second target-side check is currently enforced only on `update` for `money-transfer`.

## Rule 5 — No money-out from a loan account

**Triggers when:** `transaction_type = money-out` AND `source_account.type ∈ {mortgage, auto_loan, heloc, personal_loan, student_loan, medical_loan, debt_consolidation}`.

**Blocks unless:** `major_category = "Debt & finance"` AND `minor_category = "Interest & charges"` — this exception covers interest accruals and fees recorded against the loan itself.

**Rationale:** Loan accounts represent money owed, not money held. You cannot spend *from* a loan. Repayments to a loan are modelled as `money-transfer` from a current account, or `money-out` with the loan as the *target*.

## Rule 6 — FX rate required for cross-currency transfers

**Triggers when:** `transaction_type = money-transfer` AND `source_account.currency ≠ target_account.currency`.

**Blocks if:** `fx_rate` is missing or `≤ 0`.

**Rationale:** A 1:1 application across currencies is almost always wrong. The user must enter the rate they actually transacted at so that the credited amount reflects reality. The rate is stored on the row, not derived from the global rates table — this preserves accurate balance arithmetic even if global rates change later.

**Direction:** the entered rate is `units of target currency per 1 unit of source currency`. The credited amount on the target is `amount × fx_rate`.

This rule applies equally when `money-out` is recorded against a target account with a different currency (e.g. cross-currency loan repayment).

## Post-reversal balance formula (for edit)

When validating an **edit** rather than a create, evaluate the rules against the source account's balance *after* the old row would have been reversed:

```
post_reversal_balance = source.current_balance

if old.source_account == new.source_account:
    if old.type == 'money-in':       post_reversal_balance -= old.amount
    if old.type == 'money-out':      post_reversal_balance += old.amount
    if old.type == 'money-transfer': post_reversal_balance += old.amount
```

Pass `post_reversal_balance` to Rules 1–4 instead of the raw `current_balance`. Without this adjustment, edits that merely *change* a transaction (e.g. fix a typo'd amount of £100 to £105) would be rejected when the resulting balance is still fine.

The same logic applies to the target account for Rule 4's target-side credit-limit check on cross-currency credit-card transfers.

## Soft warnings (non-blocking)

These are signalled in the UI but do not prevent saving:

| Signal | When | Where |
|---|---|---|
| `?` badge on amount | `transaction.currency` not present in `rates` table | Transactions list |
| `†` marker next to amount | Row uses its own `fx_rate` rather than the global rate | Transactions list |
| `⚠ N rows have warnings` banner | Stored row has missing `id`, missing `transaction_date_utc`, or invalid `transaction_type` | Above transactions table |

Malformed rows are excluded from dashboard totals and account balance arithmetic — they exist purely as a diagnostic to surface bad data in the underlying store.
