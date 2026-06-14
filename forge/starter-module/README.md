# Starter Module

A minimal CRUD template backed by Google Sheets. Form to add items, table to edit and delete them. Use this as the scaffold for every new forge module.

---

## What you need to do

### Step 1 — Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet.
2. Rename the default sheet tab to **`starter`** (right-click the tab → Rename).
3. Add the header row in row 1 — type each header in its own cell:

   | A | B | C | D | E | F |
   |---|---|---|---|---|---|
   | `id` | `name` | `description` | `status` | `created_at` | `updated_at` |

   Exact column order and names matter. Do not add spaces or change capitalisation.

4. Keep the sheet in plain text format — do not apply date formatting, number formatting, or merged cells to any column.

---

### Step 2 — Set up Apps Script

1. In your spreadsheet, go to **Extensions → Apps Script**.
2. Delete the default `myFunction` code in `Code.gs`.
3. Copy the entire contents of `backend/Code.gs` from this repo and paste it in.
4. Click **Save** (the floppy disk icon or Ctrl+S).

---

### Step 3 — Set your PIN

1. In Apps Script, go to **Project Settings** (the gear icon on the left).
2. Scroll to **Script Properties** → click **Add script property**.
3. Property name: `PIN`
4. Value: your chosen PIN (any string — numbers recommended, e.g. `482917`).
5. Click **Save script properties**.

The PIN is stored inside Google's infrastructure, not in any file. Do not put it in `config.js` or any committed file.

---

### Step 4 — Deploy as a Web App

1. In Apps Script, click **Deploy → New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Set:
   - **Description:** `starter-module v1` (or anything)
   - **Execute as:** `Me`
   - **Who has access:** `Anyone`
4. Click **Deploy**.
5. Copy the **Web app URL** — it looks like:
   `https://script.google.com/macros/s/AKfycb.../exec`

---

### Step 5 — Configure the app

1. Copy `config.example.js` to `config.js` in this folder.
2. Open `config.js` and replace `YOUR_DEPLOYMENT_ID` with the URL you copied above.
3. `config.js` is gitignored — it will not be committed.

---

### Step 6 — Open the app

Open `index.html` in a browser (or serve from GitHub Pages).

- If `config.js` is missing, a setup banner appears.
- If `config.js` is present, a PIN prompt appears. Enter the PIN you set in Step 3.
- The PIN is stored in `sessionStorage` — it clears when the browser tab closes.

---

## How to re-deploy after changing Code.gs

Apps Script deployments are immutable snapshots. After editing `Code.gs`:

1. Go to **Deploy → Manage deployments**.
2. Click the pencil (Edit) icon on your deployment.
3. Change the version to **New version**.
4. Click **Deploy**.

The URL stays the same — no change needed in `config.js`.

---

## Using this as a template for a new module

Copy this entire folder to `forge/<new-module-name>/`. Then:

| What to change | Where |
|---|---|
| Sheet tab name | `const SHEET_NAME` in `backend/Code.gs` |
| Column definitions | `const COLUMNS` + `createRow()` + `updateRow()` in `Code.gs` |
| Form fields | The `<form>` block in `index.html` |
| Table columns | The `<thead>` and `renderTable()` function in `index.html` |
| Page title / header copy | `<title>`, `.eyebrow`, `<h1>`, `.sub` in `index.html` |

Do **not** change:
- `../_shared/sheets-client.js` — shared, module-agnostic
- `../_shared/style-tokens.css` — shared design tokens
- The PIN gate logic in `index.html`
- The `config.js` / `config.example.js` pattern

---

## File structure

```
forge/
  _shared/
    sheets-client.js      ← shared HTTP layer (do not modify per-module)
    style-tokens.css      ← shared design tokens (do not modify per-module)
  starter-module/
    index.html            ← the app
    config.example.js     ← committed template
    config.js             ← gitignored — your actual Script URL
    backend/
      Code.gs             ← Apps Script source
      appsscript.json     ← Apps Script manifest
    README.md             ← this file
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
