#!/bin/bash
# =============================================================================
# Fulcrum Forge — Seed dummy accounts from account-data.json
# =============================================================================

set -euo pipefail

# ── Configuration — set SCRIPT_URL once here ─────────────────────────────────

SCRIPT_URL="https://script.google.com/macros/s/AKfycbxWTOuXeCkH4tsDvrmCjkjxlhIZqLyIhxfvXR51ymWRc1FGAOYkLt0rkeGjTfQmWAv2RA/exec"

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

# ── Warm up rates sheet (auto-seeds GBP/USD/EUR/INR/AED if empty) ─────────────

echo -e "${CYAN}Checking rates sheet...${RESET}"
RATES_RESP=$(curl -s -L \
  "${SCRIPT_URL}?action=list_rates&pin=${PIN}" 2>&1)
RATES_OK=$(echo "$RATES_RESP" | jq -r '.ok' 2>/dev/null || echo "false")
if [ "$RATES_OK" != "true" ]; then
  RATES_ERR=$(echo "$RATES_RESP" | jq -r '.error // empty' 2>/dev/null)
  if [ -z "$RATES_ERR" ]; then
    echo -e "${RED}✗${RESET} Could not reach backend: $(echo "$RATES_RESP" | head -c 200 | tr '\n' ' ')"
  else
    echo -e "${RED}✗${RESET} Rates check failed: $RATES_ERR"
  fi
  exit 1
fi
echo -e "${GREEN}✓${RESET} Rates sheet ready"
echo ""

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

  # GAS: POST to /exec triggers execution (302 redirect), GET the echo URL retrieves JSON.
  # --data-raw implies POST for the initial request; -L follows the 302 with GET (browser behaviour).
  RESPONSE=$(curl -s -L \
    -H "Content-Type: text/plain" \
    --data-raw "$PAYLOAD" \
    "$SCRIPT_URL" 2>&1)

  OK=$(echo "$RESPONSE" | jq -r '.ok' 2>/dev/null || echo "false")

  if [ "$OK" = "true" ]; then
    ID=$(echo "$RESPONSE" | jq -r '.id // ""' 2>/dev/null || echo "")
    pass "$ACCOUNT_NAME ($ACCOUNT_TYPE) — id: $ID"
    SUCCESS=$((SUCCESS + 1))
  else
    ERROR=$(echo "$RESPONSE" | jq -r '.error // empty' 2>/dev/null)
    if [ -z "$ERROR" ]; then
      # Response was not JSON — show raw for diagnosis
      RAW=$(echo "$RESPONSE" | head -c 200 | tr '\n' ' ')
      fail "$ACCOUNT_NAME ($ACCOUNT_TYPE) — unexpected response: $RAW"
    else
      fail "$ACCOUNT_NAME ($ACCOUNT_TYPE) — error: $ERROR"
    fi
    FAILED=$((FAILED + 1))
  fi
done

echo "────────────────────────────────────────────────────"
echo "Done. Created: $SUCCESS  Failed: $FAILED"
echo ""
