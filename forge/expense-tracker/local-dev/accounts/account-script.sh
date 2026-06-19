#!/bin/bash
# =============================================================================
# Fulcrum Forge — Seed dummy accounts from account-data.json
# =============================================================================

set -euo pipefail

# ── Configuration — set SCRIPT_URL once here ─────────────────────────────────

SCRIPT_URL="https://script.google.com/macros/s/REPLACE_WITH_YOUR_DEPLOYMENT_ID/exec"

# ── Validate prerequisites ────────────────────────────────────────────────────

if ! command -v jq &>/dev/null; then
  echo "Error: jq is required. Install with: brew install jq"
  exit 1
fi

if [[ "$SCRIPT_URL" == *"REPLACE_WITH_YOUR_DEPLOYMENT_ID"* ]]; then
  echo "Error: SCRIPT_URL has not been configured."
  echo "Edit account-script.sh and replace REPLACE_WITH_YOUR_DEPLOYMENT_ID with your GAS deployment ID."
  exit 1
fi

DATA_FILE="$(dirname "$0")/account-data.json"
if [ ! -f "$DATA_FILE" ]; then
  echo "Error: account-data.json not found at $DATA_FILE"
  exit 1
fi

# ── Colour helpers ────────────────────────────────────────────────────────────

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

pass() { echo -e "${GREEN}✓${RESET} $1"; }
fail() { echo -e "${RED}✗${RESET} $1"; }

# ── Prompt: PIN ───────────────────────────────────────────────────────────────

echo ""
read -rsp "$(echo -e "${BOLD}Enter PIN:${RESET} ")" PIN
echo ""

if [ -z "$PIN" ]; then
  echo "Error: PIN cannot be empty."
  exit 1
fi

# ── Build account list from JSON ──────────────────────────────────────────────

TOTAL=$(jq 'length' "$DATA_FILE")

echo ""
echo -e "${BOLD}Available accounts:${RESET}"
echo "────────────────────────────────────────────────────"

for i in $(seq 0 $((TOTAL - 1))); do
  NUM=$((i + 1))
  ACCOUNT_NAME=$(jq -r ".[$i].name" "$DATA_FILE")
  ACCOUNT_TYPE=$(jq -r ".[$i].type" "$DATA_FILE")
  printf "  ${CYAN}%2d.${RESET}  %-24s — %s\n" "$NUM" "$ACCOUNT_TYPE" "$ACCOUNT_NAME"
done

echo "────────────────────────────────────────────────────"
echo ""
read -rp "$(echo -e "Enter numbers to create ${YELLOW}(e.g. 1,2,3,7)${RESET} or press ${YELLOW}Enter${RESET} for all: ")" SELECTION
echo ""

# ── Resolve selected indices (0-based) ───────────────────────────────────────

declare -a SELECTED_INDICES=()

if [ -z "$SELECTION" ]; then
  for i in $(seq 0 $((TOTAL - 1))); do
    SELECTED_INDICES+=("$i")
  done
else
  # Normalise: replace commas/spaces with newlines, deduplicate, sort
  NORMALISED=$(echo "$SELECTION" | tr ',/ ' '\n' | tr -d ' ' | sort -un)
  for NUM in $NORMALISED; do
    if ! [[ "$NUM" =~ ^[0-9]+$ ]]; then
      echo -e "${YELLOW}Skipping invalid entry: $NUM${RESET}"
      continue
    fi
    IDX=$((NUM - 1))
    if [ "$IDX" -lt 0 ] || [ "$IDX" -ge "$TOTAL" ]; then
      echo -e "${YELLOW}Skipping out-of-range number: $NUM (valid range: 1–$TOTAL)${RESET}"
      continue
    fi
    SELECTED_INDICES+=("$IDX")
  done
fi

if [ ${#SELECTED_INDICES[@]} -eq 0 ]; then
  echo "No valid accounts selected. Exiting."
  exit 0
fi

# ── Seed selected accounts ────────────────────────────────────────────────────

echo "Creating ${#SELECTED_INDICES[@]} account(s)..."
echo "────────────────────────────────────────────────────"

SUCCESS=0
FAILED=0

for IDX in "${SELECTED_INDICES[@]}"; do
  ACCOUNT=$(jq ".[$IDX]" "$DATA_FILE")
  ACCOUNT_NAME=$(echo "$ACCOUNT" | jq -r '.name')
  ACCOUNT_TYPE=$(echo "$ACCOUNT" | jq -r '.type')

  PAYLOAD=$(echo "$ACCOUNT" | jq \
    --arg action "create_account" \
    --arg pin "$PIN" \
    '. + {action: $action, pin: $pin}')

  RESPONSE=$(curl -s -L -X POST "$SCRIPT_URL" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" 2>&1)

  OK=$(echo "$RESPONSE" | jq -r '.ok' 2>/dev/null || echo "false")
  ERROR=$(echo "$RESPONSE" | jq -r '.error // ""' 2>/dev/null || echo "parse_error")
  ID=$(echo "$RESPONSE" | jq -r '.id // ""' 2>/dev/null || echo "")

  if [ "$OK" = "true" ]; then
    pass "$ACCOUNT_NAME ($ACCOUNT_TYPE) — id: $ID"
    SUCCESS=$((SUCCESS + 1))
  else
    fail "$ACCOUNT_NAME ($ACCOUNT_TYPE) — error: $ERROR"
    FAILED=$((FAILED + 1))
  fi
done

echo "────────────────────────────────────────────────────"
echo "Done. Created: $SUCCESS  Failed: $FAILED"
echo ""
