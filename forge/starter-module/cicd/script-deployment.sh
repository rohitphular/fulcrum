#!/usr/bin/env bash
# Backend deploy for starter-module.
# Pushes .gs source to the GAS draft and promotes it to a new live version.
# Same behaviour for all envs. Git operations are NOT performed here — commit
# and push manually when you're ready to record state in git.
#
# Usage: ./script-deployment.sh <env> [deploy description]
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENVS_FILE="$APP_DIR/cicd/envs.json"
CLASP_FILE="$APP_DIR/backend/.clasp.json"

# Literal placeholder string committed in backend/.clasp.json.
# Single-quoted on the right-hand side so bash does NOT try to expand
# ${SCRIPT_ID_PLACEHOLDER} — it's a 27-character literal, not a variable ref.
SCRIPT_ID_PLACEHOLDER='${SCRIPT_ID_PLACEHOLDER}'

# Step 1: Validate the env argument against envs.json (single source of truth).
ENV_ARG="${1:-}"
if [[ -z "$ENV_ARG" ]]; then
  echo "ERROR: environment is required."
  echo "Usage: $0 <env> [deploy description]"
  exit 1
fi
if [[ ! -f "$ENVS_FILE" ]]; then
  echo "ERROR: $ENVS_FILE not found."
  exit 1
fi

VALID_ENVS=()
while IFS= read -r line; do
  VALID_ENVS+=("$line")
done < <(python3 -c "
import json
with open('$ENVS_FILE') as f:
    d = json.load(f)
for k in d.keys():
    if not k.startswith('_'):
        print(k)
")
env_is_valid=0
for e in "${VALID_ENVS[@]}"; do
  if [[ "$ENV_ARG" == "$e" ]]; then env_is_valid=1; break; fi
done
if [[ $env_is_valid -eq 0 ]]; then
  echo "ERROR: unknown environment '$ENV_ARG'."
  echo "       envs.json declares: ${VALID_ENVS[*]}"
  exit 1
fi

MSG="${2:-starter-module: code pushed}"

# Step 2: Resolve the env's scriptId and deploymentId from envs.json.
SCRIPT_ID=$(python3 -c "
import json
d = json.load(open('$ENVS_FILE'))['$ENV_ARG']
print(d.get('script_id', 'TODO'))
")
DEPLOYMENT_ID=$(python3 -c "
import json
d = json.load(open('$ENVS_FILE'))['$ENV_ARG']
print(d.get('deployment_id', 'TODO'))
")

if [[ "$SCRIPT_ID" == "TODO" || "$DEPLOYMENT_ID" == "TODO" ]]; then
  echo "ERROR: '$ENV_ARG' environment is not fully configured in $ENVS_FILE."
  echo "  script_id:     $SCRIPT_ID"
  echo "  deployment_id: $DEPLOYMENT_ID"
  exit 1
fi

echo "Deploying backend to: $ENV_ARG"
echo "  scriptId:      $SCRIPT_ID"
echo "  deploymentId:  $DEPLOYMENT_ID"
echo ""

# Step 3: Install an EXIT trap so .clasp.json is restored to the placeholder
# no matter how the script ends (success, clasp error, Ctrl-C, etc.).
restore_placeholder() {
  python3 - <<PY
import json
p = "$CLASP_FILE"
d = json.load(open(p))
d["scriptId"] = "$SCRIPT_ID_PLACEHOLDER"
with open(p, "w") as f:
    json.dump(d, f, indent=2)
PY
  echo "backend/.clasp.json restored to placeholder."
}
trap restore_placeholder EXIT

# Step 4: Write the target env's scriptId into .clasp.json so clasp push knows
# which GAS project to upload to. The trap above will undo this on exit.
python3 - <<PY
import json
p = "$CLASP_FILE"
d = json.load(open(p))
d["scriptId"] = "$SCRIPT_ID"
with open(p, "w") as f:
    json.dump(d, f, indent=2)
PY

# Step 5: Upload backend code to the GAS draft, then promote it to a new live
# version on the env's deployment.
echo "Pushing starter-module to GAS draft (${ENV_ARG})..."
cd "$APP_DIR/backend"
clasp push --force
echo "Deploying new version on ${ENV_ARG}..."
clasp deploy --deploymentId "$DEPLOYMENT_ID" --description "$MSG"

echo "Done."
# EXIT trap fires here → .clasp.json restored to placeholder.
