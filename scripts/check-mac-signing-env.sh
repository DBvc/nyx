#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf 'mac signing preflight failed: %s\n' "$1" >&2
  exit 1
}

has_env() {
  [ -n "${!1:-}" ]
}

has_developer_id_identity() {
  command -v security >/dev/null || return 1
  security find-identity -v -p codesigning 2>/dev/null | grep -q 'Developer ID Application'
}

has_signing_source() {
  has_env CSC_LINK || has_env CSC_NAME || has_developer_id_identity
}

has_notary_api_key() {
  has_env APPLE_API_KEY && has_env APPLE_API_KEY_ID && has_env APPLE_API_ISSUER
}

has_notary_apple_id() {
  has_env APPLE_ID && has_env APPLE_APP_SPECIFIC_PASSWORD && has_env APPLE_TEAM_ID
}

has_notary_keychain_profile() {
  has_env APPLE_KEYCHAIN_PROFILE
}

missing_notary_message() {
  cat <<'MESSAGE'
notarization credentials are missing; set one complete credential set:
- APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER
- APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
- APPLE_KEYCHAIN_PROFILE, optionally APPLE_KEYCHAIN
MESSAGE
}

command -v xcrun >/dev/null || fail 'xcrun is required for notarization and stapling'
xcrun --find notarytool >/dev/null || fail 'notarytool is required for notarization'
xcrun --find stapler >/dev/null || fail 'stapler is required for notarization ticket stapling'
command -v codesign >/dev/null || fail 'codesign is required for production signing verification'
command -v spctl >/dev/null || fail 'spctl is required for Gatekeeper verification'

if ! has_signing_source; then
  fail 'Developer ID signing source is missing; set CSC_LINK or CSC_NAME, or install a Developer ID Application identity in the keychain'
fi

if ! has_notary_api_key && ! has_notary_apple_id && ! has_notary_keychain_profile; then
  missing_notary_message >&2
  exit 1
fi

printf '[desktop:release:mac:preflight] Developer ID signing source: present\n'
printf '[desktop:release:mac:preflight] notarization credentials: present\n'
