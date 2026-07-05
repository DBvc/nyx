#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
FLAVOR="${1:-${NYX_PACKAGE_FLAVOR:-dev}}"
ZIP_VERIFY_DIR=""

case "$FLAVOR" in
  dev)
    APP_ID="dev.dbvc.nyx"
    PRODUCT_NAME="Nyx Dev"
    ARTIFACT_PREFIX="nyx-dev"
    UPDATE_CHANNEL="dev"
    UPDATE_FEED_ENV="NYX_DEV_UPDATE_FEED_URL"
    ;;
  prod)
    APP_ID="com.dbvc.nyx"
    PRODUCT_NAME="Nyx"
    ARTIFACT_PREFIX="nyx"
    UPDATE_CHANNEL="latest"
    UPDATE_FEED_ENV="NYX_PROD_UPDATE_FEED_URL"
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

assert_distribution_artifact() {
  local artifact_path="$1"
  local artifact_label="$2"

  [ -s "$artifact_path" ] || fail "$artifact_label artifact is empty: $artifact_path"
}

cleanup() {
  if [ -n "$ZIP_VERIFY_DIR" ] && [ -d "$ZIP_VERIFY_DIR" ]; then
    rm -rf "$ZIP_VERIFY_DIR"
  fi
}

trap cleanup EXIT

assert_zip_artifact() {
  local zip_app_path
  local zip_info_plist
  local zip_runtime_path
  local zip_bundle_id
  local zip_bundle_name
  local zip_bundle_version
  local zip_ping_output

  if ! ZIP_TEST_OUTPUT="$(unzip -tq "$ZIP_PATH" 2>&1)"; then
    fail "ZIP artifact verification failed: $ZIP_TEST_OUTPUT"
  fi

  ZIP_VERIFY_DIR="$(mktemp -d "${TMPDIR:-/tmp}/nyx-mac-zip.XXXXXX")" ||
    fail "could not create temporary ZIP verification directory"

  if ! ZIP_EXTRACT_OUTPUT="$(unzip -q "$ZIP_PATH" -d "$ZIP_VERIFY_DIR" 2>&1)"; then
    fail "ZIP artifact extraction failed: $ZIP_EXTRACT_OUTPUT"
  fi

  zip_app_path="$ZIP_VERIFY_DIR/$PRODUCT_NAME.app"
  zip_info_plist="$zip_app_path/Contents/Info.plist"
  zip_runtime_path="$zip_app_path/Contents/Resources/runtime/nyx-runtime"

  [ -d "$zip_app_path" ] || fail "ZIP artifact is missing app bundle: $PRODUCT_NAME.app"
  [ -f "$zip_info_plist" ] || fail "ZIP artifact is missing Info.plist: $zip_info_plist"
  [ -f "$zip_runtime_path" ] || fail "ZIP artifact is missing packaged runtime: $zip_runtime_path"
  [ -x "$zip_runtime_path" ] || fail "ZIP artifact packaged runtime is not executable: $zip_runtime_path"
  assert_arm64_binary "$zip_runtime_path"

  zip_bundle_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$zip_info_plist")"
  [ "$zip_bundle_id" = "$APP_ID" ] || fail "unexpected ZIP CFBundleIdentifier: $zip_bundle_id"

  zip_bundle_name="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleName' "$zip_info_plist")"
  [ "$zip_bundle_name" = "$PRODUCT_NAME" ] || fail "unexpected ZIP CFBundleName: $zip_bundle_name"

  zip_bundle_version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$zip_info_plist")"
  [ "$zip_bundle_version" = "$PACKAGE_VERSION" ] ||
    fail "unexpected ZIP CFBundleShortVersionString: $zip_bundle_version"

  if ! zip_ping_output="$("$zip_runtime_path" ping)"; then
    fail "ZIP artifact packaged runtime ping command failed: $zip_runtime_path ping"
  fi

  [ "$zip_ping_output" = "pong" ] || fail "ZIP artifact packaged runtime ping returned unexpected output: $zip_ping_output"
}

