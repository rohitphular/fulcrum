# Transactions

## Overview

The core section of the app. Records every financial movement — money coming in, going out, or moving between accounts. Transactions are stored in the Google Sheet and drive the dashboard summaries, account balances, and all reporting.

Every transaction is linked to a `from_account` and optionally a `to_account` (for transfers). The `from_account`'s currency becomes the transaction currency; amounts in other currencies are converted to the quote currency using the exchange rates table.

---

## Data Model

Sheet: `transactions`

| Field | Type | Description |
|---|---|---|
| `id` | string | Auto-generated identifier in the format `YYYY-MM-DD-NNN` (date + sequential counter per day) |
| `transaction_date_utc` | UTC ISO datetime | Date and time of the transaction, stored as UTC, displayed in local time |
| `transaction_type` | string | One of `money-in`, `money-out`, `money-transfer` |
| `amount` | number | Transaction amount in the `from_account`'s currency; must be positive |
| `currency` | string | ISO 4217 currency code — derived from the `from_account` at save time |
| `from_account` | string | Account ID of the source or primary account |
| `to_account` | string | Account ID of the destination account — populated for `money-transfer` only |
| `major_category` | string | Top-level category selected from the categories list |
| `minor_category` | string | Sub-category within the major, selected from the categories list |
| `counterparty` | string | Optional — merchant, employer, or other party name (e.g. `Tesco`) |
| `notes` | string | Optional free-text notes |
| `tags` | string | Semicolon-separated tags; entered as comma-separated in the UI, stored as `;` separated |
| `transfer_id` | string | Reserved for future transfer grouping — not populated by the UI |
| `fx_rate` | number | Optional row-level FX rate used when transferring between accounts of different currencies |
| `country` | string | Optional — country where the transaction occurred (e.g. `UK`, `India`) |
| `payment_method` | string | Reserved for future use — not populated by the UI |

---

## Transaction Types

| Type | Meaning | Account behaviour |
|---|---|---|
| `money-in` | Money arriving into an account | `from_account` balance increases |
| `money-out` | Money leaving an account | `from_account` balance decreases |
| `money-transfer` | Movement between two of your own accounts | `from_account` decreases; `to_account` increases |

---

## Features

- Add new transactions via a collapsible form at the top of the section
- View all transactions in a paginated, sortable table filtered by the active date range
- Inline edit any transaction — all fields editable including type, account, category, and date
- Delete any transaction with an inline confirmation; account balances are adjusted automatically
- Filter panel with eight independent filter dimensions
- Active filters displayed as removable chips below the filter bar
- Export all visible (date-range-filtered) transactions to CSV or JSON
- Warning indicator for malformed rows (missing ID, date, or invalid type) — collapsed by default
- Quote-currency column showing each amount converted to GBP using current exchange rates

---

## User Interactions

| Action | How |
|---|---|
| Add a transaction | Click **Add transaction** → fill the form → **Save** |
| Reset the add form | Click **Clear** in the add form |
| Edit a transaction | Click **Edit** on a row → inline form → **Save** |
| Delete a transaction | Click **Delete** → inline confirmation → **Yes, delete** |
| Sort the table | Click any sortable column header; click again to reverse direction |
| Navigate pages | Click **← Prev** / **Next →** below the table |
| Filter transactions | Click **Filters** → set filter values → results update live |
| Remove one filter | Click **×** on the active filter chip |
| Clear all filters | Click **Clear all filters** in the filter panel |
| Export data | Click **Export CSV** or **Export JSON** |
| View malformed rows | Click the ⚠ warning banner at the top of the table |

---

## Add / Edit Form Fields

### money-in / money-out layout

Row 1: Type | Major category | Minor category | Account  
Row 2: Date | Counterparty | Amount | Country  
Row 3: Tags (span 2) | Notes (span 2)

The primary account field label changes based on type:

| Type | Account field label | Meaning |
|---|---|---|
| `money-in` | **To account \*** | Money flows INTO this account |
| `money-out` | **From account \*** | Money flows OUT OF this account |

The payload field name is `from_account` in both cases.

### money-transfer layout

Row 1: Type | From account | To account | FX rate (if cross-currency)  
Row 2: Date | Amount | Tags  
Row 3: Notes (full width)

Categorisation fields (Major category, Minor category, Counterparty, Country) are **hidden** for `money-transfer`.

### Field reference

