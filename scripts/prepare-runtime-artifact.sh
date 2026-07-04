#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
RUNTIME_DIR="$ROOT/runtime/ocaml"
SOURCE_BINARY="$RUNTIME_DIR/_build/install/default/bin/nyx-runtime"
ARTIFACT_DIR="$ROOT/apps/desktop/.runtime-artifacts"
ARTIFACT_PATH="$ARTIFACT_DIR/nyx-runtime"
TMP_ARTIFACT=""

fail() {
  printf 'runtime artifact prepare failed: %s\n' "$1" >&2
  exit 1
}

cleanup() {
  if [ -n "${TMP_ARTIFACT:-}" ] && [ -e "$TMP_ARTIFACT" ]; then
    rm -f "$TMP_ARTIFACT"
  fi
}

trap cleanup EXIT

[ -d "$RUNTIME_DIR" ] || fail "runtime directory is missing: $RUNTIME_DIR"
[ -f "$RUNTIME_DIR/dune-project" ] || fail "runtime dune project is missing: $RUNTIME_DIR/dune-project"

printf '[runtime:artifact:prepare] building OCaml runtime install output\n'
(
  cd "$RUNTIME_DIR"
  opam exec -- dune build @install
)

[ -f "$SOURCE_BINARY" ] || fail "source binary is missing: $SOURCE_BINARY"
[ -x "$SOURCE_BINARY" ] || fail "source binary is not executable: $SOURCE_BINARY"

mkdir -p "$ARTIFACT_DIR"

if [ -e "$ARTIFACT_PATH" ] && [ ! -f "$ARTIFACT_PATH" ]; then
  fail "artifact path exists but is not a file: $ARTIFACT_PATH"
fi

TMP_ARTIFACT="$(mktemp "$ARTIFACT_DIR/nyx-runtime.tmp.XXXXXX")"
cp -f "$SOURCE_BINARY" "$TMP_ARTIFACT"
chmod 0755 "$TMP_ARTIFACT"

[ -f "$TMP_ARTIFACT" ] || fail "temporary artifact was not created: $TMP_ARTIFACT"
[ -x "$TMP_ARTIFACT" ] || fail "temporary artifact is not executable: $TMP_ARTIFACT"

mv -f "$TMP_ARTIFACT" "$ARTIFACT_PATH"
TMP_ARTIFACT=""

[ -f "$ARTIFACT_PATH" ] || fail "artifact was not created: $ARTIFACT_PATH"
[ -x "$ARTIFACT_PATH" ] || fail "artifact is not executable: $ARTIFACT_PATH"

if ! PING_OUTPUT="$("$ARTIFACT_PATH" ping)"; then
  fail "artifact ping command failed: $ARTIFACT_PATH ping"
fi

[ "$PING_OUTPUT" = "pong" ] || fail "artifact ping returned unexpected output: $PING_OUTPUT"

printf '[runtime:artifact:prepare] source: %s\n' "$SOURCE_BINARY"
printf '[runtime:artifact:prepare] artifact: %s\n' "$ARTIFACT_PATH"
printf '[runtime:artifact:prepare] ping: %s\n' "$PING_OUTPUT"
