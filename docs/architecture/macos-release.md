# Nyx macOS Release Boundary

Status: Draft.

This document defines the first macOS release engineering boundary for Nyx. It
does not change the current `v1 min chat` product scope.

## Release Identities

Nyx has two macOS application identities:

- Production: `com.dbvc.nyx`
- Development / pre-release: `dev.dbvc.nyx`

The production product name is `Nyx`. The development product name is `Nyx Dev`.
These identities must not share update feeds, artifact names, signing
assumptions, or release channels.

## First Supported macOS Target

The first packaged release target is macOS arm64 only.

Do not generate, document, or publish x64 or universal macOS artifacts until the
OCaml runtime build strategy for those architectures is designed and verified.
An Electron shell must not claim universal support while the packaged
`nyx-runtime` binary is arm64-only.

## Provider Configuration Non-Goal

Provider configuration remains outside this release-boundary task. The packaged
app may show the existing provider missing state when launched without
`NYX_API_BASE_URL` or `NYX_API_TOKEN`. `NYX_MODEL` remains optional and may use
the Electron main default.

This release work must not add:

- settings UI
- `.config` provider loading
- Keychain storage
- model picker UI
- renderer access to provider configuration

Provider credentials and provider calls remain owned by Electron main.

## Packaged Runtime Contract

The packaged macOS app must include the OCaml runtime executable inside the app
bundle:

```text
Nyx.app/Contents/Resources/runtime/nyx-runtime
```

In packaged mode, Electron main must resolve the runtime only from:

```text
process.resourcesPath/runtime/nyx-runtime
```

This packaged resolver must fail closed:

- no `NYX_RUNTIME_PATH` override in packaged mode
- no repo development fallback in packaged mode
- no silent fallback to `runtime/ocaml/_build/install/default/bin/nyx-runtime`
- no use of `apps/desktop/.runtime-artifacts/nyx-runtime`

A missing packaged runtime is a release failure. It is not a provider
configuration issue and must not be hidden by local development paths.

## Artifact Boundaries

`apps/desktop/.runtime-artifacts/nyx-runtime` remains a local generated artifact
for explicit runtime verification. It is not a source of truth and must not be
used as the packaged app distribution contract.

The packaged release flow uses a separate gitignored package staging path when
staging the runtime for `electron-builder`:

```text
apps/desktop/.package-resources/runtime/nyx-runtime
```

Generated release artifacts such as `.dmg`, `.zip`, `latest-mac.yml`, blockmaps,
and notarized app bundles are release outputs. They must not be committed.
Package commands must clean the current flavor output directory before invoking
`electron-builder` so stale artifacts from a previous feed or signing mode
cannot be mistaken for the current package result.
Package verification must check the generated app bundle and the final
distribution artifacts. The DMG must pass local image verification and
read-only mounted payload verification. The ZIP artifact must pass full archive
verification. Both final artifacts must contain the matching `.app` bundle with
its `Info.plist` and packaged `runtime/nyx-runtime`.

## Signing And Update Boundary

Production releases require Developer ID signing, hardened runtime,
notarization, and stapling before they are treated as production release
artifacts. Missing Apple credentials should fail or block the production release
path; they must not silently downgrade production to an unsigned release.

The production package command must pass a local/CI signing preflight before
`electron-builder` runs. The host must provide `notarytool`, `stapler`,
`codesign`, and `spctl`. Signing may use `CSC_LINK`, `CSC_NAME`, or an
installed Developer ID Application identity, and one complete notarization
credential set: `APPLE_API_KEY` / `APPLE_API_KEY_ID` / `APPLE_API_ISSUER`,
`APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID`, or
`APPLE_KEYCHAIN_PROFILE` with optional `APPLE_KEYCHAIN`. These are process
environment names only; credential values must not be committed.

Automatic update support must be main-process owned and package-aware. It must
not add renderer update UI in the first release slice. Development and
production update feeds must remain isolated by identity and channel.
`NYX_DEV_UPDATE_FEED_URL` configures the `dev.dbvc.nyx` / `dev` feed, and
`NYX_PROD_UPDATE_FEED_URL` configures the `com.dbvc.nyx` / `latest` feed. These
URLs are public release locations, not secrets, and they must not point at the
same base URL. If a packaged app has neither a generated `app-update.yml` nor
the matching feed URL environment variable, main-process auto update stays
disabled.

## GitHub Release Workflow

The macOS release workflow is tag-triggered for `v*` tags and must run on a
standard Apple Silicon macOS runner, currently `macos-14`. This is required
because the packaged `nyx-runtime` binary must be arm64-only; an Intel macOS
runner must fail before packaging instead of producing a mismatched Electron
shell and runtime.

The workflow installs JavaScript and OCaml dependencies, verifies the desktop
static checks, verifies runtime-backed chat state, builds the desktop app,
packages the production macOS arm64 app, verifies Developer ID signing,
notarization, stapling, Gatekeeper assessment, packaged runtime payload, update
metadata, and uploads release artifacts to the GitHub Release for the tag.

Required GitHub configuration:

- `MACOS_CERTIFICATE_P12_BASE64` secret: base64-encoded Developer ID
  Application `.p12` certificate.
- `MACOS_CERTIFICATE_PASSWORD` secret: password for the `.p12` certificate.
- `APPLE_API_KEY` secret: App Store Connect API key `.p8` file content.
- `APPLE_API_KEY_ID` secret: key id for `APPLE_API_KEY`.
- `APPLE_API_ISSUER` secret: issuer id for `APPLE_API_KEY`.
- `NYX_PROD_UPDATE_FEED_URL` repository variable or secret: public production
  update feed base URL for `com.dbvc.nyx` / `latest`.

If any required signing, notarization, or update-feed input is unavailable, the
workflow must fail during preflight. It must not publish or upload unsigned
production artifacts.

## Out Of Scope

This release boundary does not add or change:

- persistent chat history
- settings UI
- model picker UI
- Markdown rendering
- tools, agents, plugins, or artifacts
- cloud sync
- multimodal support
- OCaml provider calls
- FFI
- Windows, Linux, MAS, PKG, x64, or universal packaging