| Field | Required | Notes |
|---|---|---|
| Type | Yes | Drives form layout and account dropdowns; changes reset major/minor selection |
| Major category | Yes (money-in/out) | Hidden for transfers; populated from categories filtered by type; cascading dropdown |
| Minor category | Yes (money-in/out) | Hidden for transfers; populated from categories filtered by type and major |
| Account (primary) | Yes | Active accounts only; determines the transaction currency; label is "To account" for money-in, "From account" for money-out |
| Date & time | Yes | `datetime-local` input; defaults to current local time; stored as UTC ISO |
| Amount | Yes | Must be positive; currency is derived from the from account |
| Counterparty | No (money-in/out) | Hidden for transfers; free text — merchant, employer, or other party |
| Country | No (money-in/out) | Hidden for transfers; free text — country where the transaction took place |
| Tags | No | Present for all types |
| Notes | No | Free text; present for all types |
| To account | For transfers only | Shown only when type is `money-transfer`; excludes the from account |
| FX rate | Optional, transfers only | Shown only when from and to accounts have different currencies; entering a rate is required (Rule 6 hard-blocks cross-currency transfers without one) |

---

## Category Dropdowns (Progressive)

The major and minor category dropdowns are progressive — they depend on the type selection:

1. Type selected → major category enabled, populated with all majors for that type
2. Major selected → minor category populated with minors for that type + major
3. Changing type resets both major and minor

The same cascade applies in the inline edit form.

---

## Table Columns

| Column | Sortable | Notes |
|---|---|---|
| Date | Yes | Displays in local time; sorted by UTC timestamp |
| Type | Yes | Shown as a coloured badge: `in` / `out` / `xfer` |
| Account | Yes | From account name; transfers show `From → To` |
| Amount | No | Native currency with symbol |
| ≈ GBP | No | Converted to quote currency; `†` marker when a row-level FX rate was used; `?` badge when the currency is missing from the rates table |
| Category | Yes | Shown as `Major → Minor` |
| Counterparty | Yes | — |
| Country | No | — |
| Actions | No | Edit, Delete |

Default sort: Date descending.

---

## Filters

The filter panel is collapsible. All filters operate on the date-range-filtered set and combine with AND logic. The badge on the **Filters** button shows how many are active.

| Filter | Type | Behaviour |
|---|---|---|
| Type | Multi-select checkboxes | Shows only selected transaction types |
| Account | Dropdown | Shows only transactions involving the selected account |
| Major category | Dropdown | Shows only transactions with the selected major category |
| Minor category | Dropdown | Shows only transactions with the selected minor category |
| Country | Text input | Matches against the country field |
| Method | Dropdown | Matches the `payment_method` field (reserved — not yet populated) |
| Tag | Text input | Matches any tag in the `tags` field |
| Search | Text input | Searches counterparty and notes fields |

Active filters are shown as chips below the filter bar. Each chip has a × button to remove that single filter without opening the panel.

---

## FX Rate Handling

- **Row-level FX rate (`fx_rate`):** Stored on the transaction when a transfer is made between accounts of different currencies. Used in the ≈ GBP column and marked with a `†` dagger.
- **Global rate (`state.rateMap`):** Used for all other transactions and as a fallback when `fx_rate` is blank.
- **Missing rate badge (`?`):** Shown next to the amount when the transaction's currency is not present in the rates table.
- For `money-transfer` between accounts with different currencies, the to account receives `amount × fx_rate`. If no FX rate is entered, the amount is applied 1:1.

---

## Related Documentation

- **Balance adjustment mechanics** (how balances change on Add/Edit/Delete, two-phase edit, Standard Reload): `transaction-lifecycle.md`
- **Validation rules** (data integrity checks, financial hard blocks, post-reversal balance formula): `transaction-validations.md`
- **Per-category reference** (full Add/Edit/Delete specification for all 101 seed categories): `transaction-rules.md`

---

## Backend API

| Action | Trigger | Behaviour |
|---|---|---|
| `list_transactions` (doGet) | App startup | Returns all rows from the transactions sheet |
| `create_transaction` (doPost) | User saves a new transaction | Validates required fields; appends a new row; adjusts from/to account balances |
| `update_transaction` (doPost) | User saves an inline edit | Reverses old balance effects, applies new ones; overwrites cols 2–16 for the target row |
| `delete_transaction` (doPost) | User confirms deletion | Reverses balance effects; deletes the row by sheet row number |

---

## Notes

- The transaction list is filtered client-side by the active date range before the table is rendered. The filter panel applies on top of the date-filtered set.
- Pagination resets to page 1 whenever a filter changes.
- The add form resets to closed state after a successful save.
- Malformed rows (missing `id`, `transaction_date_utc`, or invalid `transaction_type`) are separated from the valid table into a collapsible warning section. They are not counted in summaries or dashboard totals.
