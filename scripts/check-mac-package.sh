#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
FLAVOR="${1:-${NYX_PACKAGE_FLAVOR:-dev}}"

case "$FLAVOR" in
  dev)
    APP_ID="dev.dbvc.nyx"
    PRODUCT_NAME="Nyx Dev"
    ARTIFACT_PREFIX="nyx-dev"
    ;;
  prod)
    APP_ID="com.dbvc.nyx"
    PRODUCT_NAME="Nyx"
    ARTIFACT_PREFIX="nyx"
    ;;
  *)
    printf 'mac package verify failed: unsupported flavor: %s\n' "$FLAVOR" >&2
    exit 1
    ;;
esac

fail() {
  printf 'mac package verify failed: %s\n' "$1" >&2
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

PACKAGE_VERSION="$(cd "$ROOT" && node -p "require('./apps/desktop/package.json').version")"
OUT_DIR="$ROOT/apps/desktop/dist/mac-$FLAVOR"
APP_PATH="$OUT_DIR/mac-arm64/$PRODUCT_NAME.app"
INFO_PLIST="$APP_PATH/Contents/Info.plist"
RUNTIME_PATH="$APP_PATH/Contents/Resources/runtime/nyx-runtime"
DMG_PATH="$OUT_DIR/$ARTIFACT_PREFIX-$PACKAGE_VERSION-mac-arm64.dmg"
ZIP_PATH="$OUT_DIR/$ARTIFACT_PREFIX-$PACKAGE_VERSION-mac-arm64.zip"

[ -d "$APP_PATH" ] || fail "app bundle is missing: $APP_PATH"
[ -f "$INFO_PLIST" ] || fail "Info.plist is missing: $INFO_PLIST"
[ -f "$DMG_PATH" ] || fail "DMG artifact is missing: $DMG_PATH"
[ -f "$ZIP_PATH" ] || fail "ZIP artifact is missing: $ZIP_PATH"
[ -f "$RUNTIME_PATH" ] || fail "packaged runtime is missing: $RUNTIME_PATH"
[ -x "$RUNTIME_PATH" ] || fail "packaged runtime is not executable: $RUNTIME_PATH"
assert_arm64_binary "$RUNTIME_PATH"

BUNDLE_ID="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$INFO_PLIST")"
[ "$BUNDLE_ID" = "$APP_ID" ] || fail "unexpected CFBundleIdentifier: $BUNDLE_ID"

BUNDLE_NAME="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleName' "$INFO_PLIST")"
[ "$BUNDLE_NAME" = "$PRODUCT_NAME" ] || fail "unexpected CFBundleName: $BUNDLE_NAME"

if ! PING_OUTPUT="$("$RUNTIME_PATH" ping)"; then
  fail "packaged runtime ping command failed: $RUNTIME_PATH ping"
fi

[ "$PING_OUTPUT" = "pong" ] || fail "packaged runtime ping returned unexpected output: $PING_OUTPUT"

pnpm --dir "$ROOT/apps/desktop" exec vitest run electron/main/runtime/path.test.ts

printf '[desktop:package:mac:verify] flavor: %s\n' "$FLAVOR"
printf '[desktop:package:mac:verify] app: %s\n' "$APP_PATH"
printf '[desktop:package:mac:verify] bundle id: %s\n' "$BUNDLE_ID"
printf '[desktop:package:mac:verify] runtime: %s\n' "$RUNTIME_PATH"
printf '[desktop:package:mac:verify] runtime ping: %s\n' "$PING_OUTPUT"
printf '[desktop:package:mac:verify] dmg: %s\n' "$DMG_PATH"
printf '[desktop:package:mac:verify] zip: %s\n' "$ZIP_PATH"
