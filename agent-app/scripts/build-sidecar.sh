#!/usr/bin/env bash
# Build the agent sidecar binary for the current platform.
# The output filename must include the Rust target triple for Tauri to find it.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENT_DIR="$SCRIPT_DIR/../../agent"
SIDECARS_DIR="$SCRIPT_DIR/../src-tauri/sidecars"

# Detect target triple from rustc
TARGET_TRIPLE="${TAURI_TARGET_TRIPLE:-$(rustc -vV | grep host | cut -d' ' -f2)}"

# Map target triple to Bun build target
case "$TARGET_TRIPLE" in
  aarch64-apple-darwin)   BUN_TARGET="bun-darwin-arm64" ;;
  x86_64-apple-darwin)    BUN_TARGET="bun-darwin-x64" ;;
  x86_64-pc-windows-msvc) BUN_TARGET="bun-windows-x64" ;;
  x86_64-unknown-linux-gnu) BUN_TARGET="bun-linux-x64" ;;
  aarch64-unknown-linux-gnu) BUN_TARGET="bun-linux-arm64" ;;
  *)
    echo "Unsupported target triple: $TARGET_TRIPLE"
    exit 1
    ;;
esac

# Determine output filename (Windows needs .exe)
OUTPUT="$SIDECARS_DIR/omnideck-agent-${TARGET_TRIPLE}"
case "$TARGET_TRIPLE" in
  *windows*) OUTPUT="${OUTPUT}.exe" ;;
esac

mkdir -p "$SIDECARS_DIR"

echo "Building agent sidecar for $TARGET_TRIPLE (bun target: $BUN_TARGET)"
cd "$AGENT_DIR"
bun build src/index.ts --compile --target="$BUN_TARGET" --outfile "$OUTPUT"

echo "Sidecar built: $OUTPUT"
ls -lh "$OUTPUT"
