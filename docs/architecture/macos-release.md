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

## Signing And Update Boundary

Production releases require Developer ID signing, hardened runtime,
notarization, and stapling before they are treated as production release
artifacts. Missing Apple credentials should fail or block the production release
path; they must not silently downgrade production to an unsigned release.

Automatic update support must be main-process owned and package-aware. It must
not add renderer update UI in the first release slice. Development and
production update feeds must remain isolated by identity and channel.

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
