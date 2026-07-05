#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
RUNTIME_DIR="$ROOT/runtime/ocaml"
SOURCE_BINARY="$RUNTIME_DIR/_build/install/default/bin/nyx-runtime"
PACKAGE_RUNTIME_DIR="$ROOT/apps/desktop/.package-resources/runtime"
PACKAGE_RUNTIME_PATH="$PACKAGE_RUNTIME_DIR/nyx-runtime"
TMP_ARTIFACT=""

fail() {
  printf 'package runtime prepare failed: %s\n' "$1" >&2
  exit 1
}

assert_arm64_binary() {
  local binary_path="$1"
  local archs

  command -v lipo >/dev/null || fail "lipo is required to verify runtime architecture"

  if ! archs="$(lipo -archs "$binary_path")"; then
    fail "could not read runtime architecture: $binary_path"
  fi

  [ "$archs" = "arm64" ] || fail "runtime must be arm64 only, got '$archs': $binary_path"
}

cleanup() {
  if [ -n "${TMP_ARTIFACT:-}" ] && [ -e "$TMP_ARTIFACT" ]; then
    rm -f "$TMP_ARTIFACT"
  fi
}

trap cleanup EXIT

[ -d "$RUNTIME_DIR" ] || fail "runtime directory is missing: $RUNTIME_DIR"
[ -f "$RUNTIME_DIR/dune-project" ] || fail "runtime dune project is missing: $RUNTIME_DIR/dune-project"

printf '[desktop:package:runtime] building OCaml runtime install output\n'
(
  cd "$RUNTIME_DIR"
  opam exec -- dune build @install
)

[ -f "$SOURCE_BINARY" ] || fail "source binary is missing: $SOURCE_BINARY"
[ -x "$SOURCE_BINARY" ] || fail "source binary is not executable: $SOURCE_BINARY"
assert_arm64_binary "$SOURCE_BINARY"

mkdir -p "$PACKAGE_RUNTIME_DIR"

if [ -e "$PACKAGE_RUNTIME_PATH" ] && [ ! -f "$PACKAGE_RUNTIME_PATH" ]; then
  fail "package runtime path exists but is not a file: $PACKAGE_RUNTIME_PATH"
fi

TMP_ARTIFACT="$(mktemp "$PACKAGE_RUNTIME_DIR/nyx-runtime.tmp.XXXXXX")"
cp -f "$SOURCE_BINARY" "$TMP_ARTIFACT"
chmod 0755 "$TMP_ARTIFACT"

[ -f "$TMP_ARTIFACT" ] || fail "temporary package runtime was not created: $TMP_ARTIFACT"
[ -x "$TMP_ARTIFACT" ] || fail "temporary package runtime is not executable: $TMP_ARTIFACT"

mv -f "$TMP_ARTIFACT" "$PACKAGE_RUNTIME_PATH"
TMP_ARTIFACT=""

[ -f "$PACKAGE_RUNTIME_PATH" ] || fail "package runtime was not created: $PACKAGE_RUNTIME_PATH"
[ -x "$PACKAGE_RUNTIME_PATH" ] || fail "package runtime is not executable: $PACKAGE_RUNTIME_PATH"
assert_arm64_binary "$PACKAGE_RUNTIME_PATH"

if ! PING_OUTPUT="$("$PACKAGE_RUNTIME_PATH" ping)"; then
  fail "package runtime ping command failed: $PACKAGE_RUNTIME_PATH ping"
fi

[ "$PING_OUTPUT" = "pong" ] || fail "package runtime ping returned unexpected output: $PING_OUTPUT"

printf '[desktop:package:runtime] source: %s\n' "$SOURCE_BINARY"
printf '[desktop:package:runtime] staged: %s\n' "$PACKAGE_RUNTIME_PATH"
printf '[desktop:package:runtime] ping: %s\n' "$PING_OUTPUT"
