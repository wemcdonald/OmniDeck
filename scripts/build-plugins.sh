#!/usr/bin/env bash
set -euo pipefail

# Bundle agent-side plugin code for all plugins that contain an agent.ts.
# Each plugin's agent.ts is bundled into a single self-contained JS file
# and written to dist/plugins/{plugin-id}/agent.bundle.js.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGINS_DIR="${REPO_ROOT}/plugins"
OUTPUT_BASE="${REPO_ROOT}/dist/plugins"

if [ ! -d "${PLUGINS_DIR}" ]; then
  echo "No plugins directory found at ${PLUGINS_DIR}, skipping."
  exit 0
fi

BUNDLED=0
SKIPPED=0

for PLUGIN_DIR in "${PLUGINS_DIR}"/*/; do
  [ -d "${PLUGIN_DIR}" ] || continue

  PLUGIN_ID="$(basename "${PLUGIN_DIR}")"
  AGENT_ENTRY="${PLUGIN_DIR}agent.ts"

  if [ ! -f "${AGENT_ENTRY}" ]; then
    echo "Skipping ${PLUGIN_ID} (no agent.ts)"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  OUTPUT_DIR="${OUTPUT_BASE}/${PLUGIN_ID}"
  OUTPUT_FILE="${OUTPUT_DIR}/agent.bundle.js"

  mkdir -p "${OUTPUT_DIR}"

  echo "Bundling ${PLUGIN_ID} -> ${OUTPUT_FILE}"
  bun build "${AGENT_ENTRY}" \
    --outfile="${OUTPUT_FILE}" \
    --target=bun \
    --format=esm \
    --minify

  BUNDLED=$((BUNDLED + 1))
done

echo "Done. Bundled: ${BUNDLED}, Skipped (no agent.ts): ${SKIPPED}"
echo "Output in ${OUTPUT_BASE}/"
