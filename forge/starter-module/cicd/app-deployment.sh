#!/usr/bin/env bash
# Full deployment pipeline for starter-module.
# Commits + pushes local changes, then deploys the GAS backend.
# Usage: ./app-deployment.sh [commit message]
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MSG="${1:-starter-module: code pushed}"

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
echo "→ Pushing starter-module to GAS draft…"
cd "$APP_DIR/backend"
clasp push --force
echo "→ Deploying new version…"
clasp deploy \
  --deploymentId "AKfycbykwDFrvKj5vnScj16Y1cb9FA5TkS5I0yss1RrX6ps8N04seU1Tlhi5s_V8ZuNzgvlK" \
  --description "$MSG"

echo "✓ starter-module deployed."
