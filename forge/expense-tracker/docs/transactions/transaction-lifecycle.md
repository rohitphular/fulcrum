# Transaction Lifecycle

## Overview

Every transaction create, edit, and delete touches two things: the **transactions sheet** (the record) and one or two **account balances** (the financial state). The balance adjustments are the critical part — they are what keeps account `current_balance` accurate at all times.

The steps are not identical for every transaction. They differ based on the **transaction group**, which is determined by the combination of `transaction_type` and whether the accounts involved share the same currency.

---

## The Four Groups

| Group | Type | Currency condition | Accounts touched |
|---|---|---|---|
| **A** | `money-in` | Any | `from_account` only |
| **B** | `money-out` | Any | `from_account` only |
| **C** | `money-transfer` | `from` and `to` share the same currency | `from_account` and `to_account` |
| **D** | `money-transfer` | `from` and `to` have different currencies | `from_account` and `to_account` |

The group is not stored — it is derived at runtime from the transaction row's `transaction_type` and the `fx_rate` field.

---

## Category → Group Mapping

Categories declare *intent* but do not determine the group. The group is determined by the transaction type and the accounts selected. The mappings below reflect the intended usage of each category.

### Group A — money-in

| Major | Minor examples |
|---|---|
| Salary | Monthly pay, Bonus, Commission, Overtime |
| Freelance / Self-employed | Client payment, Consulting, Royalties |
| Business | Sales revenue, Service income |
| Investments | Dividends, Interest earned, Capital gains, Rental income |
| Refunds & reimbursements | Tax refund, Work reimbursement, Purchase refund, Cashback & rewards |
| Borrowing | Loan received, Credit drawn, Money from friend/family |
| Gifts & other | Gift received, Sale of asset, Other income |

### Group B — money-out

| Major | Minor examples |
|---|---|
| Housing | Rent, Mortgage, Council tax, Repairs, Home insurance |
| Utilities | Electricity, Gas, Water, Internet, Mobile, Streaming |
| Food | Groceries, Eating out, Takeaway, Coffee & snacks |
| Transport | Fuel, Public transport, Taxi, Vehicle insurance, Parking |
| Health | Doctor, Pharmacy, Dental, Optical, Health insurance, Gym |
| Shopping | Clothing, Electronics, Household goods, Personal care |
| Entertainment | Subscriptions, Events, Hobbies, Books, Sports |
| Travel | Flights, Accommodation, Local transport, Activities |
| Education | Tuition, Courses, Books & supplies |
| Family & dependents | Childcare, School fees, Family support, Pet care |
| Debt & finance | Loan repayment, Credit card payment, Interest & charges, Bank fees |
| Insurance | Life insurance, General insurance |
| Taxes | Income tax, Other taxes |
| Gifts & donations | Gift given, Charity/Donation |
| Lending | Money lent to friend/family |
| Other | Cash spending, Miscellaneous, Uncategorised |

> **Liability accounts (credit card, loan):** A `money-out` from a credit card or loan account makes the balance more negative — increasing the amount owed. This is the correct representation of spending on credit.

### Group C — money-transfer (same currency)

| Major | Minor examples |
|---|---|
| Between own accounts | Account to account, To savings, From savings |
| Cash | ATM withdrawal, Cash deposit |
| Card payment | Pay credit card |
| Investments | To investment, From investment, To pension |

> **Credit card repayment example:** Paying off a credit card is a transfer from a current account (GBP) to the credit card account (GBP). The credit card balance becomes less negative — reducing the amount owed. This maps to Group C.

### Group D — money-transfer (cross-currency)

| Major | Minor examples |
|---|---|
| Cross-border | UK to India, India to UK |
| Currency exchange | FX conversion |

> Group D requires an `fx_rate`. If omitted, the to account receives the same numeric amount as the from account — a 1:1 transfer regardless of currency difference.

---

## Step-by-Step Lifecycle

### ADD

#### Group A — money-in

1. Frontend validates: date, from_account, amount, major_category, minor_category are all present
2. Date converted to UTC ISO: `new Date(datetimeLocalValue).toISOString()`
3. Currency resolved from `from_account.currency`
4. `POST create_transaction` sent to backend
5. Backend validates: date, type, amount > 0, from_account
6. ID generated: `YYYY-MM-DD-NNN` (sequential counter per calendar day)
7. Row appended to transactions sheet
8. `from_account.current_balance += amount`

#### Group B — money-out

Steps 1–7 identical to Group A.

8. `from_account.current_balance -= amount`

#### Group C — money-transfer (same currency)

Steps 1–6 identical to Group A. Frontend also validates `to_account` is present.

7. Row appended to transactions sheet (fx_rate stored as blank)
8. `from_account.current_balance -= amount`
9. `to_account.current_balance += amount`

#### Group D — money-transfer (cross-currency)

Steps 1–6 identical to Group A. Frontend also validates `to_account`. FX rate field is shown and may be provided.

