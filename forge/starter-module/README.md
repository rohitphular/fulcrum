# Starter Module

A minimal CRUD template backed by Google Sheets. This is the canonical scaffold for every new Forge app. When creating a new app, copy this folder and follow the instructions below exactly.

---

## File structure

```
forge/
  _shared/                        ← shared across ALL apps — never modify per-app
    auth.js                       ← createAuthModule() factory (session, PIN gate, TOTP)
    ui.js                         ← showLoading, hideLoading, showMsg
    utils.js                      ← el, esc, fmtDate, date helpers, currency helpers (pure)
    sheets-client.js              ← HTTP layer for Apps Script (GET/POST)
    style-tokens.css              ← design tokens (colours, fonts, spacing)

  <app-name>/
    app/
      index.html                  ← app shell (PIN overlay + appShell div + script tags)
      main.js                     ← ES module entry point
      config.js                   ← window.CONFIG = { SCRIPT_URL: '...' }  (create manually)
      core/
        state.js                  ← export const state = { ... }
        utils.js                  ← re-exports from _shared/utils.js + state-bound wrappers
        ui.js                     ← re-exports from _shared/ui.js
        auth.js                   ← createAuthModule() config (6 lines)
        api.js                    ← AppNameAPI — thin SheetsClient wrappers
      sections/
        items.js                  ← renderItems(), form/delete handlers (rename per domain)
      style/
        <app-name>.css            ← app-specific styles
    backend/
      Code.js                     ← Google Apps Script source
      appsscript.json             ← GAS runtime manifest
      .clasp.json                 ← committed with ${SCRIPT_ID_PLACEHOLDER}; deploy script swaps in the real scriptId at runtime
      README.md                   ← clasp workflow reference
    cicd/
      envs.json                   ← single source of truth for per-env scriptId / deploymentId / script_url
      script-deployment.sh        ← backend deploy: clasp push + clasp deploy (no git)
      README.md                   ← deploy pipeline + first-time setup
    dev-tasks/                    ← local scratch space (not committed)
    README.md                     ← this file
```

---

## Naming conventions — MUST follow for every new app

Every app has a short prefix (e.g. `sm` for starter-module, `et` for expense-tracker). Choose a unique 2–3 letter prefix for every new app and apply it consistently:

| Thing | Pattern | Example |
|---|---|---|
| Session key | `<prefix>_session` | `sm_session` |
| Theme key | `<prefix>_theme` | `sm_theme` |
| Reload event | `<prefix>:reload` | `sm:reload` |
| API object name | `<PascalPrefix>API` | `StarterAPI` |

---

## DOM contract — element IDs required by `_shared/`

The following IDs **must** exist in `index.html` exactly as listed. The shared modules reference them by ID and will break silently if they are missing or renamed.

| Element ID | Used by | Purpose |
|---|---|---|
| `pinOverlay` | `_shared/auth.js` | Full-page PIN gate overlay |
| `appShell` | `_shared/auth.js` | Main app content wrapper (hidden until auth) |
| `pinInput` | `_shared/auth.js` | PIN password input |
| `totpInput` | `_shared/auth.js` | TOTP 6-digit input |
| `pinSubmit` | `_shared/auth.js` | Unlock button |
| `pinError` | `_shared/auth.js` | Error message element |
| `msgBanner` | `_shared/ui.js` | Status message banner |
| `msgText` | `_shared/ui.js` | Banner message text |
| `msgIco` | `_shared/ui.js` | Banner icon (`›` / `!`) |
| `setupBanner` | `main.js` | Shown when `config.js` is missing |
| `themeToggle` | `main.js` | `☽` / `☀` theme toggle button |

`appShell` must start with the `hidden` class. `pinOverlay` must start visible (no `hidden` class).

---

## How to create a new app from this template

### Step 1 — Copy the folder

```bash
cp -r forge/starter-module forge/<new-app-name>
```

### Step 2 — Choose your prefix

Pick a unique 2–3 letter prefix. Example: for `budget-planner`, use `bp`.

### Step 3 — Rename files

```bash
mv app/style/starter-module.css  app/style/<new-app-name>.css
```

### Step 4 — Update `app/core/auth.js`

This is the only auth configuration needed. Replace all four values:

```js
import { createAuthModule } from '../../../_shared/auth.js';
import { <NewApp>API } from './api.js';

export const { writeSession, readSession, clearSession, showPinGate, hidePinGate, submitPin } =
  createAuthModule({
    sessionKey:  '<prefix>_session',
    legacyKeys:  [],
    verifyFn:    totp => <NewApp>API.verify(totp),
    reloadEvent: '<prefix>:reload',
  });
```

