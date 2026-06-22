#!/usr/bin/env bash
# Forge deployment launcher.
# Discovers all apps with cicd/app-deployment.sh, asks which app + which
# environment, then dispatches. Environment is MANDATORY — there is no default.
set -euo pipefail

FORGE_DIR="$(cd "$(dirname "$0")" && pwd)"

# Discover apps that have a cicd/app-deployment.sh
APPS=()
for dir in "$FORGE_DIR"/*/; do
  if [[ -f "$dir/cicd/app-deployment.sh" ]]; then
    APPS+=("$(basename "$dir")")
  fi
done

if [[ ${#APPS[@]} -eq 0 ]]; then
  echo "No deployable apps found (looking for cicd/app-deployment.sh in each folder)."
  exit 1
fi

echo ""
echo "╔══════════════════════════════╗"
echo "║     Forge Deployment         ║"
echo "╚══════════════════════════════╝"
echo ""
echo "Select an app to deploy:"
echo ""

APP_OPTIONS=("${APPS[@]}" "All apps")
select CHOICE in "${APP_OPTIONS[@]}"; do
  [[ -n "$CHOICE" ]] && break
  echo "Invalid selection — try again."
done

echo ""
echo "Select environment (mandatory):"
echo ""
ENV_OPTIONS=("dev" "prod")
select ENV in "${ENV_OPTIONS[@]}"; do
  [[ -n "$ENV" ]] && break
  echo "Invalid selection — try again."
done

echo ""
read -rp "Commit message (leave blank for default): " MSG
echo ""

deploy_app() {
  local app="$1"
  local env="$2"
  local msg="$3"
  echo "══════════════════════════════════════"
  echo "  Deploying: $app → $env"
  echo "══════════════════════════════════════"
  if [[ -n "$msg" ]]; then
    bash "$FORGE_DIR/$app/cicd/app-deployment.sh" "$env" "$msg"
  else
    bash "$FORGE_DIR/$app/cicd/app-deployment.sh" "$env"
  fi
  echo ""
}

if [[ "$CHOICE" == "All apps" ]]; then
  for app in "${APPS[@]}"; do
    deploy_app "$app" "$ENV" "$MSG"
  done
else
  deploy_app "$CHOICE" "$ENV" "$MSG"
fi

echo "✓ All done."
