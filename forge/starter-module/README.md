# Starter Module

A minimal CRUD template backed by Google Sheets. Form to add items, table to edit and delete them. Use this as the scaffold for every new forge module.

---

## Shared dependencies

This module relies on two shared files from `forge/_shared/`:

| File | Purpose |
|---|---|
| `sheets-client.js` | Shared HTTP layer — handles all GET/POST calls to Apps Script. Do not modify per-module. |
| `style-tokens.css` | Shared design tokens (colours, fonts). Do not modify per-module. |

These are referenced via relative paths (`../_shared/`) from `index.html`.

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

> The `audit_access` sheet tab is created **automatically** by Apps Script on the first request. You do not need to create it manually.

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
3. `config.js` is committed to the repo. The Apps Script URL alone gives no access — the PIN gate protects the data.

---

### Step 6 — Open the app

**Locally:**
Open `index.html` directly in a browser (`file://...` path works fine).

**Via GitHub Pages:**
```
https://<your-github-username>.github.io/<repo-name>/forge/starter-module/
```

- If `config.js` is missing, a setup banner appears.
- If `config.js` is present, a PIN prompt appears. Enter the PIN you set in Step 3.
- The PIN is stored in `sessionStorage` — it clears when the browser tab closes.

---

## Hosting on GitHub Pages

The repo is served via GitHub Pages from the `main` branch root.

**Important:** The `_shared/` folder starts with an underscore. Jekyll (GitHub Pages default processor) skips underscore directories. A `.nojekyll` file at the repo root disables Jekyll so `_shared/` is served correctly. Do not remove `.nojekyll`.

Steps to enable GitHub Pages on a new repo:
1. Make the repo public (free tier requirement).
2. Go to repo **Settings → Pages → Branch: `main`, folder: `/ (root)` → Save**.
3. Your module is live at `https://<username>.github.io/<repo>/forge/starter-module/`.

---

## How to re-deploy after changing Code.gs

Apps Script deployments are immutable snapshots. After editing `Code.gs`:

1. Go to **Deploy → Manage deployments**.
2. Click the pencil (Edit) icon on your deployment.
3. Change the version to **New version**.
4. Click **Deploy**.

The URL stays the same — no change needed in `config.js`.

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
  .nojekyll                  ← disables Jekyll so _shared/ is served by GitHub Pages
  _shared/
    sheets-client.js         ← shared HTTP layer (do not modify per-module)
    style-tokens.css         ← shared design tokens (do not modify per-module)
  starter-module/
    index.html               ← the app
    config.example.js        ← committed template
    config.js                ← your actual Script URL (committed — PIN protects data, not URL)
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
