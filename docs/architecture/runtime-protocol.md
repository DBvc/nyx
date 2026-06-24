# Nyx Runtime Protocol

Status: Draft.

This document describes the future boundary between Electron main and the OCaml runtime.

## Current Phase

No runtime communication exists yet.

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

## First Future Protocol Spike

```json
{"type":"ping","id":"req_1"}
{"type":"pong","id":"req_1"}
```

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