### Step 5 — Update `app/core/api.js`

Rename `StarterAPI` to `<NewApp>API`. Add/remove methods to match your GAS backend actions:

```js
/* global SheetsClient */
export const <NewApp>API = {
  verify: totp => SheetsClient.verify(totp),
  list:   ()   => SheetsClient.list(),
  create: f    => SheetsClient.create(f),
  update: (id, fields) => SheetsClient.update(id, fields),
  remove: id   => SheetsClient.remove(id),
};
```

### Step 6 — Update `app/core/state.js`

Replace `items`, `editingId`, `deletingId` with whatever your app needs:

```js
export const state = {
  items:      [],
  editingId:  null,
  deletingId: null,
};
```

### Step 7 — Update `app/core/utils.js`

For a simple app with no currency conversion, just re-export the shared primitives:

```js
export { el, esc, fmtDate } from '../../../_shared/utils.js';
```

If you need date input helpers, add:

```js
export { el, esc, fmtDate, parseLocalDate, toDateInputVal, todayISO } from '../../../_shared/utils.js';
```

### Step 8 — Update `app/core/ui.js`

No changes needed — always a one-liner:

```js
export { showLoading, hideLoading, showMsg } from '../../../_shared/ui.js';
```

### Step 9 — Rewrite `app/sections/items.js`

Rename the file to match your domain (e.g. `transactions.js`, `debts.js`). Update:
- `state.items` → your state field name
- `StarterAPI.*` → your `<NewApp>API.*` calls
- `renderItems()` → `render<Domain>()`
- The `sm:reload` event → `<prefix>:reload`
- The HTML table columns and form fields to match your schema

### Step 10 — Rewrite `app/main.js`

Key things to update:
- All imports (API name, section exports, auth exports)
- `sm:reload` → `<prefix>:reload` in `document.addEventListener`
- `sm_theme` → `<prefix>_theme` in `setTheme()` and `init()`
- `loadItems()` → `load<Domain>()`
- Table column count in the empty-state `colspan`

### Step 11 — Update `app/index.html`

- `<title>` — app name
- `.pin-eyebrow` text — `forge · <new-app-name>`
- `<h1>` — app name
- `<p class="sub">` — one-line description
- `<link>` for CSS — update to `style/<new-app-name>.css`
- Form fields — replace the Name/Description/Status fields with your schema
- Table `<thead>` — update column headers
- Keep all element IDs from the DOM contract above unchanged

### Step 12 — Rewrite `backend/Code.js`

Update:
- `SHEET_NAME` — name of your data tab in Google Sheets
- `COLUMNS` — array of column names matching your schema
- `createRow(p)` — build the row array from POST params
- `updateRow(row, p)` — apply edits to an existing row
- Keep `getSheet()`, `verify()`, `handleGet()`, `handlePost()`, `doGet()`, `doPost()` unchanged — they are the standard GAS plumbing

### Step 13 — Update `cicd/script-deployment.sh`

- `MSG` default — change `starter-module: code pushed` to `<new-app-name>: code pushed`
- Any `echo` strings that reference the app name — swap in `<new-app-name>`

The script reads `scriptId` and `deploymentId` from `cicd/envs.json` — no IDs are hardcoded inside the script.

### Step 14 — Populate `cicd/envs.json`

```json
{
  "_comment": "Single source of truth for dev + prod environment IDs.",
  "dev":  { "script_id": "TODO", "deployment_id": "TODO", "script_url": "TODO" },
  "prod": { "script_id": "TODO", "deployment_id": "TODO", "script_url": "TODO" }
}
```

Fill in the dev block once the new app's dev GAS project is created (see `cicd/README.md § First-time setup`).

### Step 15 — Update `app/config.js`

`config.js` is committed. It picks the backend `/exec` URL by hostname at runtime — no per-deploy mutation needed.

```js
window.CONFIG = (() => {
  const isHosted = location.hostname.endsWith('.github.io');
  const DEV_SCRIPT_URL  = 'https://script.google.com/macros/s/YOUR_DEV_DEPLOYMENT_ID/exec';
  const PROD_SCRIPT_URL = 'TODO';
  return {
    SCRIPT_URL: isHosted ? PROD_SCRIPT_URL : DEV_SCRIPT_URL,
  };
})();
```

Paste your dev `/exec` URL into `DEV_SCRIPT_URL` once you've created the deployment. Fill in `PROD_SCRIPT_URL` when prod is set up.

