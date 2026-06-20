# Categories

## Overview

Manages the two-level category taxonomy used to classify transactions. Every transaction requires a **major category** and a **minor category**, both scoped to a transaction type (`money-in`, `money-out`, `money-transfer`). Categories are loaded at app startup and drive the dropdowns in the add/edit transaction form.

The category list is seeded automatically on first use — the backend appends a comprehensive default set if the sheet is empty.

---

## Data Model

Sheet: `categories`

| Field | Type | Description |
|---|---|---|
| `transaction_type` | string | One of `money-in`, `money-out`, `money-transfer` |
| `major_category` | string | Top-level grouping (e.g. `Food`, `Housing`, `Salary`) |
| `minor_category` | string | Sub-classification within the major (e.g. `Groceries`, `Rent`) |
| `description` | string | Optional free-text explanation of what this category covers |
| `tag_keywords` | string | Comma-separated hints for future auto-classification (e.g. `tesco, sainsbury, lidl`) |

---

## Features

- View all categories, filterable by transaction type
- Add new major/minor pairs for any transaction type
- Edit any existing category row inline (type, major, minor, keywords)
- Delete a category with an inline confirmation step
- Type filter bar shows a live count of matching categories
- Categories seed automatically from a built-in list on first load if the sheet is empty

---

## User Interactions

| Action | How |
|---|---|
| Filter by type | Click **All**, **money-in**, **money-out**, or **money-transfer** in the filter bar |
| Add a category | Click **+ Add category** → fill type, major, minor, keywords → **Save** |
| Edit a category | Click **Edit** on a row → inline form → **Save** |
| Delete a category | Click **Delete** → inline confirmation → **Yes, delete** |
| Cancel any action | Click **Cancel** or **× Close** |

---

## Business Rules / Validations

- **Major and minor category are both required.** Saving without either field populated is blocked with an inline error.
- **Transaction type is required.** Defaults to `money-in` in the add form; always a dropdown, never free text.
- **Description is optional.** Free text stored as-is; no normalisation applied.
- **Keywords are optional.** They are stored as a comma-separated string and normalised to lowercase on the backend.
- **No uniqueness enforcement.** Duplicate major/minor combinations for the same type are not blocked — the user is responsible for keeping the list clean.
- **Deleting a category does not affect existing transactions.** Transactions that referenced the deleted category retain their stored major/minor values; the category simply no longer appears in the transaction form dropdowns.
- **Filtering resets any open edit or delete row.** Switching the type filter collapses any in-progress inline action.

---

## Backend API

| Action | Trigger | Behaviour |
|---|---|---|
| `list_categories` (doGet) | App startup | Returns all rows; seeds the default category list if the sheet is empty |
| `create_category` (doPost) | User saves a new category | Validates type and required fields; appends a new row |
| `update_category` (doPost) | User saves an inline edit | Validates type and required fields; overwrites cols 1–4 for the target row |
| `delete_category` (doPost) | User confirms deletion | Deletes the row by sheet row number |

---

## Notes

- Categories are consumed by the transactions section to populate the major/minor dropdowns in the add and edit forms. The dropdown is progressive: major populates based on type, minor populates based on major.
- The `tag_keywords` field is stored but not yet used for auto-classification in the UI — it is reserved for a future auto-suggest feature.
- After any create, update, or delete, the full category list is re-fetched from the backend to keep `state.categories` in sync.
- The type filter state (`state.catFilter`) persists within the session — navigating away and back to this section remembers the last selected filter.
