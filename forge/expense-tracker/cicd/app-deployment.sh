#!/usr/bin/env bash
# Full deployment pipeline for expense-tracker.
# Environment is MANDATORY — no default.
#
# Local-state invariant: when this script exits (success OR failure), local
# files (.clasp.json + app/config.js) are restored to dev. The local browser
# always talks to the dev backend. Prod deploys are transient operations that
# flip state only between Phase 2 (clasp push) and Phase 4 (revert).
#
# Usage: ./app-deployment.sh <dev|prod> [commit message]
#
# Normal entry point is `bash forge/deploy.sh`, which asks for env interactively.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENVS_FILE="$APP_DIR/cicd/envs.json"
CLASP_FILE="$APP_DIR/backend/.clasp.json"
CONFIG_FILE="$APP_DIR/app/config.js"

# ── Required env argument ────────────────────────────────────────────────────
ENV_ARG="${1:-}"
if [[ -z "$ENV_ARG" ]]; then
  echo "ERROR: environment is required."
  echo "Usage: $0 <dev|prod> [commit message]"
  exit 1
fi
if [[ "$ENV_ARG" != "dev" && "$ENV_ARG" != "prod" ]]; then
  echo "ERROR: unknown environment '$ENV_ARG' (must be dev or prod)."
  exit 1
fi
if [[ ! -f "$ENVS_FILE" ]]; then
  echo "ERROR: $ENVS_FILE not found. See cicd/README.md for the schema."
  exit 1
fi

MSG="${2:-expense-tracker: code pushed}"

# ── Resolve IDs for BOTH envs ────────────────────────────────────────────────
# Dev IDs are mandatory for any deploy because the script always leaves local
# state on dev. Target IDs are mandatory for the env being deployed to.
read_field() {
  local env="$1" field="$2"
  python3 -c "
import json
try:
    d = json.load(open('$ENVS_FILE'))['$env']
    print(d['$field'])
except KeyError:
    print('TODO')
"
}

DEV_SCRIPT_ID=$(read_field dev script_id)
DEV_SCRIPT_URL=$(read_field dev script_url)

if [[ "$DEV_SCRIPT_ID" == "TODO" || "$DEV_SCRIPT_URL" == "TODO" ]]; then
  echo "ERROR: dev environment is not configured in $ENVS_FILE."
  echo "  script_id:  $DEV_SCRIPT_ID"
  echo "  script_url: $DEV_SCRIPT_URL"
  echo ""
  echo "Dev IDs are required even for prod deploys — local state always returns to dev."
  exit 1
fi

TARGET_SCRIPT_ID=$(read_field "$ENV_ARG" script_id)
TARGET_DEPLOYMENT_ID=$(read_field "$ENV_ARG" deployment_id)
TARGET_SCRIPT_URL=$(read_field "$ENV_ARG" script_url)

if [[ "$TARGET_SCRIPT_ID" == "TODO" || "$TARGET_DEPLOYMENT_ID" == "TODO" || "$TARGET_SCRIPT_URL" == "TODO" ]]; then
  echo "ERROR: '$ENV_ARG' environment is not fully configured in $ENVS_FILE."
  echo "  script_id:     $TARGET_SCRIPT_ID"
  echo "  deployment_id: $TARGET_DEPLOYMENT_ID"
  echo "  script_url:    $TARGET_SCRIPT_URL"
  echo ""
  echo "Fill in the TODO fields, then re-run."
  exit 1
fi

echo "Deploying to: $ENV_ARG"
echo "  scriptId:      $TARGET_SCRIPT_ID"
echo "  deploymentId:  $TARGET_DEPLOYMENT_ID"
echo "  /exec URL:     $TARGET_SCRIPT_URL"
echo "Local state after deploy: dev (always reverted)"
echo ""

# ── Helpers ──────────────────────────────────────────────────────────────────
write_clasp_script_id() {
  local script_id="$1"
  python3 - <<PY
import json
p = "$CLASP_FILE"
d = json.load(open(p))
d["scriptId"] = "$script_id"
with open(p, "w") as f:
    json.dump(d, f, indent=2)
PY
}

write_config_js_to_dev() {
  cat > "$CONFIG_FILE" <<EOF
// AUTO-MANAGED by cicd/app-deployment.sh — do not hand-edit.
// Always points at the dev /exec URL — the local browser always talks to dev.
// Prod deploys do not modify this file; prod testing happens against the live
// /exec URL recorded in cicd/envs.json from a deployed environment.
//
// config.js is gitignored — the PIN + TOTP gate protects your data, not this URL.
window.CONFIG = {
  SCRIPT_URL: '$DEV_SCRIPT_URL',
};
EOF
}

# Revert .clasp.json to dev. Used as the EXIT trap during prod deploys so the
# revert fires on success AND failure (avoids leaving local state on prod).
restore_dev_state() {
  write_clasp_script_id "$DEV_SCRIPT_ID"
  echo ""
  echo "✓ Local state restored: .clasp.json → dev scriptId"
}

# ── Always: write dev URL to config.js (local browser stays on dev) ─────────
write_config_js_to_dev

# ── Prod confirmation ────────────────────────────────────────────────────────
if [[ "$ENV_ARG" == "prod" ]]; then
  read -rp "You are about to deploy to PROD. Continue? [y/N] " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Aborted."
    exit 1
  fi
fi

# ── Flip .clasp.json to the target env (so clasp push hits the right project) ─
# For prod: install the EXIT trap BEFORE the flip so we revert even on Ctrl-C
# or a clasp failure mid-deploy.
if [[ "$ENV_ARG" == "prod" ]]; then
  trap restore_dev_state EXIT
fi
write_clasp_script_id "$TARGET_SCRIPT_ID"

# ── Git ──────────────────────────────────────────────────────────────────────
echo "→ Staging and committing changes…"
cd "$APP_DIR"
git add .
git add ../_shared/
if git diff --cached --quiet; then
  echo "  Nothing to commit — skipping git commit."
else
  git commit -m "$MSG"
fi
echo "→ Pushing to remote…"
git push -u origin HEAD

# ── GAS deploy ───────────────────────────────────────────────────────────────
echo "→ Pushing expense-tracker to GAS draft (${ENV_ARG})…"
cd "$APP_DIR/backend"
clasp push --force
echo "→ Deploying new version on ${ENV_ARG}…"
clasp deploy --deploymentId "$TARGET_DEPLOYMENT_ID" --description "$MSG"

echo "✓ expense-tracker deployed to ${ENV_ARG}."
# For prod: the EXIT trap fires here and restores .clasp.json to dev.
# For dev: .clasp.json is already on dev — no trap needed.
