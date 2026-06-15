# Expense Tracker — Deployment Guide

This guide covers first-time setup and ongoing maintenance.

---

## Prerequisites

| What | Why |
|---|---|
| Google account | Hosts the spreadsheet and Apps Script |
| TOTP authenticator app | Google Authenticator, Authy, or any RFC 6238-compatible app |
| `clasp` CLI | Required for script-based deployments — `npm install -g @google/clasp` |
| `clasp login` done | One-time OAuth — run `clasp login` and authenticate |

---

## First-time deployment

### Step 1 — Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet.
2. Name it anything — e.g. `Fulcrum Expense Tracker`.
3. Leave it empty — all sheet tabs (`transactions`, `categories`, `accounts`, `rates`, `audit_access`) are created **automatically** by Apps Script on the first request.

---

### Step 2 — Set up Apps Script

1. In your spreadsheet, go to **Extensions → Apps Script**.
2. Delete the default `myFunction` code in `Code.gs`.
3. Copy the entire contents of `backend/Code.js` from this repo and paste it in.
4. Click **Save** (the floppy disk icon or Ctrl+S).

**Update the Apps Script manifest (`appsscript.json`):**

5. In the Apps Script editor, go to **Project Settings** (gear icon on the left).
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

> Without the `"webapp"` block, the deployment step will not offer the Web App option. Adjust `timeZone` if needed (e.g. `"Asia/Kolkata"`).

---

### Step 3 — Set your PIN and TOTP secret

1. In Apps Script, go to **Project Settings** → **Script Properties** → **Add script property**.
2. Add two properties:

| Property name | Value |
|---|---|
| `PIN_SECRET` | Your chosen PIN (numbers recommended, e.g. `482917`) |
| `TOTP_SECRET` | A Base32 secret key — see below |

3. Click **Save script properties**.

**Generating a TOTP secret:**

