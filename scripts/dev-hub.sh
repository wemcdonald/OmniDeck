#!/bin/bash
set -e

# Detect system memory and cap Node.js heap to avoid OOM on low-RAM devices (e.g. Raspberry Pi)
if [ -f /proc/meminfo ]; then
  TOTAL_KB=$(awk '/MemTotal/ { print $2 }' /proc/meminfo)
  TOTAL_MB=$((TOTAL_KB / 1024))
  # Use 40% of total RAM, clamped to [256, 1536] MB
  LIMIT_MB=$(( TOTAL_MB * 40 / 100 ))
  [ "$LIMIT_MB" -lt 256 ] && LIMIT_MB=256
  [ "$LIMIT_MB" -gt 1536 ] && LIMIT_MB=1536
  export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--max-old-space-size=$LIMIT_MB"
  echo "[dev] ${TOTAL_MB}MB RAM detected — Node heap limited to ${LIMIT_MB}MB"
fi

exec tsx watch src/index.ts
