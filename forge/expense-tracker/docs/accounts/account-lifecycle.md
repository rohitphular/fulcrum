# Account Lifecycle

## Overview

An account record has three lifecycle states: **active**, **archived**, and **deleted**. Only active accounts appear in transaction form dropdowns. All account mutations route through the four backend actions described below.

---

## Backend API

| Action | Trigger | Behaviour |
|---|---|---|
| `list_accounts` (doGet) | App startup and after any account change | Returns all rows; computes `utilisation_pct` for credit cards with a non-zero `credit_limit`; seeds no defaults |
| `create_account` (doPost) | User saves a new account | Validates name, type, currency; appends a row; `credit_limit` stored blank for non-credit-card types; `is_active = TRUE` |
| `update_account` (doPost) | User saves an inline edit | Validates name, type, currency; overwrites cols 2–9 |
| `delete_account` (doPost) | User confirms deletion | Deletes the row by sheet row number; no cascade to transactions |

---

## Balance Adjustments

`current_balance` is **not** modified by the account create, update, or delete handlers. It is written exclusively by:

- `create_transaction` — adjusts from_account (and to_account for transfers)
- `update_transaction` — two-phase edit: Phase 1 reverses old effects, Phase 2 applies new ones
- `delete_transaction` — reverses stored balance effects

The function `adjustAccountBalance(accountId, delta)` is the only write path. It reads the current value, adds `delta`, and writes back. There is no bulk recalculation.

See `transaction-lifecycle.md` for the full balance adjustment mechanics and the Balance Invariant.

---

## Archiving vs Deleting

| | Archive (`is_active = FALSE`) | Delete |
|---|---|---|
| Appears in accounts table | Yes | No |
| Appears in transaction dropdowns | No | No |
| Transaction history preserved | Yes | Yes (dangling refs) |
| Net Worth contribution | Yes | No |
| Recoverable | Yes (re-activate via Edit) | No |

**Archiving is the recommended path** for any account with transaction history. Deletion should only be used for accounts created by mistake with no associated transactions.

---

## State Refresh

After any successful create, update, or delete, the frontend re-fetches `list_accounts` and rebuilds:

1. `state.accounts` — full account list (active and archived)
2. `state.accountMap` — `{ id → account }` lookup used by transactions section
3. Net Worth cards — Total Assets, Total Liabilities, Net Worth recalculated in quote currency
4. Account table re-rendered (assets section, liabilities section, group subtotals)

---

## Key Rules

- **`adjustAccountBalance` is the only function that writes to `current_balance`.** No direct writes; no bulk recalculation.
- **Opening balance is informational.** Stored on creation, never used in calculations. `current_balance` is the live figure.
- **Deleting an account does not delete its transactions.** Transactions retain their stored account references and remain visible in the transaction table.
- **Currency and type changes on edit do not adjust balances.** If the currency of an account changes, `current_balance` retains its numeric value in the new currency. If the type changes (asset ↔ liability), the Net Worth contribution changes sign but the balance value is unchanged. Use `Adjustments / Balance correction` to reconcile if needed.
