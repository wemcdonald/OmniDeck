---
name: bump-agent-version
description: |
  MUST be used when bumping the OmniDeck agent version, creating agent-v* git tags,
  preparing agent release builds, or any time version numbers in the agent or agent-app
  packages are being changed. Ensures all 6 version locations stay in sync.
---

# Bump Agent Version

When bumping the agent version, ALL of the following files must be updated to the same version string. Missing any one of them causes mismatches between the OS-visible version, the about screen, download filenames, and git tags.

## Files to update (ALL required)

1. **agent/package.json** — `"version"` field
2. **agent-app/package.json** — `"version"` field
3. **agent-app/src-tauri/tauri.conf.json** — `"version"` field
4. **agent-app/src-tauri/Cargo.toml** — `version` field in `[package]`
5. **agent/src/agent.ts** — hardcoded `agentVersion` string in the `AgentClient` constructor call
6. **agent/src/agent.ts** — hardcoded `agent_version` string in the `state_update` message

## Procedure

1. Update all 6 files to the new version.
2. Verify by grepping for both the OLD and NEW version strings — old should return zero results, new should return exactly 6 matches.
3. Commit with message: `chore: bump agent version to vX.Y.Z`
4. Create git tag: `agent-vX.Y.Z`
5. Push commit and tag (the tag push triggers the CI build workflow).

## Version format

Use semantic versioning: `X.Y.Z` (no `v` prefix in files, but the git tag uses `agent-vX.Y.Z`).

## CI trigger

The build workflow (`.github/workflows/build-agent-app.yml`) triggers on `push: tags: ["agent-v*"]`. A tag push creates the GitHub release and builds signed binaries for all platforms.
