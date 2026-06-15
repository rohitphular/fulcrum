# Starter Module — Deployment Guide

This guide covers first-time setup and ongoing maintenance. Use this as the reference when scaffolding any new Forge module.

---

## Prerequisites

- A Google account
- The `forge/_shared/` folder present in this repo (required by `app/index.html`)
- An authenticator app (Google Authenticator, Authy, or similar) on your phone

---

## First-time deployment

### Step 1 — Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet.
2. Name it anything — e.g. `Fulcrum — Starter Module`.
3. Leave it empty — both the `starter` and `audit_access` sheet tabs are created **automatically** by Apps Script on the first request.

---

### Step 2 — Set up Apps Script

1. In your spreadsheet, go to **Extensions → Apps Script**.
2. Delete the default `myFunction` code in `Code.gs`.
3. Copy the entire contents of `backend/Code.gs` from this repo and paste it in.
4. Click **Save** (the floppy disk icon or Ctrl+S).

**Update the Apps Script manifest (`appsscript.json`):**

5. In the Apps Script editor, go to **Project Settings** (gear icon on the left sidebar).
6. Tick **Show "appsscript.json" manifest file in editor**.
7. Click the `appsscript.json` file in the left panel.
8. Replace its entire contents with:

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

9. Click **Save**.

> Without the `"webapp"` block in the manifest, the deployment step will not offer the Web App option and the app will fail to connect. Adjust `timeZone` to your local zone if needed (e.g. `"Asia/Kolkata"`).

---

### Step 3 — Set your PIN and TOTP secret

1. In Apps Script, go to **Project Settings** (gear icon on the left sidebar).
2. Scroll to **Script Properties** → click **Add script property**.
3. Add two properties:

| Property name | Value |
|---|---|
| `PIN_SECRET` | Your chosen PIN (numbers recommended, e.g. `482917`) |
| `TOTP_SECRET` | A Base32 secret key — see below |

4. Click **Save script properties**.

**Generating a TOTP secret:**
- Go to [https://it-tools.tech/otp-generator](https://it-tools.tech/otp-generator) or any TOTP generator.
- Copy the Base32 secret (e.g. `JBSWY3DPEHPK3PXP`) — uppercase letters and digits 2–7.
- Paste it as the `TOTP_SECRET` value.

**Adding to your authenticator app:**
1. Open your authenticator app → tap **+** → **Enter a setup key**.
2. Account name: `Fulcrum Starter` (or anything you like).
3. Key: paste your `TOTP_SECRET` value.
4. Type: **Time based**.
5. Tap **Add**.

You will see a 6-digit code that refreshes every 30 seconds. Enter it alongside your PIN when signing in.

Both secrets are stored inside Google's infrastructure. Do not put them in `config.js` or any committed file.

---

### Step 4 — Deploy as a Web App

1. In Apps Script, click **Deploy → New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Set:
   - **Description:** `starter-module v1` (or anything)
   - **Execute as:** `Me`
   - **Who has access:** `Anyone`
4. Click **Deploy** — authorise when prompted (grants the script access to your spreadsheet).
5. Copy the **Web app URL** — it looks like:
   `https://script.google.com/macros/s/AKfycb.../exec`

The URL must end in `/exec` (not `/dev`).

---

### Step 5 — Configure the app

1. Create `app/config.js` with the following content:

```js
window.CONFIG = {
  SCRIPT_URL: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec'
};
```

2. Replace `YOUR_DEPLOYMENT_ID` with the Web App URL you copied above.
3. `config.js` is committed to the repo. The Apps Script URL alone gives no access — the PIN + TOTP gate protects your data.

---

### Step 6 — Open the app

**Locally:**
Open `app/index.html` directly in a browser (`file://` path works fine).

**Via GitHub Pages:**
```
https://<your-github-username>.github.io/<repo-name>/forge/starter-module/app/
```

On first load:
- If `config.js` is missing, a setup banner appears.
- If `config.js` is present, the PIN + TOTP sign-in screen appears.
- Enter your PIN and the 6-digit code from your authenticator app.
- The PIN is stored in `sessionStorage` — it clears when you close the browser tab.

---

### Step 7 — Verify

1. Sign in — the table should show "No items yet".
2. Add an item via the form — confirm it appears in both the table and your Google Sheet.
3. Edit and delete the item — confirm the sheet updates correctly.
4. Toggle dark mode — confirm the theme persists on reload.

---

## Subsequent backend deployments

Apps Script deployments are immutable snapshots. After editing `Code.gs`:

1. Go to **Deploy → Manage deployments**.
2. Click the **pencil (Edit)** icon on your deployment.
3. Change the version to **New version**.
4. Click **Deploy**.

The URL stays the same — no change needed in `config.js`.

Frontend changes (HTML / CSS / JS) take effect immediately on refresh — no deployment needed.

---

## Operations reference

### Unlock a locked IP

After 3 failed PIN attempts, the IP is locked. To unlock:
1. Open your spreadsheet → `audit_access` tab.
2. Find the row for that IP.
3. Set the `is_locked` column to `FALSE`.

To reset all counts for that IP, delete the row entirely.

### Change your PIN

1. Open Apps Script → **Project Settings → Script Properties**.
2. Update `PIN_SECRET`.
3. Close and reopen the browser tab (clears `sessionStorage`).

### Change your TOTP secret

1. Generate a new Base32 secret.
2. Update `TOTP_SECRET` in Script Properties.
3. Remove the old entry from your authenticator app and add the new secret.

### Hosting on GitHub Pages

The `_shared/` folder starts with an underscore. Jekyll (GitHub Pages default processor) skips underscore directories. A `.nojekyll` file at the repo root disables Jekyll so `_shared/` is served correctly — do not remove it.

To enable GitHub Pages:
1. Make the repo public (free tier requirement).
2. Go to repo **Settings → Pages → Branch: `main`, folder: `/ (root)` → Save**.
3. Your module is live at `https://<username>.github.io/<repo>/forge/starter-module/app/`.

### Backup

The Google Sheet is the source of truth. Download it as `.xlsx` or use Google Takeout for a full backup.

---

## File reference

```
forge/starter-module/
  app/
    index.html              App shell — open this in a browser
    starter-module.js       All frontend logic
    starter-module.css      Module styles
    config.js               Your Script URL (create manually — see Step 5)
  backend/
    Code.gs                 Apps Script backend — paste into the Apps Script editor
    appsscript.json         Runtime settings — paste into the editor's appsscript.json
  deployment-guide.md       This file
  README.md                 Developer reference (UI patterns, schema, template guide)
```