normalize_feed_url() {
  local value="${1:-}"
  value="${value%"${value##*[![:space:]]}"}"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%/}"
  printf '%s' "$value"
}

PACKAGE_VERSION="$(cd "$ROOT" && node -p "require('./apps/desktop/package.json').version")"
OUT_DIR="$ROOT/apps/desktop/dist/mac-$FLAVOR"
APP_PATH="$OUT_DIR/mac-arm64/$PRODUCT_NAME.app"
INFO_PLIST="$APP_PATH/Contents/Info.plist"
RUNTIME_PATH="$APP_PATH/Contents/Resources/runtime/nyx-runtime"
APP_UPDATE_CONFIG="$APP_PATH/Contents/Resources/app-update.yml"
DMG_PATH="$OUT_DIR/$ARTIFACT_PREFIX-$PACKAGE_VERSION-mac-arm64.dmg"
ZIP_PATH="$OUT_DIR/$ARTIFACT_PREFIX-$PACKAGE_VERSION-mac-arm64.zip"
UPDATE_METADATA_PATH="$OUT_DIR/$UPDATE_CHANNEL-mac.yml"

[ -d "$APP_PATH" ] || fail "app bundle is missing: $APP_PATH"
[ -f "$INFO_PLIST" ] || fail "Info.plist is missing: $INFO_PLIST"
[ -f "$DMG_PATH" ] || fail "DMG artifact is missing: $DMG_PATH"
[ -f "$ZIP_PATH" ] || fail "ZIP artifact is missing: $ZIP_PATH"
[ -f "$RUNTIME_PATH" ] || fail "packaged runtime is missing: $RUNTIME_PATH"
[ -x "$RUNTIME_PATH" ] || fail "packaged runtime is not executable: $RUNTIME_PATH"
assert_arm64_binary "$RUNTIME_PATH"
command -v hdiutil >/dev/null || fail "hdiutil is required to verify the DMG artifact"
command -v unzip >/dev/null || fail "unzip is required to verify the ZIP artifact"
assert_distribution_artifact "$DMG_PATH" "DMG"
assert_distribution_artifact "$ZIP_PATH" "ZIP"

if ! DMG_VERIFY_OUTPUT="$(hdiutil verify "$DMG_PATH" 2>&1)"; then
  fail "DMG artifact verification failed: $DMG_VERIFY_OUTPUT"
fi

assert_zip_artifact

BUNDLE_ID="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$INFO_PLIST")"
[ "$BUNDLE_ID" = "$APP_ID" ] || fail "unexpected CFBundleIdentifier: $BUNDLE_ID"

BUNDLE_NAME="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleName' "$INFO_PLIST")"
[ "$BUNDLE_NAME" = "$PRODUCT_NAME" ] || fail "unexpected CFBundleName: $BUNDLE_NAME"

if ! PING_OUTPUT="$("$RUNTIME_PATH" ping)"; then
  fail "packaged runtime ping command failed: $RUNTIME_PATH ping"
fi

[ "$PING_OUTPUT" = "pong" ] || fail "packaged runtime ping returned unexpected output: $PING_OUTPUT"

UPDATE_FEED_URL="$(normalize_feed_url "${!UPDATE_FEED_ENV:-}")"
DEV_UPDATE_FEED_URL="$(normalize_feed_url "${NYX_DEV_UPDATE_FEED_URL:-}")"
PROD_UPDATE_FEED_URL="$(normalize_feed_url "${NYX_PROD_UPDATE_FEED_URL:-}")"

if [ -n "$DEV_UPDATE_FEED_URL" ] && [ -n "$PROD_UPDATE_FEED_URL" ] &&
  [ "$DEV_UPDATE_FEED_URL" = "$PROD_UPDATE_FEED_URL" ]; then
  fail "NYX_DEV_UPDATE_FEED_URL and NYX_PROD_UPDATE_FEED_URL must not point at the same update feed"
fi

if [ -n "$UPDATE_FEED_URL" ]; then
  [ -f "$APP_UPDATE_CONFIG" ] || fail "app-update.yml is missing for configured update feed: $APP_UPDATE_CONFIG"
  [ -f "$UPDATE_METADATA_PATH" ] || fail "update metadata is missing: $UPDATE_METADATA_PATH"
  grep -F -q "provider: generic" "$APP_UPDATE_CONFIG" ||
    fail "app-update.yml must use the generic provider"
  grep -F -q "url: $UPDATE_FEED_URL" "$APP_UPDATE_CONFIG" ||
    fail "app-update.yml does not match $UPDATE_FEED_ENV"
  grep -F -q "channel: $UPDATE_CHANNEL" "$APP_UPDATE_CONFIG" ||
    fail "app-update.yml must use channel '$UPDATE_CHANNEL'"
  grep -F -q "version: $PACKAGE_VERSION" "$UPDATE_METADATA_PATH" ||
    fail "update metadata must describe version $PACKAGE_VERSION"
  grep -F -q "$ARTIFACT_PREFIX-$PACKAGE_VERSION-mac-arm64.zip" "$UPDATE_METADATA_PATH" ||
    fail "update metadata must reference the $FLAVOR ZIP artifact"
else
  [ ! -f "$APP_UPDATE_CONFIG" ] ||
    fail "app-update.yml is present without $UPDATE_FEED_ENV; remove stale update feed config"
fi

pnpm --dir "$ROOT/apps/desktop" exec vitest run electron/main/runtime/path.test.ts

printf '[desktop:package:mac:verify] flavor: %s\n' "$FLAVOR"
printf '[desktop:package:mac:verify] app: %s\n' "$APP_PATH"
printf '[desktop:package:mac:verify] bundle id: %s\n' "$BUNDLE_ID"
printf '[desktop:package:mac:verify] runtime: %s\n' "$RUNTIME_PATH"
printf '[desktop:package:mac:verify] runtime ping: %s\n' "$PING_OUTPUT"
printf '[desktop:package:mac:verify] dmg: %s\n' "$DMG_PATH"
printf '[desktop:package:mac:verify] zip: %s\n' "$ZIP_PATH"
if [ -n "$UPDATE_FEED_URL" ]; then
  printf '[desktop:package:mac:verify] update feed: %s (%s)\n' "$UPDATE_FEED_URL" "$UPDATE_CHANNEL"
  printf '[desktop:package:mac:verify] update metadata: %s\n' "$UPDATE_METADATA_PATH"
else
  printf '[desktop:package:mac:verify] update feed: disabled (%s unset)\n' "$UPDATE_FEED_ENV"
fi
