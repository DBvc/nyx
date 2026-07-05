#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
ARTIFACT_PATH="$ROOT/apps/desktop/.runtime-artifacts/nyx-runtime"

fail() {
  printf 'runtime chat state check failed: %s\n' "$1" >&2
  exit 1
}

"$ROOT/scripts/prepare-runtime-artifact.sh"

[ -f "$ARTIFACT_PATH" ] || fail "artifact is missing: $ARTIFACT_PATH"
[ -x "$ARTIFACT_PATH" ] || fail "artifact is not executable: $ARTIFACT_PATH"

printf '[runtime:chat-state:check] NYX_RUNTIME_PATH=%s\n' "$ARTIFACT_PATH"

env -u NYX_RUNTIME_CHAT_STATE \
  NYX_RUNTIME_PATH="$ARTIFACT_PATH" \
  NYX_RUNTIME_CHAT_STATE_INTEGRATION=1 \
  pnpm --dir "$ROOT/apps/desktop" exec vitest run electron/main/chat/session-runtime-chat-state.integration.test.ts