---

## What NOT to change

- `app/core/ui.js` — always a one-liner re-export
- Element IDs in the DOM contract table — shared modules depend on them
- `_shared/` files — shared across all apps; changes here affect every app
- The `<script>` load order in `index.html`:
  1. `sheets-client.js` (plain `<script>`)
  2. `config.js` (plain `<script>`, with `onerror`)
  3. Optional third-party libs (e.g. Chart.js)
  4. `main.js` (`<script type="module">`) — always last

---

## Shared module contracts

### `_shared/auth.js` — `createAuthModule(config)`

```js
createAuthModule({
  sessionKey:  string,      // e.g. 'sm_session' — unique per app
  legacyKeys:  string[],    // old session keys to clear on login (usually [])
  verifyFn:    async (totp) => { ok, error? },  // calls your API verify
  reloadEvent: string,      // e.g. 'sm:reload' — dispatched after successful login
})
```

Returns: `{ writeSession, readSession, clearSession, showPinGate, hidePinGate, submitPin, fetchGeo }`

Session TTL is 6 hours. Session clears on tab close. Page refresh preserves the session.

### `_shared/utils.js` — pure functions

```js
el(id)                                          // document.getElementById shorthand
esc(s)                                          // HTML-escape a string
fmtDate(v)                                      // format ISO date → "12 Jun 2026"
parseLocalDate(s)                               // YYYY-MM-DD → local Date (no UTC shift)
toDateInputVal(v)                               // ISO string → 'YYYY-MM-DD' for <input type="date">
todayISO()                                      // local today as 'YYYY-MM-DD'
getSymbol(currency, rates)                      // currency symbol from rates array
toBase(amount, from, rowFxRate, rateMap, quote) // convert to quote currency
toQuote(amount, from, rateMap, quote)           // convert to quote currency (no fx override)
fmtBase(amount, from, fxRate, rateMap, quote, rates) // formatted quote-currency string
fmtNative(amount, currency, rates)             // formatted native-currency string
fmtAmount(amount, currency, symbolMap)         // formatted amount with symbol map
exportData(format, rows, filename, cols)        // download JSON or CSV
```

Currency functions are pure — caller passes `state.rateMap`, `state.quoteCurrency`, `state.rates` explicitly.

### `_shared/ui.js`

```js
showLoading()             // show full-screen overlay with spinner (injected into body on first call)
hideLoading()             // hide overlay — always call in finally {}
showMsg(text, type?)      // show banner; type = 'success' (default) | 'warn'; auto-hides after 4.5s
```

The overlay (`#loadingOverlay`) is created dynamically — it does NOT need a `<div>` in `index.html`. Its CSS lives in `_shared/style-tokens.css`.

---

## Security — IP lockout and audit log

Every request is logged to the `audit_access` sheet tab (created automatically on first request).

| Column | Description |
|---|---|
| `ip` | IP address |
| `city` / `country` | From browser-side geo lookup |
| `user_agent` | Browser string |
| `first_seen` / `last_seen` | Timestamps |
| `total_attempts` / `success_count` / `failure_count` | Request counts |
| `is_locked` | `TRUE` after 3 failed PIN attempts |
| `locked_at` | Timestamp of lockout |

To unlock: open the sheet, set `is_locked` to `FALSE`. To reset counts, delete the row.

---

## Data schema — `starter` tab

| Column | Type | Set by |
|---|---|---|
| `id` | UUID string | Apps Script on create |
| `name` | text | user |
| `description` | text | user |
| `status` | `active` or `inactive` | user |
| `created_at` | ISO 8601 UTC | Apps Script on create |
| `updated_at` | ISO 8601 UTC | Apps Script on every write |

When building a new app, replace this table with your own schema.

---

## Backend conventions (`backend/Code.js`)

- `SHEET_NAME` — the Google Sheets tab name for your data
- `COLUMNS` — defines the header row; `getSheet()` auto-adds any missing columns on every call (safe to extend after deployment)
- `createRow(p)` — builds a new row array from POST params
- `updateRow(row, p)` — applies edits in place; only modify the columns you want editable
- `verify(p)` — validates PIN + TOTP; do not modify
- `doGet(e)` / `doPost(e)` — GAS entry points; route to `handleGet`/`handlePost`; do not modify

---

## Setup and deployment

See `cicd/README.md` for the full first-time setup (Google Sheet, Apps Script, secrets, Web App deployment) and ongoing deployment instructions.

See `backend/README.md` for the clasp workflow when iterating on the backend.
