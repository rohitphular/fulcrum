# Rates

## Overview

Manages the exchange rate table used to convert transaction amounts into the quote currency (GBP). All rates are expressed as **units of that currency per 1 GBP** (e.g. INR 105 means £1 = ₹105). GBP is the fixed base currency and is always read-only.

The rates table is loaded at app startup and referenced throughout the app wherever a base-currency equivalent is computed — dashboard summaries, transaction table, account net worth.

---

## Data Model

Sheet: `rates`

| Field | Type | Description |
|---|---|---|
| `currency` | string | ISO 4217 currency code (e.g. `GBP`, `INR`, `USD`) |
| `symbol` | string | Display symbol (e.g. `£`, `₹`, `$`) |
| `rate` | number | Units of this currency per 1 GBP |
| `updated_at` | UTC ISO datetime | Timestamp of last update; stored as UTC, displayed in local time |

Default seed currencies on first load: GBP, INR, USD, EUR, AED.

---

## Features

- View all configured currencies with their current rate and symbol
- Edit the rate and symbol for any non-GBP currency inline
- GBP row is always displayed but cannot be edited (rate = 1 is the fixed base)
- Rates persist to the Google Sheet and survive page reloads
- Keyboard shortcuts: `Enter` to save, `Escape` to cancel while editing

---

## User Interactions

| Action | How |
|---|---|
| Edit a rate | Click **Edit** on any non-GBP row — inline form appears (rate field only) |
| Save changes | Click **Save** or press `Enter` |
| Discard changes | Click **Cancel** or press `Escape` |
| Add a new currency | Not supported via UI — add a row directly in the sheet, then edit the rate here |

---

## Business Rules / Validations

- **GBP is read-only.** No edit button is rendered for the GBP row.
- **Rate must be > 0.** A zero or negative rate is rejected with a warning.
- **Upsert semantics.** If the currency already exists in the sheet the row is updated; otherwise a new row is appended. This means editing a rate never duplicates it.
- **Symbol is read-only in the UI.** The symbol column is displayed but cannot be edited through the app. To change a currency symbol, update the `symbol` cell directly in the `rates` sheet.
- **Symbol is optional.** If blank, the currency code is used as a fallback display prefix.
- **Missing rate warning.** If a transaction references a currency not present in the rates table, a `?` badge is shown on that transaction row in the transactions section.

---

## Backend API

| Action | Trigger | Behaviour |
|---|---|---|
| `list_rates` (doGet) | App startup | Returns all rows from the `rates` sheet; seeds defaults if the sheet is empty |
| `upsert_rate` (doPost) | User saves an edit | Updates `rate`, `symbol`, and `updated_at` for the matching currency row; appends if not found |

---

## Notes

- The `rateMap` in `state` (`{ GBP: 1, INR: 105, … }`) is built from the rates response at startup and used by `toBase()` for all currency conversions across the app.
- Changing a rate takes effect immediately in the UI — `state.rateMap` is updated in memory without a full reload.
- Rates are not historical. The single stored rate is applied to all transactions regardless of when they occurred.
