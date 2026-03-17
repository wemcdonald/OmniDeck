#!/usr/bin/env bash
set -euo pipefail

# Build OmniDeck agent binaries for all target platforms using Bun.
# Output goes to dist/agent/ relative to the repo root.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${REPO_ROOT}/dist/agent"

TARGETS=(
  "bun-darwin-arm64:omnideck-agent-darwin-arm64"
  "bun-darwin-x64:omnideck-agent-darwin-x64"
  "bun-windows-x64:omnideck-agent-windows-x64.exe"
)

mkdir -p "${OUTPUT_DIR}"

cd "${REPO_ROOT}/agent"

for ENTRY in "${TARGETS[@]}"; do
  TARGET="${ENTRY%%:*}"
  OUTNAME="${ENTRY##*:}"
  OUTPUT="${OUTPUT_DIR}/${OUTNAME}"

  echo "Building ${TARGET} -> ${OUTPUT}"
  bun build src/index.ts --compile --target="${TARGET}" --outfile="${OUTPUT}"
done

echo "Done. Binaries in ${OUTPUT_DIR}/"
