#!/usr/bin/env bash
# Full deployment pipeline for expense-tracker.
# Commits + pushes local changes, then deploys the GAS backend.
# Usage: ./app-deployment.sh [commit message]
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MSG="${1:-expense-tracker: code pushed}"

# ── Git ──────────────────────────────────────────────────────────────────────
echo "→ Staging and committing changes…"
cd "$APP_DIR"
git add .
if git diff --cached --quiet; then
  echo "  Nothing to commit — skipping git commit."
else
  git commit -m "$MSG"
fi
echo "→ Pushing to remote…"
git push

# ── GAS deploy ───────────────────────────────────────────────────────────────
echo "→ Pushing expense-tracker to GAS draft…"
cd "$APP_DIR/backend"
clasp push --force
echo "→ Deploying new version…"
clasp deploy \
  --deploymentId "AKfycbxWTOuXeCkH4tsDvrmCjkjxlhIZqLyIhxfvXR51ymWRc1FGAOYkLt0rkeGjTfQmWAv2RA" \
  --description "$MSG"

echo "✓ expense-tracker deployed."
