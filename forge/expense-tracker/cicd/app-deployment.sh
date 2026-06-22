#!/usr/bin/env bash
# Full deployment pipeline for expense-tracker.
# Environment is MANDATORY — no default. The script switches to that env
# (rewriting backend/.clasp.json + app/config.js) before deploying.
#
# Usage: ./app-deployment.sh <dev|prod> [commit message]
#
# Normal entry point is `bash forge/deploy.sh`, which asks for env interactively.
# This script can also be called directly if you know which env you want.
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

# ── Resolve env IDs from cicd/envs.json ──────────────────────────────────────
read_env_field() {
  python3 -c "
import json
try:
    d = json.load(open('$ENVS_FILE'))['$ENV_ARG']
    print(d['$1'])
except KeyError:
    print('TODO')
"
}

SCRIPT_ID=$(read_env_field script_id)
DEPLOYMENT_ID=$(read_env_field deployment_id)
SCRIPT_URL=$(read_env_field script_url)

if [[ "$SCRIPT_ID" == "TODO" || "$DEPLOYMENT_ID" == "TODO" || "$SCRIPT_URL" == "TODO" ]]; then
  echo "ERROR: '$ENV_ARG' environment is not fully configured in $ENVS_FILE."
  echo "  script_id:     $SCRIPT_ID"
  echo "  deployment_id: $DEPLOYMENT_ID"
  echo "  script_url:    $SCRIPT_URL"
  echo ""
  echo "Fill in the TODO fields, then re-run."
  exit 1
fi

# ── Switch the environment (rewrite .clasp.json + app/config.js) ─────────────
# Single source of truth: cicd/envs.json. Both downstream files are derived
# from it on every deploy, so a hand-edit drift is corrected on next deploy.
python3 - <<PY
import json
p = "$CLASP_FILE"
d = json.load(open(p))
d["scriptId"] = "$SCRIPT_ID"
with open(p, "w") as f:
    json.dump(d, f, indent=2)
PY

cat > "$CONFIG_FILE" <<EOF
// AUTO-MANAGED by cicd/app-deployment.sh — do not hand-edit.
// Regenerated on every deploy based on cicd/envs.json.
//
// Active env: $ENV_ARG
// config.js is gitignored — the PIN + TOTP gate protects your data, not this URL.
window.CONFIG = {
  SCRIPT_URL: '$SCRIPT_URL',
};
EOF

echo "Env: $ENV_ARG"
echo "  scriptId:      $SCRIPT_ID"
echo "  deploymentId:  $DEPLOYMENT_ID"
echo "  /exec URL:     $SCRIPT_URL"
echo ""

# ── Prod confirmation ────────────────────────────────────────────────────────
# Belt-and-braces second prompt even when the env came from the deploy.sh menu
# — clasp deploy is destructive in the sense that it shifts users to the new
# version immediately, so a final yes is worth the extra second.
if [[ "$ENV_ARG" == "prod" ]]; then
  read -rp "You are about to deploy to PROD. Continue? [y/N] " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Aborted."
    exit 1
  fi
fi

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
echo "→ Pushing expense-tracker to GAS draft ($ENV_ARG)…"
cd "$APP_DIR/backend"
clasp push --force
echo "→ Deploying new version on $ENV_ARG…"
clasp deploy --deploymentId "$DEPLOYMENT_ID" --description "$MSG"

echo "✓ expense-tracker deployed to $ENV_ARG."
