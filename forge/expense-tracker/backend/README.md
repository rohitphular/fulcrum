# Expense Tracker — Backend

Apps Script backend, edited locally via [clasp](https://github.com/google/clasp). No browser editor required.

## Folder contents

Source is split into per-domain `.gs` modules. GAS flattens them all into one namespace at runtime.

| Group | Files | Purpose |
|---|---|---|
| App | `app-auth.gs`, `app-config.gs`, `app-router.gs`, `app-utils.gs` | Auth, config, HTTP routing, shared helpers |
| Accounts | `account-core.gs`, `account-schema.gs`, `account-utils.gs`, `account-validation.gs` | Account CRUD, schema, validation |
| Transactions | `transaction-core.gs`, `transaction-schema.gs`, `transaction-utils.gs`, `transaction-validation.gs` | Transaction CRUD, schema, validation |
| Categories | `category-core.gs`, `category-schema.gs`, `category-seed.gs`, `category-utils.gs`, `category-validation.gs` | Category CRUD, schema, seed data, validation |
| Rates | `rate-core.gs`, `rate-schema.gs`, `rate-validation.gs` | FX rate CRUD, schema, validation |
| Advisor | `advisor-core.gs` | LLM advisor endpoint |
| Manifest | `appsscript.json` | GAS runtime config — timezone, V8 engine, web app access |
| clasp link | `.clasp.json` | Script ID + push target |

`.clasp.json` holds the Script ID — a public identifier, not a secret. OAuth tokens live in `~/.clasprc.json` and are gitignored.

## IDs

| Identifier | Value |
|---|---|
| Script ID | `1pAeKp8vN9GLRNi83Uqb92U83uRECjAmUBmxQGCQ86HEzxLY-YzeyQaeM` |
| Deployment ID | `AKfycbxWTOuXeCkH4tsDvrmCjkjxlhIZqLyIhxfvXR51ymWRc1FGAOYkLt0rkeGjTfQmWAv2RA` |

Script ID is what `.clasp.json` uses. Deployment ID is baked into `cicd/app-deployment.sh` and pins the live `/exec` endpoint.

## One-time setup

```bash
npm install -g @google/clasp
clasp login                # opens browser; tokens cached in ~/.clasprc.json
```

Re-linking a fresh machine after `clasp login`:

```bash
cd backend/
clasp pull                 # pulls current GAS state into local .gs files
```

No `clasp clone` needed — `.clasp.json` already has the Script ID.

## Daily commands

Run from inside `backend/`:

```bash
clasp push --force         # sync local → GAS draft (does NOT affect live /exec)
clasp open                 # open the GAS editor in browser
clasp pull                 # pull GAS state back to local
clasp logs                 # tail recent execution logs
```

### Push vs deploy — the key distinction

| Action | Effect |
|---|---|
| `clasp push` | Updates the **draft only**. The `/dev` URL reflects it immediately. The live `/exec` URL is unchanged. |
| `clasp deploy` | Snapshots the draft as a new version on the live endpoint. The `/exec` URL (used by `app/config.js`) now serves the new code. |

A push without a deploy means users still see the previous version.

## Shipping a change end-to-end

**Recommended — one script does everything:**

```bash
# From expense-tracker/
bash cicd/app-deployment.sh "expense-tracker: fix rate calc"
```

Git-stages + commits + pushes → `clasp push --force` → `clasp deploy`.

**Forge menu (multi-app):**

```bash
bash forge/deploy.sh        # pick "expense-tracker", enter commit message
```

**Backend only, no git:**

```bash
cd backend/
clasp push --force
clasp deploy \
  --deploymentId "AKfycbxWTOuXeCkH4tsDvrmCjkjxlhIZqLyIhxfvXR51ymWRc1FGAOYkLt0rkeGjTfQmWAv2RA" \
  --description "your description"
```

## Testing on /dev before deploying

1. `clasp push --force`
2. In the GAS editor → **Deploy → Test deployments** → copy the `/dev` URL
3. Temporarily set `SCRIPT_URL` in `app/config.js` to the `/dev` URL
4. Test in browser (must be signed into the same Google account)
5. Happy? `clasp deploy ...` then revert `config.js` back to `/exec`
