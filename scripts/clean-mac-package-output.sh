#!/usr/bin/env bash
set -euo pipefail

FLAVOR="${1:-${NYX_PACKAGE_FLAVOR:-dev}}"

case "$FLAVOR" in
  dev | prod) ;;
  *)
    printf 'mac package clean failed: unsupported flavor: %s\n' "$FLAVOR" >&2
    exit 1
    ;;
esac

fail() {
  printf 'mac package clean failed: %s\n' "$1" >&2
  exit 1
}

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUT_DIR="$ROOT/apps/desktop/dist/mac-$FLAVOR"

[ -f "$ROOT/apps/desktop/package.json" ] || fail "desktop package.json is missing under repo root: $ROOT"
[ -f "$ROOT/apps/desktop/electron-builder.config.mjs" ] ||
  fail "electron-builder config is missing under repo root: $ROOT"

case "$OUT_DIR" in
  "$ROOT/apps/desktop/dist/mac-dev" | "$ROOT/apps/desktop/dist/mac-prod") ;;
  *) fail "refusing to clean unexpected output directory: $OUT_DIR" ;;
esac

if [ -e "$OUT_DIR" ] && [ ! -d "$OUT_DIR" ]; then
  fail "output path exists but is not a directory: $OUT_DIR"
fi

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

printf '[desktop:package:mac:clean] flavor: %s\n' "$FLAVOR"
printf '[desktop:package:mac:clean] output: %s\n' "$OUT_DIR"
