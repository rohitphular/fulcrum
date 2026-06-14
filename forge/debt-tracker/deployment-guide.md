# Debt Tracker — Deployment Guide

## Prerequisites

| What | Why |
|---|---|
| Google account | Hosts the spreadsheet and Apps Script |
| Google Sheets spreadsheet | The database — one dedicated sheet is clearest |
| TOTP authenticator app | Google Authenticator, Authy, or any RFC 6238-compatible app |
| Browser | Any modern browser; `file://` works — no server required |

---

## First-time deployment

### Step 1 — Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet.
2. Name it something recognisable, e.g. `Fulcrum — Debt Tracker`.
3. The four data tabs (`debts`, `payments`, `rates`, `audit_access`) are created **automatically** on first use — you do not need to create them manually.

---

### Step 2 — Add the Apps Script backend

1. Inside the spreadsheet: **Extensions → Apps Script**.
2. Replace the default `Code.gs` content with the contents of `backend/Code.gs` from this repo.
3. Rename the project if desired (top-left, next to "Apps Script").

**Set the runtime to V8:**
- **Project Settings** (gear icon, left sidebar) → check **"Show `appsscript.json`"**
- Back in the editor, open `appsscript.json` and replace its contents with:

```json
{
  "timeZone": "Europe/London",
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  }
}
```

> Adjust `timeZone` to your local zone if needed (e.g. `"Asia/Kolkata"`).

---

### Step 3 — Generate a TOTP secret

You need a Base32-encoded secret that both the backend and your authenticator app share.

**Generate one with Python (run locally):**
```bash
python3 -c "import base64, os; print(base64.b32encode(os.urandom(20)).decode())"
```

Example output: `JBSWY3DPEHPK3PXP`

Keep this value — you will need it in both the next step and your authenticator app.

---

### Step 4 — Set Script Properties (secrets)

In the Apps Script editor:
1. **Project Settings** (gear icon) → **Script Properties** → **Add script property** (twice):

| Property | Value |
|---|---|
| `PIN_SECRET` | Your chosen PIN (any string — numeric PINs work well, e.g. `123456`) |
| `TOTP_SECRET` | The Base32 secret from Step 3 |

These are stored server-side and never exposed to the browser.

---

### Step 5 — Deploy as Web App

1. **Deploy → New deployment**
2. Click the gear icon next to "Select type" → choose **Web app**
3. Set:
   - **Description**: `v1` (or any label)
   - **Execute as**: `Me`
   - **Who has access**: `Anyone`
4. Click **Deploy** → authorise when prompted (you are granting the script access to your own spreadsheet)
5. Copy the **Web App URL** — it looks like:
   ```
   https://script.google.com/macros/s/AKfycb.../exec
   ```

---

### Step 6 — Add your TOTP account to the authenticator app

In Google Authenticator (or Authy):
1. **Add account → Enter a setup key**
2. Account name: `Debt Tracker` (or anything)
3. Key: paste the Base32 secret from Step 3
4. Type: **Time-based**

Verify it generates 6-digit codes before continuing.

---

### Step 7 — Configure the frontend

In the `app/` directory:
```bash
cp config.example.js config.js
```

Edit `config.js` and paste your Web App URL:
```js
window.CONFIG = {
  SCRIPT_URL: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec'
};
```

---

### Step 8 — Open the app

Open `app/index.html` directly in a browser (`File → Open`, or drag it in).

- Enter your PIN and the current 6-digit TOTP code → **Unlock**
- Exchange rates are seeded automatically on first load
- All four data tabs are created in the spreadsheet on the first request

---

## Subsequent deployments

### Frontend changes (HTML / CSS / JS)

No deployment step needed. Edit the files and refresh the browser — changes take effect immediately since the frontend runs locally.

### Backend changes (Code.gs)

Any edit to `Code.gs` requires a **new deployment version** for the changes to take effect. The existing deployment URL does not automatically pick up edits.

1. Make your changes in the Apps Script editor
2. **Deploy → Manage deployments**
3. Click the **pencil (edit) icon** on the existing deployment
4. Change **Version** from the current version to **New version**
5. Add a description (e.g. `v2 — fix rate upsert`) and click **Deploy**

> The URL stays the same — `config.js` does not need to change.

---

## Operations reference

### Unlock a locked IP

After 3 consecutive failed PIN attempts, an IP is permanently locked.

To unlock:
1. Open the Google Sheet → select the `audit_access` tab
2. Find the row where `ip` matches the locked address
3. Set `is_locked` to `FALSE` (clear the cell or type FALSE)

The next login attempt from that IP will be allowed.

### Reset a forgotten PIN

1. Apps Script editor → **Project Settings → Script Properties**
2. Update `PIN_SECRET` to a new value
3. No redeployment needed — Script Properties are read at request time

### Reset TOTP (lost authenticator)

1. Generate a new Base32 secret (Step 3 above)
2. Update `TOTP_SECRET` in Script Properties
3. Add the new secret to your authenticator app (Step 6 above)
4. No redeployment needed

### Move to a different Google account

1. Share the spreadsheet with the new account (Editor access)
2. Open Apps Script → share the project with the new account
3. Log in as the new account, open the script, and redeploy (the `Execute as: Me` binding changes to the new account)
4. Update `config.js` with the new deployment URL

---

## File reference

```
forge/debt-tracker/
  app/
    index.html              Main app entry point — open this in a browser
    debt-tracker.js         All frontend logic
    debt-tracker.css        Styles
    config.example.js       Template — copy to config.js and fill in SCRIPT_URL
    config.js               Your local config (not committed)
  backend/
    Code.gs                 Apps Script backend — paste into the Apps Script editor
    appsscript.json         Runtime settings — paste into the editor's appsscript.json
  deployment-guide.md       This file
```