7. Row appended to transactions sheet (fx_rate stored if provided)
8. `from_account.current_balance -= amount`
9. `to_account.current_balance += (fx_rate > 0 ? amount × fx_rate : amount)`

---

### EDIT

Edit is always a **two-phase operation**: first reverse the old transaction, then apply the new one. This means changing any field — amount, type, account, or FX rate — is handled correctly without special cases.

The old values are read directly from the sheet row before any changes are written.

#### Phase 1 — Reverse the old transaction (based on stored row)

| Old type | Balance adjustment |
|---|---|
| `money-in` | `old_from_account.current_balance -= old_amount` |
| `money-out` | `old_from_account.current_balance += old_amount` |
| `money-transfer` (any) | `old_from_account.current_balance += old_amount` |
| `money-transfer` with `old_to_account` | `old_to_account.current_balance -= (old_fx_rate > 0 ? old_amount × old_fx_rate : old_amount)` |

#### Phase 2 — Apply the new transaction (based on submitted form values)

| New type | Balance adjustment |
|---|---|
| `money-in` | `new_from_account.current_balance += new_amount` |
| `money-out` | `new_from_account.current_balance -= new_amount` |
| `money-transfer` (any) | `new_from_account.current_balance -= new_amount` |
| `money-transfer` with `new_to_account` | `new_to_account.current_balance += (new_fx_rate > 0 ? new_amount × new_fx_rate : new_amount)` |

#### Phase 3 — Overwrite the sheet row

Cols 2–16 overwritten (date through payment_method). Col 1 (ID) is immutable — it never changes on edit.

---

**Cross-type edits are handled automatically.** If the user changes `money-out` to `money-in`, Phase 1 adds back the old amount, Phase 2 adds the new amount. No special case is needed.

**Cross-account edits are handled automatically.** If the user changes the `from_account`, Phase 1 reverses on the old account, Phase 2 applies to the new account.

---

### DELETE

Delete reads the stored row values, reverses their balance effect, then removes the row.

| Stored type | Balance adjustment |
|---|---|
| `money-in` | `from_account.current_balance -= amount` |
| `money-out` | `from_account.current_balance += amount` |
| `money-transfer` (any) | `from_account.current_balance += amount` |
| `money-transfer` with `to_account` | `to_account.current_balance -= (fx_rate > 0 ? amount × fx_rate : amount)` |

After the balance adjustments the row is deleted from the sheet.

---

## Standard Reload

After any successful Add, Edit, or Delete, the frontend dispatches the `et:reload` custom event. The following occurs in sequence:

1. `state.transactions` refreshed from backend
2. `state.accounts` and `state.accountMap` refreshed from backend
3. Dashboard totals recomputed: Total Assets, Total Liabilities, Net Worth (in quote currency using current exchange rates)
4. All affected sections re-rendered: accounts table, transactions table, dashboard cards

---

## Balance Invariant

At any point in time, for any account:

```
current_balance = opening_balance
                + Σ(amount for all money-in transactions on this account)
                - Σ(amount for all money-out transactions on this account)
                - Σ(amount for all money-transfer where this is from_account)
                + Σ(credited_amount for all money-transfer where this is to_account)
```

Where `credited_amount = fx_rate > 0 ? amount × fx_rate : amount`.

This invariant holds as long as no transaction row is manually edited in the sheet and all balance adjustments go through `adjustAccountBalance`.

---

## Key Rules

- **Amount is always positive.** The sign of the balance effect is determined by the transaction type, not the stored amount.
- **Currency is determined by `from_account`.** It is read from the account at save time and stored on the transaction row. Changing the from account on an edit changes the currency implicitly.
- **FX rate = 0 or blank is not permitted on cross-currency transfers.** Rule 6 in `transaction-validations.md` hard-blocks any cross-currency transfer where `fx_rate` is blank or zero — the former 1:1 fallback silently stored wrong-currency-unit amounts in `to_account` and is no longer allowed.
- **ID is immutable.** Never regenerated or changed on edit.
- **`adjustAccountBalance` is the only function that writes to account balances.** It reads the current value, adds the delta, and writes back. There is no bulk recalculation.
- **Balance adjustments are not transactional.** The two-phase Edit involves two separate GAS write operations. If the backend crashes or times out between Phase 1 (reversal) and Phase 2 (application), the ledger is left in an inconsistent intermediate state with no automatic recovery. This is an accepted risk for single-user personal use; see "Known Limitations" in `transaction-validations.md`.
- **A balance reconciliation utility is required before significant scale.** `reconcileAllBalances()` must recompute every account's `current_balance` from the full transaction history (applying the Balance Invariant above) and write the corrected values back. This is the only recovery path for a crash-interrupted Edit and the primary defense against manual sheet edits that bypass `adjustAccountBalance`. Build this before the app reaches significant transaction volumes or becomes multi-session.
