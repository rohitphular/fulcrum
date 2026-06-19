# Accounts

## Overview

Manages the set of financial accounts tracked in the app. Every transaction must be linked to at least one account, and account balances are kept in sync automatically as transactions are created, edited, or deleted.

Accounts are split into two groups — **Assets** (accounts that hold value) and **Liabilities** (accounts that represent money owed). This distinction drives the Net Worth summary and controls how balances are displayed in the UI.

---

## Data Model

Sheet: `accounts`

| Field | Type | Description |
|---|---|---|
| `id` | string | Auto-generated identifier in the format `ACC-YYYYMMDD-NNN` |
| `name` | string | Display name for the account (e.g. `Barclays Current`) |
| `currency` | string | ISO 4217 currency code (e.g. `GBP`, `INR`) |
| `type` | string | Account type — one of `current`, `savings`, `cash`, `investment`, `credit-card`, `loan` |
| `opening_balance` | number | Balance at the time the account was created in the app |
| `current_balance` | number | Live balance updated on every transaction create, edit, or delete |
| `credit_limit` | number | Credit limit — populated for `credit-card` accounts only; blank for all others |
| `is_active` | boolean | `TRUE` for active accounts; `FALSE` for archived ones |
| `notes` | string | Optional free-text notes about the account |
| `created_at` | UTC ISO datetime | Timestamp of when the account row was created |

---

## Account Type Taxonomy

| Type | Group | Description |
|---|---|---|
| `current` | Asset | Day-to-day current or checking account |
| `savings` | Asset | Savings or ISA account |
| `cash` | Asset | Physical cash held outside a bank |
| `investment` | Asset | Stocks, shares ISA, or investment portfolio |
| `credit-card` | Liability | Credit card — balance represents amount owed |
| `loan` | Liability | Personal loan, car finance, or any other loan |

Debt is modelled implicitly through liability account types. No separate debt tracker is needed — a credit card or loan account captures the balance owed, and repayments flow through normal `money-transfer` transactions.

---

## Features

- Net Worth summary: Total Assets, Total Liabilities, and Net Worth calculated in the quote currency
- Account table grouped into Assets and Liabilities sections, each with a group subtotal
- Add new accounts for any supported type and currency
- Edit any account inline (name, currency, type, balances, credit limit, status, notes)
- Archive an account (status = archived) without deleting it
- Delete an account with an inline confirmation step
- Credit card utilisation bar — shows balance used against the credit limit with colour-coded fill
- Liability balance displayed as `X owed` in the UI with a distinct colour to distinguish from assets
- Balance sign hint shown in the add and edit forms when a liability type is selected

---

## User Interactions

| Action | How |
|---|---|
| Add an account | Click **+ Add account** → fill name, currency, type, balances → **Save** |
| Edit an account | Click **Edit** on a row → inline form → **Save** |
| Archive an account | Click **Edit** → change Status to **archived** → **Save** |
| Delete an account | Click **Delete** → inline confirmation → **Yes, delete** |
| Cancel any action | Click **Cancel** |

---

## Business Rules / Validations

- **Name is required.** Saving without a name is blocked with an inline error.
- **Type is required.** Must be one of the six sanctioned types; enforced on the backend.
- **Currency is required.** Drawn from the configured rates list; only known currencies are accepted.
- **Credit limit field is conditional.** The field is shown in the add and edit forms only when `credit-card` is selected. It is stored as blank for all other types.
- **Liability balance convention.** Balances on liability accounts (credit card, loan) represent the amount owed and should be entered as a negative number (e.g. `−1500`). The UI displays the absolute value with an "owed" label. A hint is shown in the add/edit form whenever a liability type is selected.
- **`utilisation_pct` is computed server-side.** For credit card accounts with a non-zero credit limit it is returned by `listAccounts` as `Math.abs(current_balance) / credit_limit × 100`, rounded to one decimal place. It is `null` for all other account types.
- **Opening balance is informational.** It is stored but not used in any calculations. The app operates on `current_balance` throughout.
- **Deleting an account does not affect transactions.** Existing transactions that reference the deleted account retain their stored account references; the account simply disappears from the account list and the transaction form dropdowns.
- **Balances are adjusted automatically.** `current_balance` is updated on the backend whenever a transaction is created, edited, or deleted. It is **not editable** in the account edit form — the field is shown read-only. To correct a discrepancy between the app balance and the real account balance, record an `Adjustments / Balance correction` transaction (money-in to increase, money-out to decrease).

---

## Net Worth Summary

Three read-only summary cards appear above the account table, always shown in the quote currency:

| Card | Calculation |
|---|---|
| **Total Assets** | Sum of `toBase(current_balance, currency)` for all asset accounts |
| **Total Liabilities** | Sum of `abs(toBase(current_balance, currency))` for all liability accounts |
| **Net Worth** | Total Assets − Total Liabilities |

All figures use the current exchange rates from `state.rateMap`. Negative net worth is displayed in ember/red.

---

## Credit Card Utilisation Bar

For `credit-card` accounts with a non-zero `credit_limit`, the balance cell shows:

- The balance as `X owed`
- A line showing `X of Y (Z%)` in monospace
- A thin coloured progress bar

The bar colour changes based on utilisation:

| Utilisation | Colour |
|---|---|
| 0–30% | Teal |
| 30–60% | Amber (light) |
| 60–90% | Amber (dark) |
| >90% | Ember / red |

---

## Backend API

| Action | Trigger | Behaviour |
|---|---|---|
| `list_accounts` (doGet) | App startup and after any account change | Returns all rows with `utilisation_pct` computed for credit cards; seeds no defaults |
| `create_account` (doPost) | User saves a new account | Validates name, type, and currency; appends a new row; `credit_limit` stored as blank for non-credit-card types |
| `update_account` (doPost) | User saves an inline edit | Validates name, type, and currency; overwrites cols 2–9 for the target row |
| `delete_account` (doPost) | User confirms deletion | Deletes the row by sheet row number |

Balance adjustments (`adjustAccountBalance`) are performed inside the transaction create, update, and delete handlers — not via a dedicated account endpoint.

---

## Notes

- `state.accountMap` is a `{ id → account }` lookup rebuilt whenever accounts are refreshed. It is used by the transactions section to resolve account names in the table and form dropdowns.
- After any create, update, or delete, the full account list is re-fetched from the backend to keep `state.accounts` and `state.accountMap` in sync.
- Archived accounts remain in the sheet and in `state.accounts`. They are filtered out of the transaction form dropdowns but still appear in the accounts table.
- Only currencies present in the `rates` sheet appear in the currency dropdown. Adding a new currency requires adding a row to the `rates` sheet first.
