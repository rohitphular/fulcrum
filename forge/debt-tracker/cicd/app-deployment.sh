#!/usr/bin/env bash
# Full deployment pipeline for debt-tracker.
# Commits + pushes local changes, then deploys the GAS backend.
# Usage: ./app-deployment.sh [commit message]
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MSG="${1:-debt-tracker: code pushed}"

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
echo "→ Pushing debt-tracker to GAS draft…"
cd "$APP_DIR/backend"
clasp push --force
echo "→ Deploying new version…"
clasp deploy \
  --deploymentId "AKfycbwAKh5TGg9sP9F5HRROQg5NUpwJV8QPvBwriIG2eToPN-9wt9E0fiNA6S3lqVlrpyNtCg" \
  --description "$MSG"

echo "✓ debt-tracker deployed."
