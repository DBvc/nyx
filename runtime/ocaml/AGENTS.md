# runtime/ocaml/AGENTS.md

This directory contains the Nyx OCaml runtime core.

The runtime is intentionally separate from the Electron desktop app. The current
connection is an Electron-main-owned protocol path for runtime verification and
default runtime-backed chat state. Provider calls, provider credentials,
renderer state, preload contracts, and UI remain outside the runtime.

## Purpose

The OCaml runtime will grow into the typed semantic core for future Agent behavior.

It should own:

- message model
- runtime event model
- turn state machine
- future tool scheduling model
- future permission and capability policy model
- future replayable event log
- runtime tests

It should not own:

- desktop UI
- Electron IPC
- provider credentials
- environment variables
- direct model provider calls
- file system side effects
- shell execution
- OS integration

## Current Phase

Current phase includes:

- Dune project
- buildable library
- executable CLI
- minimal domain types
- local runtime protocol scaffold
- unit tests
- formatting setup

The checked-in protocol scaffold is for local runtime verification and the
default Electron-main-only runtime-backed chat state path. `NYX_RUNTIME_CHAT_STATE=0`
exists only as a diagnostic disable.

Do not implement Electron process management, renderer communication, tools, agents, persistence, provider calls, or broader runtime protocol concepts unless the task explicitly asks for them.

## OCaml Version

Use OCaml 5.5.0.

The local opam switch lives in:

```text
runtime/ocaml/_opam
```

Do not commit `_opam`.

## Commands

From repository root:

```bash
./scripts/audit-ocaml-runtime.sh
./scripts/check-runtime.sh
mise run runtime:setup
mise run runtime:build
mise run runtime:test
mise run runtime:format
mise run runtime:format-check
mise run runtime:ping
mise run runtime:check
```

From this directory:

```bash
opam exec -- dune build
opam exec -- dune runtest
opam exec -- dune fmt
opam exec -- dune exec nyx-runtime -- ping
```

## Design Rules

- Model domain concepts with algebraic data types first.
- Avoid stringly typed state.
- Keep side effects out of the core.
- Prefer pure functions for state transitions.
- Add tests for runtime behavior before expanding Electron integration.
- Keep protocol serialization separate from domain types once protocol code exists.
- Use `.mli` files when a module boundary stabilizes.
- Avoid global mutable state.
- Avoid background threads, fibers, or effect-based IO until there is a concrete runtime need.

## Dependency Rules

Keep early dependencies small.

`nyx_runtime.opam` is manually maintained. When changing runtime package metadata, dependencies, test-only dependencies, doc dependencies, or Dune package configuration, update `runtime/ocaml/nyx_runtime.opam` in the same change and keep CI aligned with it.

Allowed now as project dependencies:

- standard library
- yojson
- alcotest
- ocamlformat
- odoc

Developer-local editor tools such as `ocaml-lsp-server` or `utop` may be installed manually, but they are not part of the default project setup.

Do not add large frameworks or concurrency libraries yet, including:

- Eio
- Lwt
- Async
- Core
- Base
- ppx-heavy stacks

These may be added later only when the runtime design justifies them.

## Protocol Rules

The current runtime CLI has a local protocol mode for verification and explicit
Electron-main use behind runtime boundary tasks.

- stdout must be protocol only
- stderr must be logs only
- use NDJSON
- one JSON message per line
- every request must have an id
- Electron main owns process lifecycle for any current or future desktop use
- renderer must never talk to OCaml directly

The current scaffold includes ping/pong:

```json
{"type":"ping","id":"req_1"}
{"type":"pong","id":"req_1"}
```

It also includes a local chat reducer session scaffold used for runtime
verification and the default Electron-main chat state path. Do not expand this
into renderer/preload communication, model provider calls, tool execution, or
agent orchestration without an explicit task.

## Verification

For any runtime change, run:

```bash
./scripts/audit-ocaml-runtime.sh
./scripts/check-runtime.sh
```

Equivalent focused checks:

```bash
mise run runtime:build
mise run runtime:test
mise run runtime:format-check
```

For cross-project changes, run from root:

```bash
mise run check
```

## Commit Discipline

Runtime commits should be small and semantic:

- add domain type
- add state transition
- add event model
- add test
- add protocol codec
- add CLI behavior

Do not mix runtime modeling with Electron wiring in the same commit.
