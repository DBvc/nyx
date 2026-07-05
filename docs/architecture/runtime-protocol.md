# Nyx Runtime Protocol

Status: Draft.

This document describes the boundary between Electron main and the OCaml runtime.

## Current Phase

Electron main now has two explicit, main-only runtime boundaries:

- runtime health verification
- default runtime-backed chat state

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

The desktop chat path now uses runtime-backed chat state by default. Only
Electron main's `ChatSessionManager` may use the runtime-backed chat state
adapter, and `NYX_RUNTIME_CHAT_STATE=0` exists only as a diagnostic disable.
When that diagnostic disable is set, Electron main must not resolve or spawn the
runtime for chat and must use the no-runtime chat state path.

This runtime boundary must not resolve, spawn, ping, or protocol-check the
runtime during app startup or BrowserWindow lifecycle. It also does not move
provider calls, preload, renderer, or UI into the runtime.

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
- Electron main protocol session verification scaffold

The runtime-side scaffold lives under `runtime/ocaml`. The only desktop
runtime work in this artifact path is explicit verification. It is not part of
app startup, renderer IPC, or packaged distribution.

## Default Runtime-Backed Chat State

Runtime-backed chat state is enabled by default for Electron main's desktop chat
path. `ChatSessionManager` uses a main-owned runtime chat state client to send
the existing
`chat_reducer_action` protocol messages to `nyx-runtime protocol` and validate
matching `chat_reducer_state` responses.

The default path covers the current chat turn lifecycle inside Electron main:
new user message, retry failed response, assistant start, streaming delta,
complete, cancel, fail, and reset/clear. The runtime state is an internal
semantic gate for Electron main only. It is not renderer state and is not a new
shared IPC or preload contract.

Failure recovery keeps the existing v1 min chat behavior: after a provider
failure, a retry reuses the failed turn's user and assistant identity, while a
new user message submits a distinct user and assistant identity. The OCaml chat
reducer preserves the committed transcript, does not commit the failed assistant
draft, and starts the fresh turn from the new user message. Renderer
`resetChatSession()` awaits Electron main's async runtime clear/close cleanup.

The runtime chat state client is scoped to the owning Electron `WebContents`
that starts the runtime-backed chat path. A reset clears only that owner's
runtime state. Each `WebContents` gets its own runtime session, and a destroyed
owner closes its runtime session and aborts any active turn. This keeps runtime
state tied to the current desktop chat owner instead of becoming process-global
state.

When `NYX_RUNTIME_CHAT_STATE` is unset, desktop chat must use the runtime-backed
chat state path. `NYX_RUNTIME_CHAT_STATE=0` is the only diagnostic disable. In
that disabled mode, desktop chat must not resolve or spawn the runtime and the
no-runtime chat state path remains available for diagnosis.

When runtime-backed chat state is enabled, runtime setup, protocol request,
response shape, and reducer invariant failures are authoritative for that turn.
Electron main must fail the turn as a non-retryable chat error and discard the
runtime chat state client when one exists. It must not silently fall back to the
no-runtime diagnostic path.

Ownership rules:

- Electron main owns provider configuration, provider credentials, environment
  variable reads, provider calls, abort/cancel handles, runtime child process
  lifecycle, and OS side effects.
- OCaml runtime owns only the typed chat reducer semantics exposed through the
  existing local protocol. It does not own provider integration, environment
  access, preload, renderer, or UI.
- preload and renderer do not read runtime state, provider secrets, provider
  configuration, or environment variables.
- renderer never talks to the runtime directly.

This is not runtime provider integration. The runtime must not call model
providers, read provider env, hold provider tokens, choose models, or shape the
provider request body.

This is also not a renderer/preload API, not packaged runtime distribution, and
not an agent, tool, plugin, artifact, history, settings, model picker,
markdown, multimodal, or cloud-sync capability.

The real-runtime verification entrypoint is:

- `mise run runtime:chat-state:check`

