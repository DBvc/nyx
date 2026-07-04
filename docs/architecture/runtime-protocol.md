# Nyx Runtime Protocol

Status: Draft.

This document describes the boundary between Electron main and the OCaml runtime.

## Current Phase

Electron main now has an explicit, main-only runtime health boundary.

The desktop app can resolve a `nyx-runtime` executable and, when explicitly
called from Electron main code, verify the local protocol scaffold with a
ping/pong request over `nyx-runtime protocol`.

This boundary is intentionally narrow:

- Electron main owns runtime path resolution, child process lifecycle, timeout
  handling, and error normalization.
- `NYX_RUNTIME_PATH` is a main-process development/test override only.
- A local repo fallback may point at `runtime/ocaml/_build/install/default/bin/nyx-runtime`
  for development and tests.
- Missing runtime binaries are reported as structured unavailable results.

This boundary is not connected to app startup, BrowserWindow lifecycle, the
chat session manager, provider calls, preload, renderer, or UI.

The local repo fallback is not a packaged app distribution contract.

## Generated Runtime Artifact

`apps/desktop/.runtime-artifacts/nyx-runtime` is reserved for a local generated
copy of the OCaml runtime executable.

This artifact exists to prove that desktop tooling can prepare a runtime binary
and that Electron main can consume it through an explicit `NYX_RUNTIME_PATH`
override. It is not a source of truth, is not committed, and is not a packaged
app distribution contract.

The artifact path must not be added to the default runtime resolver candidate
list in this phase. Until packaged app distribution is explicitly designed,
Electron main may consume this artifact only through explicit verification
commands that set `NYX_RUNTIME_PATH`.

Current local entrypoints:

- `nyx-runtime ping`
- `nyx-runtime protocol`

Current local protocol scope:

- ping/pong request-response
- chat reducer session verification scaffold

The runtime-side scaffold lives under `runtime/ocaml`. The only desktop
integration in this phase is the explicit health boundary described below.

## Desktop Health Boundary

Electron main owns the current desktop-side health check implementation:

- `apps/desktop/electron/main/runtime/path.ts`
- `apps/desktop/electron/main/runtime/ping.ts`
- `apps/desktop/electron/main/runtime/health.ts`

`checkNyxRuntimeHealth()` is an internal Electron main helper. It resolves the
runtime path, invokes the existing protocol ping helper, and returns one of:

- `success`: the runtime answered with a matching pong id.
- `unavailable`: no configured or local development runtime executable exists.
- `error`: the runtime process failed to spawn, exited unsuccessfully, timed out,
  or returned an invalid protocol response.

The health result is not a shared contract. It must not be exported through
preload, renderer IPC, settings UI, provider status UI, or chat state.

## Protocol Direction

Electron main is the only desktop process that may spawn the OCaml runtime as a
child process. The current health boundary already uses this ownership rule for
ping/pong; broader runtime workflows must keep the same process boundary.

Transport:

- stdio
- NDJSON
- one JSON message per line

Rules:

- stdout is protocol only
- stderr is logs only
- each request has an id
- Electron main owns process lifecycle
- renderer never talks to the runtime directly

## Current Ping/Pong Scaffold

```json
{"type":"ping","id":"req_1"}
{"type":"pong","id":"req_1"}
```

When invoked through protocol mode, stdout is reserved for protocol responses and stderr is reserved for diagnostics.

Electron main's health boundary currently exercises only this ping/pong
scaffold. It does not make OCaml authoritative for chat state or provider
requests.

## Later Protocol Concepts

Later messages may include:

- `start_turn`
- `cancel_turn`
- `runtime_event`
- `model_completion_request`
- `model_completion_delta`
- `tool_call_requested`
- `tool_result`
- `permission_required`

Do not implement these in the structural migration pass.
