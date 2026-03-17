#!/usr/bin/env bash
set -euo pipefail

# Build OmniDeck agent binaries for all target platforms.
# Output goes to dist/agent/ relative to the repo root.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${REPO_ROOT}/dist/agent"
AGENT_MODULE="${REPO_ROOT}/agent"
ENTRY_POINT="./cmd/omnideck-agent/"

PLATFORMS=(
  "darwin/amd64"
  "darwin/arm64"
  "windows/amd64"
)

mkdir -p "${OUTPUT_DIR}"

cd "${AGENT_MODULE}"

for PLATFORM in "${PLATFORMS[@]}"; do
  OS="${PLATFORM%/*}"
  ARCH="${PLATFORM#*/}"
  OUTPUT="${OUTPUT_DIR}/omnideck-agent-${OS}-${ARCH}"
  [ "${OS}" = "windows" ] && OUTPUT="${OUTPUT}.exe"

  echo "Building ${OS}/${ARCH} -> ${OUTPUT}"
  GOOS="${OS}" GOARCH="${ARCH}" go build -o "${OUTPUT}" "${ENTRY_POINT}"
done

echo "Done. Binaries in ${OUTPUT_DIR}/"