- Run locally: `python3 -c "import base64, os; print(base64.b32encode(os.urandom(20)).decode())"`
- Or use [https://it-tools.tech/otp-generator](https://it-tools.tech/otp-generator)
- Copy the Base32 secret (e.g. `JBSWY3DPEHPK3PXP`) — uppercase letters and digits 2–7.

**Adding to your authenticator app:**
1. Open your authenticator app → tap **+** → **Enter a setup key**.
2. Account name: `Fulcrum Expense` (or anything you like).
3. Key: paste your `TOTP_SECRET` value.
4. Type: **Time based** → Tap **Add**.

You will see a 6-digit code that refreshes every 30 seconds.

---

### Step 4 — Deploy as a Web App

1. In Apps Script, click **Deploy → New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Set:
   - **Description:** `expense-tracker v1`
   - **Execute as:** `Me`
   - **Who has access:** `Anyone`
4. Click **Deploy** — authorise when prompted.
5. Copy the **Web app URL**: `https://script.google.com/macros/s/AKfycb.../exec`

---

### Step 5 — Configure the app

1. Create `app/config.js`:

```js
window.CONFIG = {
  SCRIPT_URL: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec'
};
```

2. Replace `YOUR_DEPLOYMENT_ID` with the Web App URL you copied (the full `/exec` URL).
3. `config.js` is committed to the repo. The URL alone gives no access — the PIN + TOTP gate protects your data.

---

### Step 6 — Seed the categories

**Option A — Automatic (recommended):**
Categories are seeded automatically on first load if the `categories` tab is empty.

**Option B — Manual seed from Apps Script:**
1. In Apps Script, click **Run** on the `seedCategories` function.
2. Confirm the authorisation prompt on first run.

---

### Step 7 — Add your accounts

The `accounts` tab is managed directly in the Sheet.

1. Open your spreadsheet → go to the `accounts` tab (created automatically).
2. Add one row per account:

| Column | Example |
|---|---|
| `name` | `HDFC Savings` |
| `currency` | `INR` |
| `type` | `savings` |
| `notes` | `primary India account` |

Valid types: `savings`, `current`, `credit`, `cash`, `investment`, `other`.

---

### Step 8 — Open the app

**Locally:** Open `app/index.html` directly in a browser (`file://` works fine).

**Via GitHub Pages:**
```
https://<your-github-username>.github.io/<repo-name>/forge/expense-tracker/app/
```

On first load: enter your PIN and the 6-digit code from your authenticator app. The PIN is stored in `sessionStorage` — it clears when you close the tab.

---

### Step 9 — Verify

1. Sign in — Dashboard should show empty summary cards.
2. Go to **Categories** — the full category tree should be visible.
3. Go to **Accounts** — your accounts should appear.
4. Go to **Transactions** → add one transaction → confirm it appears in the table and your Google Sheet.

---

## Ongoing deployments

### Script-based (recommended)

The deployment script handles git and clasp in one step.

**From the app directory:**
```bash
bash cicd/app-deployment.sh "expense-tracker: your change description"
```

**Or from the forge root (interactive menu):**
```bash
bash forge/deploy.sh
# Select "expense-tracker", enter a commit message when prompted
```

Both do the same thing: `git add` → `git commit` → `git push` → `clasp push --force` → `clasp deploy`.

> **Prerequisite:** `clasp` must be installed and `clasp login` must have been run at least once on this machine. See `backend/development-guide.md`.

---

### Manual — frontend only

HTML / CSS / JS changes take effect immediately on refresh. No deployment needed.

---

### Manual — backend only (no git commit)

When you want to push a GAS change without making a git commit:

```bash
cd backend/
clasp push --force
clasp deploy \
  --deploymentId "AKfycbxWTOuXeCkH4tsDvrmCjkjxlhIZqLyIhxfvXR51ymWRc1FGAOYkLt0rkeGjTfQmWAv2RA" \
  --description "your description"
```

The deployment URL stays the same — `config.js` does not need to change.

---

### Manual — via GAS editor

1. Make your changes in the Apps Script editor.
2. **Deploy → Manage deployments**.
3. Click the **pencil (Edit)** icon on your deployment.
4. Change the version to **New version** → click **Deploy**.

---

## Operations reference

### Session management

After a successful PIN + TOTP login, the app stores a session in `sessionStorage` under the key `et_session`:

```json
{ "pin": "your-pin", "expires_at": 1718143200000 }
```

| Scenario | Behaviour |
|---|---|
| Refresh page (F5) | Session survives — no re-login required |
| Close tab | `sessionStorage` is cleared — re-login required on next open |
| Kill / restart browser | `sessionStorage` is cleared — re-login required |
| Session older than 6 hours | TTL expired — re-login required on next action |
| GAS returns `auth` / `locked` | Session cleared automatically — login screen shown |

**To force immediate re-login** (e.g. after a PIN change): close the tab and reopen it, or open DevTools → Application → Session Storage → delete `et_session`.

**To change the TTL**: edit `SESSION_TTL` in `app/core/auth.js` (value in milliseconds).

---

### Unlock a locked IP

After 3 failed PIN attempts, the IP is locked.

1. Open your spreadsheet → `audit_access` tab.
2. Find the row for that IP.
3. Set `is_locked` to `FALSE`.

To reset all counts, delete the row entirely.

### Change your PIN

1. Apps Script → **Project Settings → Script Properties** → update `PIN_SECRET`.
2. Close and reopen the browser tab (clears `sessionStorage`).

### Change your TOTP secret

1. Generate a new Base32 secret.
2. Update `TOTP_SECRET` in Script Properties.
3. Remove the old entry from your authenticator app and add the new secret.

### Backup

The Google Sheet is the source of truth. Download as `.xlsx` or use Google Takeout for a full backup.

---

## Category conventions

**Credit card payments:**

Pick one convention and stick to it — mixing causes double-counting:

- If your credit card is tracked as an account: use `money-transfer → Card payment → Pay credit card`. This moves money between accounts without affecting income/expense totals.
- If credit cards are not tracked as accounts: use `money-out → Debt & finance → Credit card payment`.

The debt-tracker handles what you _owe_; the expense-tracker handles the _payment flow_.

---

## File reference

```
forge/expense-tracker/
  app/
    index.html              App shell — open this in a browser
    main.js                 Frontend entry point (ES module)
    core/                   State, API, utils, UI, auth, nav modules
    sections/               Dashboard, transactions, categories, accounts, rates
    expense-tracker.css     Styles
    config.js               Your Script URL (create manually — see Step 5)
  backend/
    .clasp.json             Links this folder to the GAS project
    appsscript.json         GAS runtime manifest
    Code.js                 Apps Script backend source
    development-guide.md    Clasp workflow reference for backend iteration
  cicd/
    app-deployment.sh       One-shot deploy: git + clasp push + clasp deploy
    deployment-guide.md     This file
  dev-tasks/                Local scratch space — not committed
```
