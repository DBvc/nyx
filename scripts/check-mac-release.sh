#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
APP_PATH="$ROOT/apps/desktop/dist/mac-prod/mac-arm64/Nyx.app"

fail() {
  printf 'mac release verify failed: %s\n' "$1" >&2
  exit 1
}

"$ROOT/scripts/check-mac-signing-env.sh"
"$ROOT/scripts/check-mac-package.sh" prod

command -v codesign >/dev/null || fail 'codesign is required for release verification'
command -v spctl >/dev/null || fail 'spctl is required for Gatekeeper verification'
command -v xcrun >/dev/null || fail 'xcrun is required for stapler verification'

if ! CODESIGN_VERIFY_OUTPUT="$(codesign --verify --deep --strict --verbose=2 "$APP_PATH" 2>&1)"; then
  fail "codesign verification failed: $CODESIGN_VERIFY_OUTPUT"
fi

CODESIGN_DETAILS="$(codesign -dv --verbose=4 "$APP_PATH" 2>&1)"

printf '%s\n' "$CODESIGN_DETAILS" | grep -q 'Authority=Developer ID Application:' ||
  fail 'app is not signed with a Developer ID Application certificate'

printf '%s\n' "$CODESIGN_DETAILS" | grep -q 'Runtime Version=' ||
  fail 'hardened runtime is missing from the app signature'

if ! STAPLER_OUTPUT="$(xcrun stapler validate "$APP_PATH" 2>&1)"; then
  fail "stapler validation failed: $STAPLER_OUTPUT"
fi

if ! SPCTL_OUTPUT="$(spctl --assess --type execute --verbose=4 "$APP_PATH" 2>&1)"; then
  fail "Gatekeeper assessment failed: $SPCTL_OUTPUT"
fi

printf '[desktop:release:mac:verify] app: %s\n' "$APP_PATH"
printf '[desktop:release:mac:verify] codesign: Developer ID Application, hardened runtime\n'
printf '[desktop:release:mac:verify] stapler: valid\n'
printf '[desktop:release:mac:verify] gatekeeper: accepted\n'
