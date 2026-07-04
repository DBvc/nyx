# Nyx Runtime Protocol

Status: Draft.

This document describes the future boundary between Electron main and the OCaml runtime.

## Current Phase

No runtime communication exists yet.

The OCaml runtime does have a local CLI protocol scaffold for runtime verification. This scaffold is not wired to Electron.

Current local entrypoints:

- `nyx-runtime ping`
- `nyx-runtime protocol`

Current local protocol scope:

- ping/pong request-response
- chat reducer session verification scaffold

The scaffold lives under `runtime/ocaml` and must not be treated as desktop integration.

## Future Direction

Electron main will spawn the OCaml runtime as a child process.

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