That task prepares the generated runtime artifact, sets an explicit
`NYX_RUNTIME_PATH`, unsets `NYX_RUNTIME_CHAT_STATE`, enables the dedicated
integration test gate, and runs the runtime-backed chat state integration test
with a mocked provider stream. Normal `mise run desktop:test` keeps this
integration test skipped.

Default-on has been chosen for this path. The next boundary not solved here is
packaged desktop runtime binary distribution and packaged path resolution.
Do not add more pure shadow-only preparation tasks for this path.

## Runtime Protocol Session Helper

Electron main owns a main-only protocol session helper:

- `apps/desktop/electron/main/runtime/protocol-session.ts`

The helper is a transport and lifecycle boundary for a long-lived
`nyx-runtime protocol` child process. It sends one NDJSON request per line,
correlates protocol responses by `id`, tracks pending requests, applies request
timeouts, normalizes protocol/process/stdin failures, and closes pending
requests when the session is disposed or the runtime exits.

The helper is intentionally generic at the transport layer only. It must not
become a chat API, runtime manager, supervisor, reconnect loop, event bus,
provider adapter, or product state owner. In this phase it has no authority over
desktop chat state, provider requests, model streaming, retries, cancellation,
or message identity.

Allowed consumers in this phase:

- Electron main unit tests for the helper.
- Explicit integration checks that provide a runtime executable with
  `NYX_RUNTIME_PATH`.
- The main-owned runtime chat state client when runtime-backed chat state is not
  diagnostically disabled.

Disallowed consumers in this phase:

- app startup
- BrowserWindow lifecycle
- provider client or provider adapter code
- preload
- renderer
- UI
- shared chat IPC
- packaged app runtime distribution

The real-runtime verification entrypoint is:

- `mise run runtime:protocol-session:check`

That task prepares the generated runtime artifact, sets
`NYX_RUNTIME_PATH=apps/desktop/.runtime-artifacts/nyx-runtime`, enables the
dedicated `NYX_RUNTIME_PROTOCOL_SESSION=1` test gate, and runs
`apps/desktop/electron/main/runtime/protocol-session.integration.test.ts`.
Normal `mise run desktop:test` runs the test suite with this integration test
skipped. This keeps the generated artifact outside the default runtime resolver
and outside ordinary desktop test setup.

## Chat Reducer Protocol Proof

`runtime-chat-reducer-protocol-proof` was a verification-only slice. Its purpose
was to prove that Electron main-side test code could drive the existing OCaml
chat reducer session scaffold through `nyx-runtime protocol` when the runtime
binary was provided explicitly.

This proof used the generated runtime artifact only through an explicit
`NYX_RUNTIME_PATH` override. The artifact path must remain outside the default
runtime resolver candidate list and must not become a packaged app distribution
contract.

The proof was intentionally not a shadow runtime, not chat core integration, and
not product integration. That proof did not connect the runtime to:

- app startup
- BrowserWindow lifecycle
- `ChatSessionManager`
- provider streaming
- preload
- renderer
- UI
- shared chat IPC

It did not introduce a production runtime client, runtime manager, exported
session helper, or reusable chat-core abstraction. Any process helper used for
that proof stayed test-local or otherwise test-only.

The proof asserted fixed lifecycle fixtures for the OCaml reducer semantics,
such as complete, cancel, fail, clear, and retry of a failed turn. Those
fixtures were evidence for the protocol scaffold only. The runtime-backed chat
state path is the separate main-only integration that uses this evidence
without moving provider ownership, renderer state, preload IPC, or UI into the
runtime.

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

## Shadow-Only Boundary Is Closed

For the runtime-backed chat state path, pure shadow-only preparation is no
longer the next step. The main-only runtime-backed chat state integration is
default-on for Electron main chat state.

Future shadow or comparison work is allowed only when it is tied to a concrete
blocker for packaged distribution or a named runtime-state correctness issue.
It must not be used as another generic prerequisite before using the default
runtime-backed chat state path.

Any future comparison still must not change provider credential ownership:
Electron main continues to own provider configuration and secrets, and the
renderer continues not to read them.

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
