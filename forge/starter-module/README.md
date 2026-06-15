# Starter Module

A minimal CRUD template backed by Google Sheets. Form to add items, table to edit and delete them. Use this as the scaffold for every new forge module.

---

## Shared dependencies

This module relies on two shared files from `forge/_shared/`:

| File | Purpose |
|---|---|
| `sheets-client.js` | Shared HTTP layer — handles all GET/POST calls to Apps Script. Do not modify per-module. |
| `style-tokens.css` | Shared design tokens (colours, fonts). Do not modify per-module. |

These are referenced via relative paths (`../../_shared/`) from `app/index.html`.

---

## Setup & deployment

See **[deployment-guide.md](deployment-guide.md)** for the full step-by-step setup — creating the Sheet, configuring Apps Script, setting secrets, deploying the Web App, and operations reference.

---

## Security — IP lockout and audit log

Every request (success or failure) is logged to the `audit_access` sheet tab (created automatically). One row per unique IP address, updated in place on every request.

### audit_access schema

| Column | Description |
|---|---|
| `ip` | IP address of the requester |
| `city` | City (from browser-side geolocation) |
| `country` | Country (from browser-side geolocation) |
| `user_agent` | Browser / device string |
| `first_seen` | Timestamp of first ever request from this IP |
| `last_seen` | Timestamp of most recent request |
| `total_attempts` | All requests combined (success + failure) |
| `success_count` | Successful PIN verifications |
| `failure_count` | Failed PIN attempts |
| `last_failed_at` | Timestamp of the last failed attempt |
| `is_locked` | `TRUE` once failure_count reaches 3 |
| `locked_at` | Timestamp when the IP was locked |

### Lockout behaviour

- After **3 failed PIN attempts** from the same IP, `is_locked` is set to `TRUE`.
- All further requests from that IP are rejected immediately — even with the correct PIN.
- The browser shows: *"Access locked. Contact admin to unlock."*

### How to unlock an IP

Open the `audit_access` sheet and set `is_locked` to `FALSE` for that row. Counts are preserved.
To reset everything for an IP, delete the row entirely.

---

## UI patterns — included in the template

These patterns ship ready-to-use in `index.html`. Do not remove them when building a new module — they are part of the standard forge UX contract.

### Dark mode

- A `☽` / `☀` theme button sits in the module header (top-right).
- Theme preference is persisted to `localStorage` under the key `forge_theme`.
- On init, the saved preference is restored; if none exists, the OS `prefers-color-scheme` value is used.
- The `<html>` element carries `data-theme="light"` or `data-theme="dark"`. All colours come from CSS custom properties defined in `style-tokens.css` — no hardcoded hex values in module CSS.
- Component-specific dark overrides (badges, cards, table borders, pin-card shadow) use `[data-theme="dark"] .classname` selectors.

### Loading bar

- A fixed 3 px bar runs across the very top of the page while any async operation is in flight.
- `showLoading()` removes the `.hidden` class; `hideLoading()` adds it back.
- Always call `hideLoading()` inside a `finally` block so the bar clears even on error.

```js
async function loadItems() {
  showLoading();
  try { … }
  catch (_) { … }
  finally { hideLoading(); }
}
```

### Schema migration (backend)

`getSheet()` in `backend/Code.gs` automatically adds any missing header columns to an existing sheet every time it is called. This means you can safely extend `COLUMNS` after the module is already deployed — new columns appear in the sheet header on the next request without any manual migration.

```js
// In Code.gs — already wired in the template
COLUMNS.forEach(col => {
  if (!headers.includes(col)) sheet.getRange(1, lastCol + ++added).setValue(col);
});
```

When you add a new column, also update `createRow()` to append the value and `updateRow()` to write it on edit.

---

### Date field helpers

If your module has `<input type="date">` fields, add these two helpers near the other date utilities in the module JS file:

```js
// Parse YYYY-MM-DD as a local date — avoids UTC midnight timezone shift
function parseLocalDate(s) {
  if (!s) return new Date(NaN);
  const parts = String(s).slice(0, 10).split('-').map(Number);
  return parts.length === 3 ? new Date(parts[0], parts[1] - 1, parts[2]) : new Date(NaN);
}

// Safe value attribute for <input type="date"> — handles both ISO strings and YYYY-MM-DD
function toDateInputVal(v) {
  if (!v) return '';
  const s = String(v).trim();
  return s.length >= 10 ? s.slice(0, 10) : '';
}
```

Use `parseLocalDate(p.date)` for comparisons and `toDateInputVal(item.date)` when pre-populating an edit form.

---

### Button disable during async operations

- The delete confirm button and the form submit button are disabled and relabelled while the request is in flight.
- This prevents double-submission and gives immediate feedback without a separate spinner.

```js
const btn = document.querySelector('[data-action="confirm-delete"]');
if (btn) { btn.disabled = true; btn.textContent = 'Deleting…'; }
```

Re-enable the button in the `catch` block if the operation fails (the success path re-renders the table, which replaces the button entirely).

---

## Using this as a template for a new module

Copy this entire folder to `forge/<new-module-name>/`. Then:

| What to change | Where |
|---|---|
| Sheet tab name | `const SHEET_NAME` in `backend/Code.gs` |
| Column definitions | `const COLUMNS` + `createRow()` + `updateRow()` in `Code.gs` |
| Form fields | The `<form>` block in `app/index.html` |
| Table columns | The `<thead>` and `renderTable()` function in `app/index.html` |
| Page title / header copy | `<title>`, `.pin-eyebrow`, `.eyebrow`, `<h1>`, `.sub` in `app/index.html` |
| JS/CSS filenames | Rename `starter-module.js` / `starter-module.css` and update the `<link>` / `<script>` tags in `index.html` |
| `localStorage` key for theme | `forge_theme` → `<module-name>_theme` in `setTheme()` and `init()` in the JS file |
| `sessionStorage` key for PIN | `forge_pin` → `<module-name>_pin` in `submitPin()` and `init()` in the JS file |

Do **not** change:
- `../_shared/sheets-client.js` — shared, module-agnostic
- `../_shared/style-tokens.css` — shared design tokens
- The PIN gate logic in `index.html`
- The `config.js` pattern (create it manually — no `config.example.js`)
- The loading bar, `setTheme()`, and button-disable patterns — these are the forge UX standard

---

## File structure

```
forge/
  .nojekyll                  ← disables Jekyll so _shared/ is served by GitHub Pages
  _shared/
    sheets-client.js         ← shared HTTP layer (do not modify per-module)
    style-tokens.css         ← shared design tokens (do not modify per-module)
  starter-module/
    app/
      index.html             ← the app
      starter-module.js      ← all module logic
      starter-module.css     ← module-specific styles
      config.js              ← your Script URL (create manually — see Step 5)
    backend/
      Code.gs                ← Apps Script source
      appsscript.json        ← Apps Script manifest
    README.md                ← this file
```

---

## Data schema — `starter` tab

| Column | Type | Set by |
|---|---|---|
| `id` | UUID string | Apps Script on create |
| `name` | text | user |
| `description` | text | user |
| `status` | `active` or `inactive` | user |
| `created_at` | ISO 8601 UTC string | Apps Script on create |
| `updated_at` | ISO 8601 UTC string | Apps Script on every write |
