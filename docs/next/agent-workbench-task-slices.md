# Agent Workbench Task Slices

Status: Source of truth for explicit agent-workbench workstreams.

This document supersedes earlier external AGW-00..13 draft ordering. Do not
follow earlier draft task names, milestone cuts, placeholder APIs, or runtime
thread-domain steps unless they are reintroduced here.

These slices apply only when the user explicitly asks to execute the
agent-workbench workstream or one of these slices. Ordinary Nyx work remains
governed by [v1-min-chat-implementation-plan.md](../v1-min-chat-implementation-plan.md).

## Global Rules

Always follow:

```text
AGENTS.md
apps/desktop/AGENTS.md
runtime/ocaml/AGENTS.md when editing runtime/ocaml
```

Unless a slice explicitly says otherwise, do not implement:

```text
Ask / Work toggle
multi-Agent picker
planner/executor/reviewer model routing UI
tools
MCP
terminal execution
browser automation
persistent thread history
fake artifacts
fake file context
approval cards
details drawer
thread IPC
OCaml thread runtime domain
renderer access to stored secrets
renderer direct provider calls
renderer direct OCaml communication
OCaml provider calls or OS side effects
```

Use relative documentation links. Do not add local absolute paths.

## Workstream Status

- `A0` through `A7` define the completed first foundation workstream. Do not
  rerun them as permission to redesign existing behavior.
- `B0` through `B5` define the completed second
  `current-thread-durability` workstream. Do not rerun them as permission to
  broaden persistence behavior. Their implemented boundary is one durable
  current thread, not a thread collection.
- The B workstream permits one durable current thread only. It does not permit
  persistent thread history, a thread collection, or a parallel Thread runtime
  domain.
- `C0` through `C4` define the completed third
  `provider-compatibility-core` workstream. Do not rerun them as permission to
  add provider-specific policy or a general adapter platform.
- The C workstream extracts one Electron-main-only OpenAI-compatible
  compatibility path. It does not authorize a general adapter platform,
  provider-specific request policy, schema/UI expansion, or a new renderer or
  OCaml provider boundary.
- `D0` defines the approved scope gate for the fourth
  `composer-target-selection` workstream. `D1` through `D4` are implemented and
  passed the required automated D5 checks on 2026-08-07. D5 documentation is
  synchronized, while its interactive provider/restart acceptance remains
  pending in
  [composer-target-selection-runthrough.md](./composer-target-selection-runthrough.md).
  The named D workstream or slice still requires an explicit user request.
- The D workstream permits safe target selection and attribution only. It does
  not authorize global-default mutation, a Connections store migration,
  provider-specific policy, automatic routing, attempt history, multi-thread
  history, or a new renderer/OCaml provider boundary.
- `E0` stopped on 2026-08-09 after a representative high-entropy fixture
  disproved synchronous Electron-main canonicalization. `E0B` then stopped
  because Chromium's canonical JPEG contained an ICC APP2 segment forbidden by
  the failed v1.8 candidate's sealed metadata allowlist. User-approved `E0C`
  proved the exact ICC candidate, then stopped because visible 12×1080p and
  8×1080p grids exceeded the fixed whole-process memory line. User-approved
  `E0D` proved the preview-only grid, then stopped when its temporary
  fresh-byte/Blob/object-URL full-open path exceeded the same line. User-approved
  `E0E` then stopped because Chromium removed a
  non-default explicit port before the standard custom-protocol handler, so its
  exact-route authorization rule could not reject the alias. User-approved
  `E0F` then passed post-normalization identity, native-cache revocation,
  security, memory, and `app.asar` loading in OS temp. The later v3.0 plan passed
  `RC-V3-PLAN-03`. E1 then completed at `1bf91cf` and passed
  `RC-E1-CODE-02`; E2 completed at `36e32e6` and passed `RC-E2-CODE-03`. E3 is
  complete at `7677868` and passed `RC-E3-CODE-02`; E4 completed at `b13d3b8`
  and passed `RC-E4-CODE-02`. E5 stopped at `RC-E5-EVIDENCE-01` when Chromium
  erased credentials before the product handler. The user approved policy A;
  the v3.1 canonical-identity amendment passed `RC-E5-PLAN-A-02`. E5 then stopped
  at the fresh-process 4K memory gate; `RC-E5-4K-MEMORY-01` returned
  `VALID_STOP`. The user then approved only the bounded E4M candidate; its v3.2
  amendment passed `RC-E4M-PLAN-02`, but the first valid 4K repetition still
  measured +299.828 MiB. `RC-E4M-EVIDENCE-01` returned `VALID_STOP`, the
  uncommitted Worker change was reversed. The user then approved the bounded
  E4R 2048-edge proportional-resize candidate; its revised plan passed
  `RC-E4R-PLAN-03`, but E4R stopped at its oversized EXIF-orientation gate and
  its uncommitted product diff was reversed. No E slice is executable. E0F
  itself froze no product capacity or protocol; v3.0 selects them.
  Evidence is recorded in
  [context-composer-experiment-runthrough.md](./context-composer-experiment-runthrough.md).
- The old v1.8 PNG/JPEG/Worker design and its E1-E5 slice/file details are failed
  historical candidate material, not an active workstream or implementation
  permission. Only the reviewed v3.0 plan and active named slice authorize work.

## A0: Scope Gate Docs

Type: documentation only.

Goal: make the explicit agent-workbench workstream possible without changing
the default product scope for unrelated tasks.

Allowed files:

```text
README.md
AGENTS.md
apps/desktop/AGENTS.md
DESIGN.md
docs/next/agent-workbench-direction.md
docs/next/provider-connections-implementation.md
docs/next/agent-workbench-task-slices.md
```

Required:

- say ordinary tasks still follow `docs/v1-min-chat-implementation-plan.md`
- say these `docs/next/agent-workbench-*` docs apply only to explicit
  agent-workbench workstream tasks
- preserve the completed `v1 min chat` baseline
- state that the earlier external AGW draft is superseded by this repo document
- keep renderer/provider/runtime security boundaries

Do not:

- change application behavior
- edit Electron main, preload, renderer, or `runtime/ocaml`
- add Settings UI or IPC
- add runtime protocol messages

Validation:

```sh
mise run format-check
```

## A1: Connections Shared Domain

Type: shared TypeScript domain only.

Goal: add connection provider/model/default-target types and IPC constants
without changing the preload/window contract yet.

Allowed files:

```text
apps/desktop/shared/connections/types.ts
apps/desktop/shared/connections/ipc.ts
```

Do not:

- add `connections` as a required `NyxDesktopApi` field yet
- create Settings UI
- create Electron main storage
- change chat request behavior
- add model routing roles
- add public chat error codes

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
```

## A2: Main Connections Store

Type: Electron main storage.

Goal: add main-owned settings persistence and encrypted provider secrets.

Allowed files:

```text
apps/desktop/electron/main/connections/config-file.ts
apps/desktop/electron/main/connections/schemas.ts
apps/desktop/electron/main/connections/connection-store.ts
apps/desktop/electron/main/connections/secret-store.ts
apps/desktop/electron/main/connections/*.test.ts
```

Rules:

- use injected paths and injected crypto adapters for tests
- production crypto uses Electron main safe storage
- no plaintext token persistence
- file missing means empty state
- malformed or schema-invalid persisted JSON fails closed
- malformed persisted JSON must not be automatically overwritten

Do not:

- register IPC
- call providers
- edit renderer
- edit OCaml

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
```

## A3: Provider Resolver

Type: Electron main behavior.

Goal: make chat execution resolve persisted default provider/model while
preserving `.env` fallback.

Allowed files:

```text
apps/desktop/electron/main/connections/connection-service.ts
apps/desktop/electron/main/connections/provider-resolver.ts
apps/desktop/electron/main/connections/*.test.ts
apps/desktop/electron/main/chat/env.ts
apps/desktop/electron/main/chat/session.ts
apps/desktop/electron/main/chat/session*.test.ts
```

Rules:

- resolver/service must be lazy
- module import must not call `app.getPath`, `safeStorage`, provider network,
  child process startup, or OCaml runtime
- effective config resolution order is future explicit target, persisted
  default, env fallback, then `config_missing`
- chat path errors must map to existing `NyxChatErrorCode` values only
- preserve runtime-backed chat state behavior

Do not:

- add Settings UI
- expose renderer IPC for Connections
- remove `.env` fallback
- send provider secrets to renderer

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
mise run runtime:chat-state:check
```

## A4: Connections IPC And Preload

Type: Electron IPC and preload contract.

Goal: expose Connections service through a narrow typed `window.nyx.connections`
bridge.

Allowed files:

```text
apps/desktop/shared/contracts/desktop.ts
apps/desktop/electron/preload/index.ts
apps/desktop/electron/main/index.ts
apps/desktop/electron/main/connections/*ipc*.ts
apps/desktop/electron/main/connections/*ipc*.test.ts
```

Rules:

- this is the first slice that may add `connections` to `NyxDesktopApi`
- use fixed IPC channels only
- use a Connections-specific safe error/result contract
- do not return stored API keys or raw secret file content

Do not:

- expose generic `invoke`
- expose raw `ipcRenderer`
- expose safeStorage
- let renderer choose arbitrary IPC channels

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
```

## A5: Settings Connections UI And Main Status

Type: renderer UI plus redacted status.

Goal: let users configure an OpenAI-compatible provider and see redacted
connection status on the main surface.

Allowed files:

```text
apps/desktop/src/router.tsx
apps/desktop/src/ui/settings/*
apps/desktop/src/ui/chat/*
apps/desktop/electron/main/chat/env.ts
apps/desktop/electron/main/index.ts
apps/desktop/shared/provider/types.ts
```

Rules:

- UI may submit a newly typed API key but never display a saved key
- status may show safe host/model summary, not tokens or raw config
- settings page may include Connections and minimal Advanced only when backed by
  real data

Do not:

- add Agents, Tools, MCP, Memory, persistent history, fake artifacts, fake file
  context, or Ask/Work switch
- show fake provider health
- show full private base URL on the main surface
- show raw exceptions

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
```

## A6: Provider Test And Model Refresh

Type: Electron main provider utility plus UI controls.

Goal: make Test connection and Refresh models real.

Allowed files:

```text
apps/desktop/electron/main/connections/provider-test.ts
apps/desktop/electron/main/connections/provider-test.test.ts
apps/desktop/electron/main/connections/connection-service.ts
apps/desktop/src/ui/settings/*
```

Rules:

- Test connection uses a tiny non-streaming OpenAI-compatible completion
- Refresh models calls `/v1/models`
- discovered models merge into existing models
- manual models are not deleted by refresh
- errors must not leak token, Authorization header, full request body, or raw
  secret

Do not:

- show Test connection or Refresh models buttons before this slice
- move provider test code into renderer or OCaml

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
```

## A7: Thread-First Shell

Type: renderer UI/refactor.

Goal: transition visible copy and renderer-local presentation model from
chat-first to thread-first while preserving behavior.

Allowed files:

```text
apps/desktop/src/ui/chat/*
apps/desktop/src/ui/thread/*
apps/desktop/src/ui/App.tsx
apps/desktop/src/router.tsx
```

Rules:

- `New chat` becomes `New thread`
- composer copy becomes `Tell Nyx what to do...`
- renderer may adapt current chat state to a thread item stream with only real
  message items
- no behavior change to streaming, Stop, Retry, or reset/new thread

Do not:

- add thread IPC
- add details drawer
- add approval or artifact shared types
- add fake activity
- edit OCaml or provider behavior

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
mise run check
```

## B0: Current Thread Durability Scope Gate

Type: documentation only.

Goal: authorize one durable current thread without authorizing persistent
thread history or broader runtime work.

Allowed files:

```text
AGENTS.md
apps/desktop/AGENTS.md
docs/next/agent-workbench-direction.md
docs/next/agent-workbench-task-slices.md
```

Required:

- preserve `v1 min chat` as the default scope for ordinary tasks
- preserve A0-A7 as the completed first workstream
- authorize one Electron-main-owned current-thread record
- authorize one safe snapshot method on the existing chat bridge
- keep renderer state as an in-memory projection
- allow lazy replay through the existing runtime chat reducer only when the
  next real turn starts
- state that local conversation content is plaintext app data with owner-only
  file permissions, not encrypted secret storage

Do not:

- change application behavior
- edit Electron main, preload, renderer, or `runtime/ocaml`
- authorize Recent, thread lists, switching, full thread IPC, a Thread reducer,
  tools, activity, approvals, artifacts, SQLite, or JSONL

Validation:

```sh
mise run format-check
```

## B1: Main Current Thread Store

Type: Electron main storage only.

Goal: add a versioned, main-owned record and atomic store for the one current
thread.

Allowed files:

```text
apps/desktop/electron/main/current-thread/*
```

Rules:

- use a feature-local `CurrentThreadRecordV1` and `TurnRecordV1`
- create the stable thread id in main on the first submitted user message
- keep user and assistant message ids stable across retry while the attempt
  request id changes
- inject file path, clock, id, and file adapters for tests
- use serialized writes, a temporary file, atomic rename, and mode `0600`
- missing file means no current thread
- malformed or schema-invalid data fails closed and is not automatically
  overwritten
- persist safe message/error projections only

Do not:

- register IPC or edit renderer/session/runtime behavior
- expose the persisted schema through shared contracts
- import or move the Connections file helper across feature ownership
- persist token, Authorization, raw request/response, raw exception, or full
  error details
- write every streaming delta
- add JSONL, SQLite, encryption, migrations, or a thread collection

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
```

## B2: Current Thread Snapshot Bridge

Type: shared contract, narrow IPC/preload bridge, and renderer hydration.

Goal: let renderer restore a safe projection of the one current thread without
becoming its durable owner.

Allowed files:

```text
apps/desktop/shared/chat/*
apps/desktop/shared/contracts/desktop.ts
apps/desktop/electron/preload/index.ts
apps/desktop/electron/main/index.ts
apps/desktop/electron/main/current-thread/*
apps/desktop/src/ui/chat/*
```

Rules:

- add one fixed `getCurrentThreadSnapshot` channel and method under
  `window.nyx.chat`
- use a current-thread-specific safe result/error contract
- map the main-only persisted schema to a renderer snapshot
- restore messages, terminal run status, and required retry metadata
- keep input empty and active request/turn identity unset after hydration
- prevent send while snapshot loading or load error is unresolved

Do not:

- expose the persisted schema, file path, raw JSON, or raw error
- add generic invoke, raw `ipcRenderer`, `window.nyx.thread`, or full thread IPC
- use renderer localStorage/IndexedDB or start the runtime during snapshot load
- connect provider execution or change runtime protocol in this slice

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
```

## B3: Durable Session And Lazy Runtime Replay

Type: Electron main chat/session integration.

Goal: make the durable record authoritative for provider context and rebuild a
fresh runtime chat state before the next real turn.

Allowed files:

```text
apps/desktop/electron/main/index.ts
apps/desktop/electron/main/index.test.ts
apps/desktop/electron/main/chat/session.ts
apps/desktop/electron/main/chat/session*.test.ts
apps/desktop/electron/main/current-thread/*
apps/desktop/electron/main/runtime/chat-state-client.ts
apps/desktop/electron/main/runtime/chat-state-client.test.ts
```

Rules:

- inject the same current-thread store/controller used by the snapshot bridge
  into `ChatSessionManager` from the Electron main composition root
- for new and retry, compare the renderer `messages` payload with the complete
  main-derived role/content sequence; reject any missing, extra, or changed
  message with the existing `invalid_request` error before durable write,
  runtime replay, or provider work
- call the provider with main-derived messages, not renderer-owned history
- atomically persist a pending new/retry turn before provider side effects
- before snapshot or provider use after restart, normalize an abandoned pending
  turn to a terminal failure using the existing `unknown` code and retryable
  interrupted semantics
- replay persisted turns only for a fresh runtime client and only inside the
  next chat start path
- use existing submit/append/complete/cancel/fail runtime actions only
- project complete, cancel, and normal provider failure, including the final
  assistant draft, into one terminal durable write
- order terminal behavior as runtime transition, terminal durable write, then
  renderer event
- replay, runtime, or store failure is authoritative and must fail closed

Do not:

- remove the existing `NyxChatRequest.messages` compatibility field yet
- add public chat error codes
- start runtime during app startup, BrowserWindow creation, or snapshot load
- modify `runtime/ocaml`, NDJSON protocol, runtime resolution, provider secrets,
  or packaged distribution
- silently fall back to renderer history or the no-runtime diagnostic path

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
mise run runtime:chat-state:check
```

## B4: Current Thread Recovery And Reset

Type: main recovery/reset plus safe renderer error state.

Goal: close interruption, malformed storage, retry, and explicit reset paths.

Allowed files:

```text
apps/desktop/electron/main/current-thread/*
apps/desktop/electron/main/chat/session.ts
apps/desktop/electron/main/chat/session*.test.ts
apps/desktop/shared/chat/*
apps/desktop/src/ui/chat/*
```

Rules:

- preserve and test the B3 interrupted normalization contract across snapshot,
  retry, and reset paths
- do not promise recovery of a partial draft lost during process exit
- preserve malformed/schema-invalid files until explicit Start fresh
- serialize abort, runtime clear/close, store reset, and renderer clear
- clear renderer state only after durable reset succeeds; on reset failure keep
  the UI in a blocked safe error state
- use a reset/hydration generation barrier so a snapshot response started before
  reset cannot repopulate the cleared thread
- prevent late provider events or store writes from reviving a reset thread
- cover in-flight snapshot versus reset and store-reset failure with
  deterministic tests

Do not:

- add Recent, list, switching, archive, hidden history, or per-message deletion
- add a new interrupted error code
- automatically overwrite or delete malformed storage
- persist streaming deltas

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
mise run runtime:chat-state:check
```

## B5: Current Thread Durability Documentation Sync

Type: documentation and final verification.

Goal: document the implemented current-thread ownership and prove the bounded
end-to-end behavior.

Implemented behavior review:

- completed restart/continue restores prior messages, derives provider context
  from the main-owned record, and lazily replays a fresh runtime projection
- failed restart/retry restores the safe terminal error and assistant draft,
  then reuses stable user/assistant identity with a new attempt request id
- cancelled partial content is terminal durable content and restores as
  cancelled
- process exit during a pending turn restores as the existing `unknown`,
  retryable interrupted failure; crash-time partial draft recovery is not
  promised
- New thread waits for active work to settle, clears all runtime projections,
  removes the current-thread record, and stays empty after restart
- malformed or schema-invalid storage returns one safe load error, remains
  untouched, and can be removed only by explicit New thread/Start fresh

This review does not cover multi-thread switching, active renderer reload,
large-history performance, or conversation encryption.

Allowed files:

```text
README.md
DESIGN.md
AGENTS.md
apps/desktop/AGENTS.md
docs/next/agent-workbench-direction.md
docs/next/agent-workbench-task-slices.md
docs/architecture/runtime-protocol.md
```

Required:

- say Electron main owns the durable current-thread record
- say renderer and runtime hold rebuildable projections
- document complete, cancel, fail, retry, interrupted, reset, and corruption
  behavior
- keep Recent, switching, history collection, encryption, and Thread runtime
  domain explicitly out of scope
- manually verify restart/continue, retry, cancelled partial, interrupted exit,
  New thread, and corrupt-file Start fresh paths

Do not:

- claim multi-thread history, active renderer reload recovery, large-history
  performance, or conversation encryption
- include user conversation content, private paths, provider secrets, or local
  workflow evidence in committed docs
- change application behavior in this slice

Validation:

```sh
mise run desktop:check
mise run check
mise run format-check
git diff --check
```

## C Workstream: Provider Compatibility Core

Status: Completed on 2026-07-30. Acceptance evidence is recorded in
[llm-chat-runthrough.md](./llm-chat-runthrough.md).

The bounded implementation path is:

```text
ResolvedChatTarget
  -> OpenAI-compatible request mapping
  -> normalized provider stream
  -> existing chat session
```

The workstream preserves the existing minimal chat product and the completed
A/B behavior. Electron main remains the sole owner of provider identity,
credentials, requests, raw payloads, reasoning activity, terminal policy, and
current-thread durable failure state.

Locked decisions:

- C0-C4 implement compatibility core only. They do not send
  provider-specific `thinking`, `reasoning_effort`, or output-token parameters.
- Any `finish_reason=length`, with or without partial answer text, is a
  retryable failed turn. Existing session behavior must preserve the latest
  partial assistant draft and expose Retry.

This workstream handles reasoning-only and output-budget exhaustion as safe
terminal failures. It does not prevent provider-side reasoning from exhausting
the available output budget.

Global stop conditions:

- stop before changing the Connections persisted schema or rewriting
  version-1 provider records
- stop before choosing behavior from provider hostnames or model-name patterns
- stop before sending provider identity, credentials, raw payloads, or reasoning
  through shared, preload, renderer, or OCaml boundaries
- stop before adding usage, tools, sources, files, structured output, or native
  protocol events to the normalized stream
- stop if the generic request cannot retain its current represented fields and
  semantics
- stop if compatibility requires provider-specific request parameters, an
  adapter registry, capability profiles, or runtime-selected implementations

## C0: Provider Compatibility Scope Gate

Type: documentation only.

Goal: authorize the bounded C1-C4 workstream and freeze its decisions,
non-goals, ownership, validation, and stop conditions before code changes.

Allowed files:

```text
AGENTS.md
apps/desktop/AGENTS.md
docs/next/agent-workbench-direction.md
docs/next/agent-workbench-task-slices.md
docs/next/provider-adapter-direction.md
```

Required:

- make this document the executable source of truth for C1-C4
- keep [provider-adapter-direction.md](./provider-adapter-direction.md) as
  architecture context rather than independent implementation permission
- record the compatibility-only scope and both locked decisions above
- preserve A0-A7, B0-B5, v1 minimal chat, and existing runtime-backed
  current-thread behavior
- keep provider calls, credentials, raw payloads, and reasoning in Electron
  main
- state that C can report output exhaustion but does not prevent it

Do not:

- edit Electron main, preload, renderer, shared TypeScript, or `runtime/ocaml`
- add provider request parameters, registries, capabilities, persistence, UI,
  IPC, or error codes
- claim that generic, Ark, or GLM compatibility has already been implemented or
  manually verified

Validation:

```sh
mise run format-check
git diff --check
```

## C1: Stream Normalization

Type: Electron-main stream extraction with immediate integration.

Goal: define the minimal normalized provider stream and make the existing chat
client consume it in the same slice.

Allowed files:

```text
apps/desktop/electron/main/chat/client.ts
apps/desktop/electron/main/chat/client.test.ts
apps/desktop/electron/main/chat/provider-stream.ts
apps/desktop/electron/main/chat/provider-stream.test.ts
```

Required:

- keep the main-only event set limited to `text-delta`,
  `reasoning-activity`, `finish`, and `error`
- normalize finish reasons to `stop`, `length`, `content_filter`,
  `tool_calls`, `error`, or `unknown`, while retaining a safe main-only native
  reason for diagnostics
- make the pure decoder responsible only for converting one provider payload to
  normalized events
- wire the decoder into `streamChatCompletion` immediately; do not leave an
  unused contract or parallel parsing path
- keep `streamChatCompletion` as the sole owner of aggregation, `onDelta`,
  empty/reasoning-only handling, terminal policy, and mapping to the existing
  `ChatBridgeError`
- preserve cancellation during reasoning and text
- preserve all current request and terminal behavior in this extraction slice;
  C3 applies the approved partial-`length` behavior

Do not:

- add a `SafeProviderError` or another public/shared error taxonomy
- expose or persist reasoning text
- add usage, tools, sources, files, or structured-output placeholders
- add a one-implementation interface, registry, capability profile, or SDK
- modify resolver, Connections, session, current-thread, renderer, shared, IPC,
  preload, or OCaml code

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
```

## C2: Target Identity And Request Mapping

Type: Electron-main target resolution and pure request extraction.

Goal: preserve non-secret provider identity through request construction while
keeping the current generic OpenAI-compatible request unchanged.

Allowed files:

```text
apps/desktop/electron/main/index.ts
apps/desktop/electron/main/index.test.ts
apps/desktop/electron/main/chat/client.ts
apps/desktop/electron/main/chat/client.test.ts
apps/desktop/electron/main/chat/env.ts
apps/desktop/electron/main/chat/session.ts
apps/desktop/electron/main/chat/session.test.ts
apps/desktop/electron/main/connections/provider-resolver.ts
apps/desktop/electron/main/connections/provider-resolver.test.ts
```

Required:

- replace the lossy resolved config boundary with this main-only target:

  ```ts
  interface ResolvedChatTarget {
    providerId: string | null
    baseUrl: string
    token: string
    modelId: string
    protocol: 'openai-chat-completions'
  }
  ```

- use the persisted provider id for Connections targets and `null` for `.env`
  fallback
- route request construction by the explicit `protocol` value only
- extract a pure OpenAI-compatible request builder and consume it from
  `streamChatCompletion` in this slice
- keep endpoint construction, bearer authentication, model, `stream: true`,
  system-message insertion, and provider-visible messages equivalent to the
  existing generic request
- preserve target resolution order, safe errors, cancellation, durable session
  behavior, and the runtime-backed chat state path

Do not:

- infer a provider, protocol, adapter, or capability from base URL or model id
- add Ark-, GLM-, or other provider-specific request fields
- change Connections schemas, stored version-1 records, secret keys, shared
  contracts, IPC, preload, renderer, or OCaml
- add a registry, adapter interface, capability profile, or new dependency

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
mise run runtime:chat-state:check
```

## C3: Fixtures And Terminal Hardening

Type: Electron-main compatibility fixtures and terminal behavior.

Goal: prove the bounded generic/Ark/GLM response shapes and apply the approved
output-length failure semantics without broadening the provider contract.

Allowed files:

```text
apps/desktop/electron/main/chat/client.ts
apps/desktop/electron/main/chat/client.test.ts
apps/desktop/electron/main/chat/provider-stream.ts
apps/desktop/electron/main/chat/provider-stream.test.ts
apps/desktop/electron/main/chat/fixtures/*
apps/desktop/electron/main/chat/session.test.ts
apps/desktop/electron/main/chat/session-runtime-chat-state.integration.test.ts
```

Required:

- add minimal redacted fixtures for generic content streaming, Ark-compatible
  text streaming, and GLM-style `reasoning_content` followed by final text
- cover reasoning-only termination, `length` with and without partial text,
  provider mid-stream errors, unknown native finish reasons, cancellation
  during reasoning and text, and malformed payloads
- treat every normalized `length` finish as an existing retryable
  `upstream_error`, even when answer text arrived first
- preserve prior text as the latest assistant draft, write the failed terminal
  current-thread record, and keep the existing Retry path available
- preserve the existing B3 session regression proving delta-then-failure
  persists the latest draft before the renderer error; extend it only if the
  C3 wiring creates an uncovered path
- keep raw reasoning out of assistant content, persistence, renderer events,
  subsequent provider messages, fixtures, and diagnostics
- source provider-specific fixtures from official examples or captured,
  redacted responses

Do not:

- include credentials, user prompts, personal conversation content, private
  URLs, or raw reasoning in fixtures
- add provider-specific request fields or claim to prevent output exhaustion
- add new public chat errors, shared contracts, UI, migration, registry, or
  capability selection
- modify Connections test/model-refresh semantics

Stop if:

- a claimed Ark/GLM fixture cannot be tied to an official example or a
  captured, redacted response
- correct handling requires provider-specific request policy or a broader event
  contract

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
mise run runtime:chat-state:check
```

## C4: Provider Compatibility Acceptance And Docs

Type: acceptance verification and documentation sync.

Goal: verify the completed compatibility core against its evidence boundary and
document only behavior that was actually proven.

Completion: accepted on 2026-07-30 using the required automated checks, a live
Ark/GLM path, and isolated local fixtures for terminal cases that could not be
reliably induced on the live provider. See
[llm-chat-runthrough.md](./llm-chat-runthrough.md).

Allowed files:

```text
README.md
AGENTS.md
apps/desktop/AGENTS.md
docs/next/agent-workbench-direction.md
docs/next/agent-workbench-task-slices.md
docs/next/llm-chat-runthrough.md
docs/next/provider-adapter-direction.md
```

Required automated verification:

```sh
mise run desktop:check
mise run check
mise run format-check
git diff --check
```

Required manual verification:

- generic OpenAI-compatible streaming still completes normally
- an available Ark-compatible text model streams without request-shape changes
- an available GLM reasoning model remains cancellable during reasoning and
  exposes only final answer text
- reasoning-only and `length` responses fail safely without empty completed
  messages
- partial text followed by `length` remains visible as a failed durable draft,
  offers Retry, and restores after restart
- Stop during reasoning and text remains terminal and durable
- Retry after a provider failure keeps the established current-thread identity
  behavior
- unsupported model discovery preserves manually configured model ids
- existing version-1 Connections remain usable without record rewriting
- renderer never receives provider tokens, raw reasoning, or raw provider
  payloads

Required documentation:

- distinguish compatibility-core implementation from provider-specific request
  optimization
- say the workstream handles output exhaustion but does not prevent it
- record which generic, Ark, and GLM paths were actually exercised
- keep registry, capabilities, schema migration, UI, tools, history, and native
  protocol adapters out of scope

Do not:

- change application behavior in this slice
- report a provider path as verified when credentials, fixtures, or a manual run
  were unavailable
- weaken any automated check to make acceptance pass

## D Workstream: Composer Target Selection

Status: `D0` scope gate approved on 2026-08-05. `D1` through `D4` are
implemented and passed the required automated D5 checks on 2026-08-07. D5
documentation is synchronized; interactive provider/restart acceptance remains
pending.

Goal: let the user explicitly choose a configured chat target from the Composer
while keeping provider resolution, credentials, provider calls, and durable
thread ownership in Electron main.

The bounded implementation path is:

```text
safe Connections target catalog
  -> renderer-local Composer target draft
  -> required target selection on Send or Retry
  -> main validation and durable per-turn target binding
  -> existing runtime replay and provider stream
  -> safe assistant target attribution
```

### Locked product semantics

- An unsent Composer selection is an in-memory renderer draft. It is not
  persisted independently and does not survive restart.
- Each Send or Retry captures the currently visible Composer selection. That
  captured selection is immutable for the active request.
- Changing the Composer selection while a response is active affects only a
  later Send or Retry. It must not retarget, restart, or cancel the active
  request.
- The latest submitted selection becomes sticky for the one current thread and
  survives restart through the current-thread record.
- Retry keeps the existing user and assistant message ids, creates a new
  request id, and uses the currently visible Composer selection rather than the
  failed attempt's selection.
- Changing the Composer selection never changes the Connections global default.
- New thread clears the current-thread record and, after reset succeeds, seeds
  a new draft from the latest persisted default target or the configured `.env`
  fallback. Missing or unusable configuration blocks Send.
- A selected target that becomes deleted, disabled, unconfigured, or otherwise
  unusable is displayed as unavailable and fails closed. It must never silently
  fall back to another connection or `.env`.
- A main-authoritative target-resolution failure remains recoverable by choosing
  another target and using Retry. D may add one typed `target_unavailable` chat
  error with `retryable: true`; it must not make unrelated invalid requests
  retryable.
- Every assistant response whose target was resolved exposes compact safe
  provider/model attribution. Failed resolution has a selection but no actual
  attribution.

### Target readiness and refresh invariants

- Initial target readiness waits for both the current-thread snapshot and the
  safe Connections target catalog. Arrival order must not affect the result.
- The latest non-null committed thread selection wins over the global default,
  including when that committed selection is currently unavailable.
- Only a thread with no committed selection is seeded from the current global
  default. If no persisted default exists, a configured `.env` fallback is the
  seed. If neither exists, no request target is available and Send is blocked.
- A catalog refresh may update labels and availability, but it must not mutate
  the current Composer draft or committed thread selection.
- The safe catalog contains currently selectable connection targets with
  provider/model ids and display labels, plus a distinct `.env` fallback summary
  with its effective model id when configured. It contains no token, full base
  URL, protocol configuration, or raw provider record.
- A committed selection absent from the catalog remains visible as unavailable.
  The renderer may use safe current labels when present and fall back to stored
  ids or a fixed `.env` label; it must not invent provider identity.

### Ownership and data invariants

- Connections version 1 remains the source of configured providers, models, and
  the global default. D must not rewrite or migrate that store.
- Renderer owns only the in-memory draft and safe catalog projection. It does
  not own durable selection, resolved targets, credentials, or provider calls.
- Electron main validates every requested selection, resolves base URL/token/
  protocol, binds safe attribution durably, and performs provider calls.
- Current Thread version 2 owns one target binding per turn. The binding is
  either `null` for a migrated version-1 turn whose historical target is
  unknown, or one object containing the submitted selection and nullable
  resolved attribution. Attribution must never exist without its selection.
- A new D-created pending turn always has a non-null selection. Resolution binds
  attribution before runtime or provider side effects. A resolution failure
  leaves attribution null and settles the turn with the retryable
  `target_unavailable` error.
- The only attribution-binding transition is `bind-resolved-target`: the final
  pending turn keeps the same thread, request, message, content, status, and
  selection identity while attribution changes exactly once from null to the
  main-confirmed value. It cannot replace an existing attribution or settle the
  turn.
- For a saved connection target, resolved attribution must preserve the same
  provider/model ids. For `.env`, attribution records the effective model id
  resolved for that attempt without copying environment configuration.
- Snapshot `selectedTarget` is derived from the latest non-null turn selection;
  it is not duplicated as another persisted root field. Assistant attribution
  is derived from the same per-turn binding.
- Retry replaces the failed turn's latest attempt request id and complete target
  binding while preserving message identity. D does not add attempt history.
- Version-1 records are read without guessing historical targets or rewriting a
  stable record. The next real mutation, including interrupted-turn recovery,
  writes version 2. Unknown versions fail closed and remain untouched unless
  the user explicitly chooses New thread.
- Version 2 is forward-only. An older binary may fail closed when it encounters
  version 2; D does not provide automatic downgrade or rewrite the record for an
  older binary.
- The final shared chat request requires an explicit safe target selection. Main
  validates it and never derives a different fallback target for that request.
- The existing `chat:start` event carries the main-confirmed safe attribution.
  The existing runtime reducer and provider stream receive no new provider
  identity, selection, credential, or protocol fields.

### Global stop conditions

- stop before migrating the Connections persisted schema or copying `.env`
  configuration into Connections or the current-thread record
- stop before persisting an unsent Composer draft in a sidecar file,
  `localStorage`, or a second durable target owner
- stop before adding fallback-on-invalid behavior, hostname/model-name
  inference, model roles, automatic routing, or provider-specific request fields
- stop before adding an adapter registry, capability profile, attempt history,
  Recent, thread switching, or persistent multi-thread history
- stop before adding a new chat/thread IPC namespace or new OCaml runtime
  protocol messages
- stop before exposing credentials, resolved targets, full base URLs, raw
  provider configuration, or provider execution through D-added Composer,
  catalog, chat, snapshot, or attribution surfaces; the existing typed
  Connections Settings provider-detail editing contract remains unchanged

## D0: Composer Target Selection Scope Gate

Type: documentation only.

Goal: authorize the bounded D1-D5 workstream and freeze its product semantics,
ownership, compatibility rules, validation, and stop conditions before any
application changes.

Allowed files:

```text
AGENTS.md
apps/desktop/AGENTS.md
docs/next/agent-workbench-direction.md
docs/next/agent-workbench-task-slices.md
```

Required:

- preserve the completed v1, A0-A7, B0-B5, and C0-C4 behavior
- keep ordinary model-picker work out of scope unless the D workstream or a
  named D slice is explicitly requested
- distinguish safe renderer-visible target selection from the resolved target,
  credentials, protocol, and provider execution owned by Electron main
- lock the Composer draft, active request, restart, New thread, Retry,
  unavailable-target, attribution, and `.env` semantics above
- authorize only the shared contracts, current-thread version change, existing
  bridge extension, renderer UI, and one target-specific retryable error needed
  by D1-D5
- record that D1-D5 are pending and must be implemented in order

Do not:

- change application behavior
- edit shared TypeScript, Electron main, preload, renderer, or `runtime/ocaml`
- claim D1-D5 are implemented or verified
- broaden the workstream beyond the D global stop conditions

Validation:

```sh
mise run format-check
git diff --check
```

## D1: Safe Target Catalog

Type: main-owned safe catalog and existing Connections overview contract.

Goal: expose every currently selectable configured target and the configured
`.env` fallback without exposing provider secrets or raw configuration.

Allowed files:

```text
apps/desktop/shared/connections/types.ts
apps/desktop/electron/main/chat/env.ts
apps/desktop/electron/main/chat/env.test.ts
apps/desktop/electron/main/connections/connection-service.ts
apps/desktop/electron/main/connections/connection-service.test.ts
apps/desktop/electron/main/connections/ipc-handlers.ts
apps/desktop/electron/main/index.test.ts
apps/desktop/electron/preload/index.ts
apps/desktop/shared/contracts/desktop.ts
apps/desktop/src/ui/chat/connection-status.test.ts
```

Required:

- extend the existing Connections overview result; do not add an IPC channel
- return deterministic safe catalog items containing connection provider/model
  ids and display labels only
- expose a distinct configured `.env` fallback summary with its effective model
  id even when a persisted Connections default also exists
- include only enabled provider/model pairs with an available stored credential
  as selectable connection targets
- keep `defaultTarget` and `defaultTargetSource` semantics unchanged
- preserve Connections version 1 bytes and all existing Settings behavior
- add tests proving no token, full base URL, raw config, or disabled/unusable
  target crosses the overview bridge

Do not:

- add selection state, Composer UI, chat request fields, current-thread fields,
  a new IPC channel, or a Connections migration
- infer provider/model capabilities or behavior from ids, names, or hosts

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
```

## D2: Main-Owned Target Binding Vertical Slice

Type: one minimum usable end-to-end target selection, persistence, execution,
and recovery slice.

Goal: make every existing Send and Retry carry, validate, persist, resolve, and
attribute one explicit target, with the smallest functional Composer selector
needed to recover from an unavailable target.

Allowed files:

```text
apps/desktop/shared/chat/types.ts
apps/desktop/shared/chat/events.ts
apps/desktop/shared/chat/snapshot.ts
apps/desktop/electron/main/connections/provider-resolver.ts
apps/desktop/electron/main/current-thread/schemas.ts
apps/desktop/electron/main/current-thread/store.ts
apps/desktop/electron/main/current-thread/session-coordinator.ts
apps/desktop/electron/main/current-thread/snapshot.ts
apps/desktop/electron/main/current-thread/runtime-replay.ts
apps/desktop/electron/main/chat/session.ts
apps/desktop/electron/main/index.ts
apps/desktop/src/ui/chat/chat-types.ts
apps/desktop/src/ui/chat/chat-reducer.ts
apps/desktop/src/ui/chat/connection-status.ts
apps/desktop/src/ui/chat/use-chat-session.ts
apps/desktop/src/ui/chat/use-connection-status.ts
apps/desktop/src/ui/chat/components/ChatComposer.tsx
apps/desktop/src/ui/chat/components/ChatWorkspace.tsx
apps/desktop/src/styles/index.css
apps/desktop/electron/main/connections/provider-resolver.test.ts
apps/desktop/electron/main/current-thread/store.test.ts
apps/desktop/electron/main/current-thread/session-coordinator.test.ts
apps/desktop/electron/main/current-thread/snapshot.test.ts
apps/desktop/electron/main/current-thread/runtime-replay.test.ts
apps/desktop/electron/main/chat/client.test.ts
apps/desktop/electron/main/chat/session.test.ts
apps/desktop/electron/main/chat/session-runtime-chat-state.integration.test.ts
apps/desktop/electron/main/index.test.ts
apps/desktop/src/ui/chat/chat-reducer.test.ts
apps/desktop/src/ui/chat/connection-status.test.ts
apps/desktop/src/ui/chat/components/ChatComposer.test.ts
apps/desktop/src/ui/chat/components/ChatWorkspace.test.ts
```

An unlisted production file requires stopping and re-planning before editing.

Required:

- add the safe selection and attribution contracts plus the retryable
  `target_unavailable` error
- make request target required and reject malformed or unavailable selections in
  Electron main
- read current-thread versions 1 and 2, preserve unknown files, and write the
  version-2 target binding only through valid append, `bind-resolved-target`,
  settlement, recovery, or retry transitions
- write durable pending plus selection before resolving; bind safe attribution
  durably before runtime replay/start or a provider request
- preserve terminal ordering after a runtime turn starts: runtime terminal,
  durable terminal, renderer terminal event
- when target resolution fails before runtime starts, settle the durable pending
  turn first and then emit the renderer `target_unavailable` error; no runtime
  terminal step exists on that path
- settle target-resolution failures durably as retryable
  `target_unavailable`, preserving the ability to choose a different target and
  Retry
- initialize renderer target readiness from both snapshot and catalog using the
  locked precedence rules; no arrival-order or catalog-refresh rewrite
- add the smallest keyboard-accessible Composer selector that can show the safe
  catalog, preserve an unavailable committed selection, and let the user choose
  another available target before Retry
- keep the selector usable while a response is active; capture selection at
  submission so later draft changes affect only the next Send or Retry
- disable Send while target readiness is incomplete or the selected draft is
  unavailable, without changing Stop behavior
- preserve current user/assistant identity, current provider-message derivation,
  Stop, New thread reset, interrupted recovery, and default-on runtime-backed
  chat state
- keep target identity, selection, and attribution out of runtime actions and
  provider request bodies except for the resolved model id already owned by the
  provider request mapper
- keep runtime replay independent of current-thread record versions by consuming
  only the existing message-level turn fields and ignoring selection and
  attribution metadata
- retain safe attribution in renderer state for later presentation without
  deriving it from the current draft

Do not:

- land a version-2 writer that the session, snapshot, retry, or recovery paths do
  not all understand
- add another durable selection owner, attempt history, silent fallback, a new
  IPC channel, or runtime protocol messages
- change Connections global-default or store behavior

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
mise run runtime:chat-state:check
```

## D3: Assistant Attribution And Target UX Polish

Type: bounded presentation and interaction polish over the functional D1-D2
contracts.

Goal: present the actual resolved target on assistant responses and refine the
minimum D2 selector without changing target semantics or ownership.

Allowed files:

```text
apps/desktop/src/ui/chat/components/ChatComposer.tsx
apps/desktop/src/ui/chat/components/ChatComposer.test.ts
apps/desktop/src/ui/chat/components/ChatMessage.tsx
apps/desktop/src/ui/chat/components/ChatMessage.test.tsx
apps/desktop/src/ui/chat/components/ChatWorkspace.tsx
apps/desktop/src/ui/chat/components/ChatWorkspace.test.ts
apps/desktop/src/ui/chat/thread-items.ts
apps/desktop/src/ui/chat/thread-items.test.ts
apps/desktop/src/styles/index.css
```

An unlisted production file requires stopping and re-planning before editing.

Required:

- refine the D2 selector's compact labels, loading/unavailable states, keyboard
  behavior, actionable copy, and responsive layout without changing its state
  transitions
- show compact main-confirmed provider/model attribution on assistant responses;
  never infer it from the current draft
- preserve the unavailable-selection and active-generation behavior already
  implemented by D2
- preserve the single-page chat, plain-text messages, existing Connections
  settings, and current responsive Composer behavior

Do not:

- add model roles, automatic routing, capability badges, pricing, token counts,
  provider parameters, or a new Settings surface
- change request, persistence, resolution, retry, or target-readiness semantics
- mutate the global default or persist an unsent draft
- display full base URLs, credentials, raw config, or provider payloads

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
mise run desktop:build
```

## D4: Target Lifecycle And Compatibility Hardening

Type: focused lifecycle, migration, failure, and regression hardening.

Goal: prove that target state remains deterministic across refresh, failure,
retry, reset, restart, and version boundaries without adding new architecture.

Allowed files: the production files listed by D1-D3 and their corresponding
tests only. A new production module, shared abstraction, state owner, or bridge
surface requires stopping and re-planning instead of treating hardening as
blanket permission.

Required automated coverage:

- snapshot/catalog completion in either order yields the same selected draft
- a committed unavailable selection stays selected and blocks Send until the
  user chooses an available target
- catalog refresh updates labels/availability but not the draft selection
- New thread reseeds from the latest global default, then `.env`, then missing
- `.env` remains explicitly selectable when a Connections default exists;
  attribution records the effective model used by each attempt
- deleting/disabling a provider or model, losing a credential, or losing `.env`
  configuration fails closed without another-target fallback
- target resolution failure preserves Retry eligibility and a later Retry with a
  valid current draft keeps stable message ids and a new request id
- target changes during generation do not affect the active request, Stop, or
  its eventual attribution
- version-1 stable read does not rewrite; mutation/recovery upgrades lazily;
  historical targets remain unknown; version 2 rehydrates selection and
  attribution
- malformed/unknown future records fail closed without overwrite; explicit New
  thread remains the only destructive recovery action
- generic, Ark-compatible, and GLM-compatible streaming retain existing request,
  terminal, and reasoning-isolation behavior

Do not:

- add a new state owner, generalized migration framework, adapter layer,
  capability profile, provider policy, or broad UI redesign
- weaken an existing current-thread, provider, renderer, or runtime regression
  test

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
mise run runtime:chat-state:check
```

## D5: Composer Target Selection Acceptance And Docs

Type: acceptance verification and documentation sync.

Status: required automated verification passed and documentation synchronized
on 2026-08-07. Interactive provider/restart acceptance remains pending; see
[composer-target-selection-runthrough.md](./composer-target-selection-runthrough.md).

Goal: verify D1-D4 against the locked D semantics and record only behavior that
was actually demonstrated.

Allowed documentation files:

```text
README.md
AGENTS.md
apps/desktop/AGENTS.md
docs/next/agent-workbench-direction.md
docs/next/agent-workbench-task-slices.md
docs/next/composer-target-selection-runthrough.md
```

Required automated verification:

```sh
mise run desktop:check
mise run check
mise run format-check
git diff --check
```

Required manual verification:

- Send through two configured provider/model targets and confirm each assistant
  response shows its actual attribution
- switch the draft during streaming and confirm the active response keeps its
  submitted target while the next turn uses the new draft
- trigger a retryable provider failure, change the draft, and confirm Retry uses
  the new target with stable message ids
- make the selected target unavailable and confirm no fallback occurs, then
  choose another target and recover through Retry
- restart and confirm the latest committed selection and per-response
  attribution restore while an unsent draft does not
- start New thread and confirm the latest global default or `.env` fallback is
  reseeded without mutating that global default
- exercise Stop, interrupted-turn recovery, generic streaming, an available
  Ark-compatible text path, and an available GLM-compatible reasoning path
- inspect D-added catalog, chat request/event, snapshot, and durable target
  surfaces to confirm no credential, full base URL, raw provider config, raw
  reasoning, or raw provider payload crossed their boundaries; preserve the
  existing typed Connections Settings provider-detail base URL contract

Required documentation:

- record the exact automated commands and manual target paths actually exercised
- distinguish safe user selection from Electron-main resolved target ownership
- state the forward-only current-thread version-2 downgrade limitation
- keep D1-D4 marked pending until their own acceptance evidence exists

Do not:

- change application behavior in this slice; failed acceptance returns to the
  owning D1-D4 slice
- claim a provider path, restart path, migration path, or secret boundary was
  verified without evidence
- weaken automated checks or broaden D into routing, capabilities, history,
  tools, or runtime work

## E Workstream: Context Composer Experiment

Status: E0 through E0E stopped on 2026-08-09. E0F passed its bounded independent
review on 2026-08-09. The v3.0 stable-image-URL plan passed `RC-V3-PLAN-03`;
E1 completed at `1bf91cf` and passed `RC-E1-CODE-02`; E2 completed at `36e32e6`
and passed `RC-E2-CODE-03`; E3 completed at `7677868` and passed
`RC-E3-CODE-02`; E4 completed at `b13d3b8` and passed `RC-E4-CODE-02`. The v3.1
amendment passed `RC-E5-PLAN-A-02`; E5 then stopped at
`RC-E5-4K-MEMORY-01`. The user approved bounded option A; the v3.2 amendment
passed `RC-E4M-PLAN-02`, then E4M stopped at `RC-E4M-EVIDENCE-01`. Its
uncommitted Worker change was reversed. The user then approved E4R as a single
2048-edge proportional-resize candidate; its revised plan passed
`RC-E4R-PLAN-03`, but E4R stopped at its oversized EXIF-orientation gate and its
uncommitted product diff was reversed. No E slice is executable.

The user approved E0C policy A on 2026-08-09. The exact ICC assumption passed,
but E0C stopped when both bounded visible DOM grid candidates exceeded the
whole-process memory stop line. E0D then proved the preview-only grid but stopped
when its temporary full-open path copied fresh bytes through IPC into a new Blob
and object URL on each open and exceeded the same line. This narrow result does
not disprove derived previews or select a product transport. The user then
approved only E0E: an OS-temp gate for a stable opaque URL authorized and served
by main. E0E stopped when Chromium removed an explicit non-default port before
the handler, making the sealed exact-route rejection unimplementable within that
standard-scheme shape. The user then approved policy A for E0F: authorize the
canonical request identity delivered to the handler and treat syntactic
spellings erased by Chromium as aliases of the same resource. The resulting
OS-temp gate passed identity/cache reuse, revocation, security, memory, and
packaged loading. E0F alone did not authorize product code; the later reviewed
v3.0 plan authorized E1-E2, which are now complete. This document remains the
higher-priority scope gate if a conflict appears.

The v1.8 Worker/JPEG/allowlist design, capacity values, stop lines, and its old
E1-E5 file and requirement lists are failed historical candidate material.
They are non-operative and are not implementation permission. The rewritten
E1-E5 sections near the end of this workstream describe the reviewed v3.0 plan.
The active E invariants are:

- E1-E4 are complete and independently reviewed; the v3.1 canonical-identity
  amendment passed `RC-E5-PLAN-A-02`; E5 stopped at the fresh-process 4K memory
  gate; the user-approved E4M candidate passed `RC-E4M-PLAN-02` but stopped at
  `RC-E4M-EVIDENCE-01`; E4R passed `RC-E4R-PLAN-03` but stopped at its oversized
  EXIF-orientation gate; no E slice is executable
- E0D evidence is probe-scoped; no E0C capacity, product ICC allowlist, preview
  constant, or full-image transport is frozen by implication
- E0E evidence is probe-scoped; no scheme, URL shape, protocol, shared contract,
  preload/IPC method, cache, or Asset service is authorized
- E0F evidence is probe-scoped; it proves the bounded canonical-identity/native-
  cache direction feasible in the recorded environment but does not authorize
  a product protocol, shared contract, preload/IPC shape, or capacity policy
- Electron main remains authoritative for validation, metadata policy, file IO,
  durable ownership, target resolution, Provider mapping, and safe errors
- product implementation is authorized only inside the named active slice; no
  scope expansion is authorized
- v3.0 in the technical plan is the only current implementation plan and passed
  independent review as `RC-V3-PLAN-03`

Failure evidence is defined in
[context-composer-experiment-runthrough.md](./context-composer-experiment-runthrough.md);
the failed candidate implementation is recorded in
[context-composer-experiment-technical-plan.md](./context-composer-experiment-technical-plan.md).

Failed v1.8 historical candidate semantics (non-operative):

- support only PNG/JPEG through picker, paste, and drop
- preserve `userContent` and add ordered `imageRefs`; do not introduce arbitrary
  content parts
- one sandboxed Renderer Web Worker may execute ephemeral same-MIME
  canonicalization; it owns no accepted or durable state
- Electron main owns authoritative canonical validation, metadata policy,
  canonical files, durable state, target resolution, Provider mapping, and safe
  errors
- Renderer owns unsent `File` drafts, Worker lifecycle, object URLs, and a
  rebuildable projection
- emit `chat:accepted` only after canonical files and the pending user turn are
  durable; Renderer clears the matching draft only after that event
- keep target capability `unknown`; do not infer support from host/model names
- keep the OCaml protocol unchanged and project only `userContent`
- preserve text-only wire shape, streaming, Stop, Retry, New thread, target
  selection/attribution, and current-thread recovery

Historical v1.8 candidate limits (none are frozen):

```text
types: image/png, image/jpeg
images per turn: 4
draft source bytes per image: 8 MiB
canonical bytes per image: 8 MiB
new bytes per turn: 16 MiB
current-thread image bytes: 32 MiB
current-thread image count: revised-gate evidence pending
current-thread cumulative pixels: revised-gate evidence pending
maximum edge: 8192 px
maximum pixels: 8,294,400
```

The candidate table in
[context-composer-experiment-runthrough.md](./context-composer-experiment-runthrough.md#historical-v18-candidate-limits-status-reference)
is the status reference for these values. No capacity limit of any kind is
frozen.

The failed v1.8 candidate would stop if no real target accepted inline data
URLs, the target required remote upload/file ids, the sandboxed native Web
Worker missed E0B performance, metadata, build, lifecycle, decoded-grid memory,
or evidence-review boundary, or implementation required a dependency,
`utilityProcess`, general Asset service, database, worker pool,
thumbnail/lazy-load layer, new IPC namespace, new OCaml protocol, or behavior
outside the historical candidate semantics above.

## E0: Context Composer Scope And Feasibility Gate

Type: real-target/performance probe and documentation-only scope gate.

Status: stopped on 2026-08-09. See
[context-composer-experiment-runthrough.md](./context-composer-experiment-runthrough.md).

Allowed files:

```text
AGENTS.md
apps/desktop/AGENTS.md
docs/next/agent-workbench-task-slices.md
docs/next/context-composer-experiment-runthrough.md
```

Required:

- prove one configured OpenAI-compatible target accepts a streamed
  text-plus-inline-image request and semantically uses the synthetic image
- measure 25 MP canonicalization, four-image Renderer/main roundtrip, 32 MiB
  hydration, and 32 MiB historical request construction on actual Electron
- rerun a 25 MP and minimum 8 MP high-entropy fixture before freezing limits
- record only redacted labels, request shape, environment, measurements,
  caveats, and the go/stop result

Do not change production code/tests/persisted data/provider configuration;
retain temporary probes, raw responses, Base64, private images, full base URLs,
credentials, or local absolute paths; or treat E0 as implementation permission.

Validation:

```sh
mise run desktop:build
mise run format-check
git diff --check
```

Observed result: real-target, ordinary IPC/hydration, and historical request
construction passed, but both 25 MP and minimum 8 MP high-entropy PNGs blocked
Electron main for about one second. The original PASS is withdrawn. E0 does not
authorize E1-E5.

## E0B: Native Off-Main Canonicalization Feasibility

Type: temporary Electron/Vite feasibility probe and plan/docs revision only.

Status: stopped on 2026-08-09. The OS-temp production-shape Vite Worker harness
loaded its static Worker in dev, build, and `app.asar`, but its synthetic JPEG
output contained an ICC APP2 segment that the failed v1.8 candidate's sealed
main allowlist correctly rejected. No capacity limit is frozen.

Allowed tracked files:

```text
AGENTS.md
apps/desktop/AGENTS.md
docs/next/agent-workbench-task-slices.md
docs/next/context-composer-experiment-technical-plan.md
docs/next/context-composer-experiment-runthrough.md
```

Sanitized temporary probe code and synthetic fixtures existed only in the OS
temporary directory through the bounded independent E0B review. They were never
committed and the reviewed harness was deleted after review.

Required:

- use the current sandbox/context-isolation settings and Vite's static
  `new Worker(new URL(..., import.meta.url), { type: 'module' })` shape
- use one ordinary Web Worker with no Node integration, dependency, pool,
  file-system access, bridge access, Provider access, or durable state
- canonicalize with `createImageBitmap({ imageOrientation: 'from-image' })`,
  same-size `OffscreenCanvas`, PNG or JPEG quality 0.95, and transferable
  buffers
- before Worker decode, use one pure PNG/JPEG header parser to reject truncated,
  oversized-edge, oversized-pixel, or MIME/magic-mismatched source bytes
- prove a small crafted source with oversized header dimensions is rejected
  before `createImageBitmap`, so compressed input cannot bypass the pixel bound
- keep main authoritative: bound canonical bytes, parse PNG/JPEG headers,
  cross-check with `nativeImage` decode, and fail closed on metadata-bearing
  PNG chunks, JPEG APP1-APP15/COM, or arbitrary/repeated/extended APP0 segments;
  allow at most the exact minimal JFIF APP0 shape with no thumbnail or arbitrary
  payload only when production Worker fixtures prove it necessary; add a custom
  APP0 adversarial fixture and do not synchronously re-encode
- prove production Worker loading, PNG/JPEG MIME, EXIF orientation,
  GPS/device/XMP/COM/PNG text removal, visual equivalence, remove/New
  thread/unmount, stale-result disposal, timeout/error recovery, and four-image
  sequencing
- measure peak main+Renderer+Worker working set instead of only completion RSS
- in the OS-temp harness, use many highly-compressible full-pixel images at each
  candidate count/pixel limit to create object URLs and real `<img>` elements,
  mount them in a representative visible DOM grid, wait for `img.decode()` or
  load/error completion, and measure whole-process peak working set across
  main+Renderer+Worker; use that evidence to freeze both current-thread total
  image count and cumulative pixels, with main recomputing authority from refs
  and bounded header reads rather than persisted dimensions or a cache
- retain in the runthrough the executed redacted command shapes without
  absolute/private data, deterministic seed and fixture hash, repetition count,
  peak-sampling method, and packaged Worker evidence; after the reviewed
  harness is deleted, those command shapes are not a self-contained reproduction
- freeze limits only if Renderer heartbeat gap is ≤50 ms, main validation
  segments are ≤250 ms, four daily images finish ≤1.5 s, a 3840×2160
  high-entropy image finishes ≤1 s, and peak working-set increase is ≤192 MiB
- stop for a new decision if no practical current-thread count/pixel bound can
  meet peak memory without a thumbnail or lazy-load layer

Do not commit production image behavior, begin E1-E5, add a dependency or
`utilityProcess`, weaken sandbox/context isolation, relax stop lines, keep a
Blob Worker, commit probe code, retain temporary source/payloads outside OS
temp, retain them after bounded independent review, import production Renderer
components, or implement/run the E4-blocked `ChatMessage`/product message grid.

Validation:

```sh
mise run desktop:build
mise run desktop:typecheck
mise run desktop:lint
mise run format-check
git diff --check
```

Observed result: the no-dependency same-MIME Worker candidate failed the JPEG
metadata gate. A deterministic 120×80 synthetic fixture produced a 990-byte
canonical JPEG containing `FFE2 ICC_PROFILE`; main rejected it as required by
the failed v1.8 candidate's APP1-APP15 deny rule. The remaining lifecycle/grid
matrix was not promoted after this Stop condition. At E0B Stop, E1-E5 remained
blocked pending E0C.

## E0C: Exact Chromium ICC Allowlist Feasibility

Type: temporary Electron/Vite feasibility probe and plan/docs evidence only.

Status: stopped on 2026-08-09 after independent review. E0C is not product
implementation permission.

Allowed tracked files:

```text
AGENTS.md
apps/desktop/AGENTS.md
docs/next/agent-workbench-task-slices.md
docs/next/context-composer-experiment-technical-plan.md
docs/next/context-composer-experiment-runthrough.md
```

Historical sealed requirements:

- recreate the minimal OS-temp production-shape Vite Worker harness using the
  current sandbox/context-isolation settings, current installed toolchain, one
  static module Worker, no production Renderer imports, and synthetic fixtures
- generate the deterministic JPEG through the real Worker three times; record
  the canonical JPEG hash, every JPEG marker, the full APP2 payload hash, and
  the ICC bytes hash after the `ICC_PROFILE\0` sequence/count framing
- freeze an allowlist only if all three outputs contain exactly one identical
  APP2 segment with sequence `1`, count `1`, and byte-for-byte identical sRGB
  ICC payload; any output/profile variation is a Stop condition
- keep main fail closed: reject modified, truncated, repeated, additional,
  split/extended, multi-segment, or out-of-order APP2; reject APP1,
  APP3-APP15, COM, arbitrary/repeated/extended APP0, and metadata-bearing PNG
  chunks; allow only a production-proven exact minimal JFIF APP0 if present
- verify adversarial single-byte ICC mutation, missing/extra ICC bytes,
  sequence/count mutation, repeated/additional APP2, split APP2, APP2 order
  mutation, EXIF orientation, GPS/device, XMP, COM, PNG text, and PNG eXIf
  fixtures; accepted JPEG output must remain `image/jpeg`
- finish the previously blocked lifecycle, four-image timing, 4K timing,
  heartbeat, main validation, and representative visible DOM `<img>` grid
  matrix; sample main+Renderer+Worker peak working set and freeze every
  practical capacity value or stop
- rerun dev, build, and `app.asar` Worker loading and record the current
  environment, deterministic fixture provenance, redacted reproducible command
  shapes, repetition count, and peak-sampling method
- retain the sanitized OS-temp harness through one bound independent review,
  then delete it; keep only redacted evidence in the runthrough

Fixed stop lines remain heartbeat gap ≤50 ms, main synchronous validation
segment ≤250 ms, four daily images ready ≤1.5 s, 3840×2160 high-entropy image
ready ≤1 s, source/canonical bytes ≤8 MiB, maximum canonical pixels 8,294,400,
and whole-process peak working-set increase ≤192 MiB. These are gate thresholds,
not frozen product capacities; image count and cumulative pixels remain pending
until the visible-grid evidence passes.

Stop instead of widening E0C if the exact ICC output is unstable, a Chromium
upgrade changes it, safe acceptance requires parsing arbitrary ICC profiles,
any threshold or lifecycle case fails, no practical count/pixel capacity passes,
or the direction needs a dependency, new process/IPC, product code, thumbnail
or lazy-load layer, general Asset service, or new OCaml protocol.

Observed result:

- three deterministic JPEG outputs were identical; canonical SHA-256 was
  `f699c04d6b8c309403f2c69c9c58c2eddd2b4e7e4f5aa64851dc177ef0258d8f`
- the one 470-byte APP2 payload SHA-256 was
  `c3bb12de30d7357252ec3a5ec781bd2f8a6dd8c69dd7d3de97bbac262d9e1fd4`;
  the 456-byte ICC bytes SHA-256 was
  `12afb4d9953adee0607d347daee5b78b18d6b3cab2d572b88970703f5edb37bc`
- all ten exact-APP2 adversarial cases were rejected; the probe reached the
  visible-grid gate after its bounded metadata, timing, and lifecycle checks
- 12×1920×1080 produced +259.031 MiB and 8×1920×1080 produced +269.453 MiB,
  both over the fixed +192 MiB whole-process peak stop line
- independent strict review bound source-tree fingerprint
  `6e12136f051cf8ecb9cc74945391eb1076100c87cda2fd4c0a1399fe4e39768c`
  and returned `VALID_STOP`; the reviewed OS-temp harness was then deleted

At E0C Stop, no capacity or product ICC allowlist was frozen and E1-E5 remained
blocked. Later E0F/v3.0 evidence and review supersede only the current execution
status recorded at the top of this workstream.

Validation:

```sh
mise run desktop:build
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:format-check
git diff --check
```

## E0D: Derived Preview And On-Demand Full Decode Feasibility

Type: temporary Electron/Vite display-memory probe and plan/docs evidence only.

Status: stopped on 2026-08-09 after independent review. E0D is not product
implementation permission.

Allowed tracked files:

```text
AGENTS.md
apps/desktop/AGENTS.md
docs/next/agent-workbench-task-slices.md
docs/next/context-composer-experiment-technical-plan.md
docs/next/context-composer-experiment-runthrough.md
```

Required:

- recreate a minimal OS-temp production-shape Electron/Vite harness from
  scratch with the current sandbox/context-isolation settings, one static module
  Worker, no production Renderer imports, no new dependency, and synthetic data
- reuse the E0C exact APP0/APP2 evidence only inside the probe; it is still not a
  product allowlist until the whole E0D gate passes
- decode each source once in the Worker and emit two outputs: the same-MIME full
  canonical image and one aspect-preserving PNG preview whose maximum edge is
  512 px; do not add multiple preview sizes, a cache, service, or worker pool
- verify static Worker loading in build and `app.asar`, JPEG orientation/visual
  equivalence, and PNG alpha/visual equivalence with the current toolchain
- keep main authoritative for both outputs: full canonical rules remain bounded
  by the E0C candidate; preview must be PNG with only `IHDR`/`IDAT`/`IEND`, at
  most 1 MiB, maximum edge 512 px, maximum 262,144 pixels, correct orientation,
  and dimensions derived from the full canonical image
- simulate accepted ownership after import: main owns full canonical and preview
  bytes as one pair; Renderer drops source/full bytes and receives only previews
  for the message grid. Temporary harness IPC is evidence plumbing, not a new
  product contract
- prepare synthetic evidence outside measured runs, then run each display
  scenario in a fresh Electron process; load main-owned full/preview pairs before
  a 500 ms baseline sample so prior Worker/import caches cannot contaminate the
  display delta
- test the count/cumulative-pixel candidate with 12 distinct 1920×1080 images
  (24,883,200 total pixels) rendered as real visible preview `<img>` elements;
  wait for decode/load/error, two animation frames, and a settled sample
- separately test the maximum-image path with one 3840×2160 image plus eight
  1920×1080 images (also 24,883,200 total pixels): render previews, request and
  decode only the 4K full canonical on open, then close and release its DOM node
  and object URL; repeat open/close three times and never hold two full images
- repeat the fresh preview-grid and full-open scenarios three times; sample
  main+Renderer+Worker/GPU whole-process working set every 20 ms and record
  baseline/peak/delta, preview bytes, ready time, open time, heartbeat gap, main
  sync segments, visible dimensions, and live full-image count
- retain the sanitized harness and synthetic files through one bound independent
  review, then delete them and keep only redacted evidence in the runthrough

Fixed stop lines: heartbeat gap ≤50 ms; main synchronous segment ≤250 ms; four
daily full+preview outputs ready ≤1.5 s; one 4K full+preview output ready ≤1 s;
preview grid ready ≤500 ms; one 4K full open ready ≤500 ms; source/full canonical
≤8 MiB; preview ≤1 MiB and ≤262,144 pixels; every fresh-process whole-process
peak delta ≤192 MiB. Candidate count 12 and cumulative pixels 24,883,200 remain
unfrozen until every E0D item and independent review pass.

Stop instead of widening E0D if a preview exceeds its bound, the fresh preview
grid or one-full-image path misses a fixed line, memory grows across open/close
cycles, safe use requires virtualization, multiple preview tiers, a general
thumbnail/Asset service, new dependency/process/product IPC, product code, or a
new OCaml protocol. Do not try another display architecture inside E0D.

Observed result:

- full+preview import, JPEG orientation/visual equivalence, PNG alpha/visual
  equivalence, and the exact probe ICC candidate passed; four daily imports took
  246.0-252.4 ms and 4K imports took 315.2-326.3 ms
- three fresh preview-grid processes passed: 12 previews were ready in
  131.0-131.5 ms with +29.656 to +45.813 MiB whole-process peak deltas and no
  full image in the DOM
- the first fresh full-open process stopped the gate: after the preview grid was
  mounted and the baseline sampled, three one-at-a-time 4K opens took
  77.5-82.8 ms but peaked at +271.047 MiB, above the fixed +192 MiB line
- each close removed the node, revoked the object URL, and returned full-image
  DOM count to zero; the measured path still copied a fresh 8,366,208-byte
  typed array from main and created a fresh Blob/object URL on every open
- the production build emitted its static Worker; `app.asar` was not rerun
  after the valid Stop
- independent strict review bound source-tree fingerprint
  `d08f54374b7d93eccce1784413374a73d47c2049c4c5f395b7d289d3a036c879`
  and returned `VALID_STOP`

No count, pixel, preview, ICC, or transport choice is frozen. The result rejects
only E0D's sealed temporary full-open path; it does not prove the derived-preview
model generally infeasible.

Validation:

```sh
mise run desktop:build
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:format-check
git diff --check
```

## E0E: Stable Main-Authorized Asset URL Feasibility

Type: temporary Electron custom-protocol security/memory probe and plan/docs
evidence only.

Status: stopped on 2026-08-09 after independent review. E0E is not product
implementation permission.

Allowed tracked files:

```text
AGENTS.md
apps/desktop/AGENTS.md
docs/next/agent-workbench-task-slices.md
docs/next/context-composer-experiment-technical-plan.md
docs/next/context-composer-experiment-runthrough.md
```

Required:

- recreate a minimal OS-temp production-shape Electron/Vite harness with the
  current default session, sandbox/context isolation, no production Renderer
  imports, no product code, no new dependency, and synthetic images
- register one probe-only standard and secure scheme before `app.ready`; do not
  enable CSP bypass, Service Workers, Fetch API support, CORS, extensions, or
  streaming-media privileges
- give each prepared file one immutable opaque id and one stable URL shaped like
  `nyx-e0e-asset://full/<opaque-id>`; the name is evidence plumbing, not a
  product naming or contract decision
- keep an Electron-main-only id-to-file map; Renderer may receive only stable
  URLs, MIME, safe dimensions, and display labels, never full JS-owned bytes,
  local paths, raw file errors, or map contents through preload/IPC
- validate and register synthetic files before measurement; the protocol handler
  must accept only `GET`, the exact host and one opaque-id path segment, reject
  query/credentials/port/unknown/encoded traversal shapes, and return generic
  404/405 responses without path disclosure
- serve an authorized immutable file with Electron `net.fetch(file:)` and a
  streaming `Response` body; do not call `arrayBuffer()`, `readFile`, create
  a full userland Buffer/typed array, or create a Renderer Blob/object URL in the
  measured path
- prove one authorized image loads as `<img>`, Renderer cannot read its bytes
  through any JS API, and at minimum both `fetch` and `XMLHttpRequest` fail while
  canvas readback is cross-origin blocked; any successful JS byte-read stops the
  gate. Unauthorized URL variants must fail closed, and the stable URL must not
  reveal the local file path
- build the production harness and, only if the security/memory gate has not
  stopped, load one authorized image from `app.asar` packaging
- prepare the E0D maximum-image shape: one 3840×2160 near-boundary 7.5-8 MiB
  canonical image plus eight distinct 1920×1080 images, each with one
  aspect-preserving PNG preview whose maximum edge is 512 px
- in each fresh production-build Electron process, mount the nine stable preview
  URLs, await decode/load/error and two animation frames, then take a 500 ms
  whole-process baseline before opening the same stable 4K URL
- open, close, and reopen the one 4K image three times, never hold two full DOM
  images, never change its URL, wait 500 ms after each close, and record the
  median post-close working set over the final 200 ms plus protocol handler
  request count
- repeat the fresh full-open scenario three times; sample
  main+Renderer+Worker/GPU whole-process working set every 20 ms and record
  baseline/peak/delta, each open time, heartbeat gap, main synchronous segment,
  handler hits, stable URL equality, post-close values, and live full-image count
- retain the sanitized harness and synthetic files through one bound independent
  review, then delete them and keep only redacted evidence in the runthrough

Fixed stop lines: security cases fail closed; Renderer cannot JS-fetch or canvas
read back the full image through fetch, XHR, canvas, or another observed JS byte
path; no local path/full IPC bytes/Blob URL appear; heartbeat gap ≤50 ms; main
synchronous segment ≤250 ms; each 4K open ready ≤500 ms; every fresh-process
whole-process peak delta ≤192 MiB. After the first-open warm-up, post-close
working set must plateau: second and third post-close medians are each no more
than 16 MiB above the first, and the third is no more than 8 MiB above the
second. Both noise allowances are strictly below one 4K RGBA frame and are leak
stop lines, not product budgets.

Stop instead of widening E0E if the protocol exposes JS-readable bytes or paths,
authorization is ambiguous, any fixed line fails, safe use requires a token
service/cache/service worker/range transport/new dependency/product code or IPC,
or a different ownership model. Do not test another transport inside E0E.

Observed result:

- production build and synthetic preparation passed; the 3840×2160 canonical
  JPEG was 8,009,319 bytes and its 512×288 PNG preview was 500,603 bytes
- one authorized 3840×2160 `<img>` loaded; Renderer `fetch` failed with
  `TypeError`, XHR failed, canvas readback raised `SecurityError`, and no local
  path was present in the safe surface
- valid GET returned 200; unknown id, query, wrong host, encoded traversal, and
  non-GET requests failed as planned; credentials were rejected before handling
- an initial explicit `:443` case returned 200 and was treated as potentially
  ambiguous; the bounded retry used non-default `:444`, which also returned
  200, while handler instrumentation observed only the canonical no-port URL
- Chromium therefore removed the explicit port before `protocol.handle`;
  the handler's `url.port` check could not enforce the sealed exact-route rule
- independent strict review bound source-tree fingerprint
  `7e11f7d0c9c87f7fd809d9a51c8aa1330687f3a5bcd136d1a6d8070d0a27053d`
  and returned `VALID_STOP`

Memory repetitions and `app.asar` were correctly not run after the security
Stop. No capacity, ICC, preview, scheme, URL, or transport choice is frozen. The
result rejects only E0E's sealed standard-scheme exact-route model.

Validation:

```sh
mise run desktop:build
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:format-check
git diff --check
```

## E0F: Canonical Request Identity And Stable Full-View Feasibility

Type: temporary Electron custom-protocol identity/cache/memory probe and
plan/docs evidence only.

Status: passed bounded independent review on 2026-08-09. E0F is feasibility
evidence, not product implementation permission.

Allowed tracked files:

```text
AGENTS.md
apps/desktop/AGENTS.md
docs/next/agent-workbench-task-slices.md
docs/next/context-composer-experiment-technical-plan.md
docs/next/context-composer-experiment-runthrough.md
```

Required:

- recreate the smallest OS-temp production-shape Electron/Vite harness with the
  current default session, sandbox/context isolation, no production Renderer
  imports, no product code, no new dependency, and synthetic images
- reuse E0E's standard+secure privilege shape with Fetch API, CORS, CSP bypass,
  Service Workers, extensions, and streaming-media privileges disabled
- define authorization identity only from the canonical `Request` delivered to
  `protocol.handle`: `GET`, exact scheme, exact host, and one main-known opaque
  id path segment, with no observable query; main remains the sole id-to-file
  owner
- treat raw spellings Chromium erases before the handler, including the tested
  non-default port alias, as the same resource identity rather than a separate
  authorization input; do not add raw-string parsing, a token/cache service, or
  another owner
- keep rejecting every observable unauthorized shape: unknown id, query, wrong
  host, encoded traversal, and non-GET; credentials must remain rejected before
  handling. Return generic errors and expose no local path or raw file error
- stream an authorized immutable file with `net.fetch(file:)` and
  `Response.body`; measured paths must not call `readFile`/`arrayBuffer`,
  construct a full userland Buffer/typed array, or create Renderer Blob/object
  URLs
- prove authorized canonical and `:444` alias `<img>` loads resolve to the
  same main asset id and identical handler-observed canonical URL; record
  `src`/`currentSrc` but do not require author spelling to change if resource
  identity and cache behavior are identical
- give identity and every memory repetition a unique initially empty
  user-data/profile; phase-scope the full-id handler counter and prove
  canonical → alias → canonical produces `0 → 1 → 1 → 1`, removing each node
  and waiting 500 ms. Any different count means the cache evidence is
  contaminated or identity did not converge and stops E0F
- after the identity process warms the cache and exits, restart with the same
  profile and scheme but do not register the target id and temporarily move its
  file outside the served set; the old stable URL must fail to load. Do not call
  `clearCache`. Restore the synthetic file only after recording the result
- repeat E0E's JS-read negatives: Renderer `fetch` and XHR must fail, canvas
  readback must raise `SecurityError`, and any other observed JS byte-read or
  local-path exposure stops E0F
- prepare one 3840×2160 near-boundary 7.5-8 MiB canonical plus eight distinct
  1920×1080 images, each with one max-edge 512 PNG preview, before measurement
- in each of three fresh production-build processes, mount nine stable preview
  URLs, await decode/load/error, two frames, and settled state, then take a
  500 ms whole-process baseline before opening the canonical stable 4K URL
- open/close the same 4K URL three times with one full DOM image at most, 500 ms
  close settle, and final-200 ms post-close median; within each isolated phase,
  require the full-id counter to start at 0 and remain at 1 after the first
  load, so later opens reuse the native resource rather than replaying main file
  transport
- sample main+Renderer+Worker/GPU whole-process working set every 20 ms and
  record baseline/peak/delta, each open time, heartbeat, main sync, handler hits,
  `src`/`currentSrc`, post-close medians, URL equality, and live full count
- after identity, security, and all memory runs pass, package the same build in
  `app.asar` and prove one canonical image loads; do not claim packaged evidence
  if an earlier Stop prevents the run
- retain the sanitized harness and synthetic files through one bound independent
  review, then delete them and keep only redacted evidence in the runthrough

Fixed stop lines: isolated identity counter is `0→1→1→1`; same-profile
post-restart revoked URL fails without cache clearing; canonical/alias identity
and other unauthorized/JS-read checks pass; no path/full IPC bytes/Blob URL
appear; heartbeat gap ≤50 ms; main synchronous segment ≤250 ms; each 4K open
ready ≤500 ms; every fresh-process whole-process peak delta ≤192 MiB. After
first-open warm-up, second/third post-close medians are each ≤first+16 MiB and
third ≤second+8 MiB.

Stop instead of widening E0F if Chromium gives canonical and alias different
handler/cache identities, cache serves a revoked id after restart, any
handler/file replay occurs after the first full load, security or memory misses
a line, or the direction needs manual cache, token service, alternate URL shape,
non-standard scheme, new dependency, product code/IPC, or a different owner. Do
not try another transport in E0F.

Observed result:

- canonical → `:444` alias → canonical loaded 3840×2160 with a phase-scoped
  handler counter of `0→1→1→1`; Renderer fetch/XHR/canvas reads and all sealed
  unauthorized routes remained blocked without path exposure
- a same-profile restart with the id unregistered and source moved failed the
  warmed URL without `clearCache`
- three fresh-profile runs with nine previews and one on-demand 4K image had
  whole-process peak deltas of 105.297, 103.555, and 104.844 MiB; every timing,
  handler, and post-close plateau line passed
- the same production build loaded 3840×2160 from `app.asar`; the scoped repair
  recorded runtime `appPath` and executable-path evidence
- independent review bound source fingerprints
  `14637395415f46fa6697af6917b08b143e9e81890690bd7e1210850eff2a6961`
  and `d6d41f4f8b52626e0ecd873f134791f7fec2b553f2cb5f900285f478ec8642fc`,
  then returned PASS; the OS-temp harness and synthetic data were deleted

Validation:

```sh
mise run desktop:build
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:format-check
git diff --check
```

## E1: Image Refs And Current-Thread V3

Type: shared chat contract and current-thread schema/migration only.

Status: completed at `1bf91cf`; independent review `RC-E1-CODE-02` passed.

Allowed files:

```text
apps/desktop/shared/chat/types.ts
apps/desktop/shared/chat/snapshot.ts
apps/desktop/shared/contracts/desktop.ts only for required type propagation
apps/desktop/electron/main/current-thread/schemas.ts
apps/desktop/electron/main/current-thread/store.ts
apps/desktop/electron/main/current-thread/session-coordinator.ts
apps/desktop/electron/main/current-thread/snapshot.ts
corresponding near-source tests
```

Required:

- add `NyxChatImageRef`, optional new-message refs/pair payload boundary types,
  and user-message image availability projection without changing the existing
  text-only compatibility message list
- add current-thread v3 with required per-turn ordered refs; content may be empty
  only when refs are non-empty; keep image identity stable across terminal
  transitions and Retry and unique across the current thread
- keep v1/v2 stable reads byte-stable; v1 text mutation/recovery still reaches
  only v2, v2 text stays v2, first image-bearing mutation upgrades the complete
  record to v3, and later v3 text turns carry empty refs
- keep JSON free of bytes, URLs, paths, data URLs, original filenames, and
  Renderer-declared byte sizes; malformed/unknown future records fail closed
- update provider-history and snapshot pure projections for v3 refs; the
  snapshot mapper accepts an explicit set of available ids and E1 passes an
  empty set, so it performs no file IO. E2 wires the real bounded availability
  result without adding a second snapshot model
- preserve image-only turns as `{ role: 'user', content: '' }` in the pure
  text compatibility history; cover next-turn, Retry, and hydration mapping

Do not implement file import, `chat:accepted`, stable URLs, Provider mapping,
Composer UI, a new bridge method/channel, Connections changes, OCaml types, or
text-only behavior changes.

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
```

Recorded result: shared refs, strict current-thread v3 migration, stable Retry
identity, image-only compatibility history, and explicit snapshot availability
projection are implemented. The full desktop suite passed with 356 tests and 16
skips; typecheck, compatibility typecheck, lint, format check, and
`runtime:chat-state:check` also passed. E1 added no file IO, protocol, Provider
image mapping, Renderer image UI, new IPC namespace, or OCaml type.

## E2: Main Image Import And Durable Acceptance

Type: Electron-main validation, canonical storage, and acceptance lifecycle.

Status: completed at `36e32e6`; independent review `RC-E2-CODE-03` passed.

Allowed files:

```text
apps/desktop/electron/main/chat/session.ts
apps/desktop/electron/main/index.ts
apps/desktop/electron/main/current-thread/store.ts
apps/desktop/electron/main/current-thread/file-adapter.ts
apps/desktop/electron/main/current-thread/session-coordinator.ts
apps/desktop/electron/main/current-thread/snapshot.ts
apps/desktop/electron/main/current-thread/image-files.ts
apps/desktop/electron/main/current-thread/image-protocol.ts
apps/desktop/shared/chat/image-file.ts
apps/desktop/shared/chat/image-url.ts
apps/desktop/shared/chat/events.ts
corresponding near-source tests
```

Required:

- validate request shape, UUID ids, byte budgets, PNG/JPEG magic, pre-decode
  dimensions/pixels, decoded size, canonical/preview pair agreement, and MIME
  agreement
- keep one stateless shared byte parser for Renderer preflight and independent
  main validation; do not add a validator service or mutable cache
- treat canonical payload as untrusted; use header parsing plus Electron
  `nativeImage` decode for MIME/dimension agreement; accept only the v3.0 exact
  PNG chunks and byte-equal JPEG JFIF/ICC evidence, and never synchronously
  re-encode
- write `.full` and `.preview` final files before the pending record; emit the
  identity-only `chat:accepted` only from `ChatSessionManager` after record
  commit and before target resolution
- compose one current-thread image owner from `userData`; use it for coordinator
  prepare/reset/reconcile, protocol routing, Provider reads, and snapshot
  availability without a second Store
- register `nyx-image` before ready with only standard+secure privileges; handle
  exact canonical `preview|full` GET routes, authorize ids from the current
  durable record, and stream `net.fetch(file:)` without Renderer/full userland
  bytes or local paths
- snapshot returns refs + pair availability only; no bytes/URL/path. Missing
  pairs do not fail unrelated text/images, while Provider/Retry fail closed
- use one local write contract: `rename` resolve is committed; reject leaves the
  final path unchanged; do no fallible work after record rename before returning
- provide one main-only bounded image read that rejects symlinks, non-files,
  empty/truncated/mismatched/oversized files; protocol cache-miss serving uses
  bounded stat/header checks plus native streaming rather than that full read
- cover Stop before/after record commit, New thread reset-before-directory-delete,
  orphan reconcile, target-bind write failure, and stale session suppression

Do not add fsync/power-loss claims, cache/token manager, a second Store,
transaction manager, fresh-disk recovery, database, general Asset service,
remote upload, another IPC namespace, a codec dependency, `utilityProcess`, or
Runtime/Provider side effects after failed prepare/bind.

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
```

Recorded result: strict shared/main validation, bounded immutable image pairs,
durable accepted/Stop ordering, stable main-authorized protocol streaming,
Retry fail-closed reads, reset/reconcile, and snapshot availability are
implemented. The full desktop suite passed with 385 tests and 16 skips;
typecheck, compatibility typecheck, lint, format check, production build, and
`runtime:chat-state:check` also passed. E2 added no Provider image mapping,
Renderer image UI, new IPC namespace, dependency, database, general Asset
service, or OCaml type.

## E3: Provider Image Mapping And Runtime Projection

Type: existing OpenAI-compatible mapping, safe errors, and text-only Runtime
projection.

Status: completed at `7677868`; independent review `RC-E3-CODE-02` passed.

Allowed files:

```text
apps/desktop/electron/main/chat/client.ts
apps/desktop/electron/main/chat/session.ts
apps/desktop/shared/chat/types.ts
apps/desktop/electron/main/current-thread/schemas.ts
apps/desktop/electron/main/current-thread/session-coordinator.ts
apps/desktop/electron/main/current-thread/image-files.ts
apps/desktop/electron/main/current-thread/runtime-replay.ts
corresponding near-source tests
```

Required:

- preserve the existing text-only Provider request byte-for-byte; derive every
  image-bearing Provider message in main from the durable v3 record and the E2
  bounded canonical reader
- use a text-first content array followed by ordered transient data URLs;
  image-only messages omit the empty text part, and missing/corrupt files fail
  the whole build instead of silently dropping refs
- add `content_rejected` once to the shared error codes and v3 safe-error
  schema; map only image-bearing 400/413/415 to that retryable safe error, write
  the terminal record before emitting it, and never expose Provider bodies,
  Base64, ids, or paths
- let target-switch Retry reuse the same refs/files without copy or rewrite;
  retain current text-only 400 behavior
- keep Runtime start/replay text-only, projecting exactly `userContent`; an
  image-only turn projects the empty string and does not change OCaml types or
  protocol

Do not add capability inference/cache/registry, provider-specific parameters,
remote upload, raw Provider errors, or any new OCaml message/type.

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
mise run runtime:chat-state:check
```

Recorded result: Electron main now derives ordered text/image Provider messages
from the committed v3 record and bounded canonical reader while Runtime remains
text-only. Image-bearing 400/413/415 responses become the fixed retryable
`content_rejected` error without exposing upstream bodies, ids, paths, or
Base64. Stop, Reset, Retry, target switching, image-only turns, and durable-
before-Renderer ordering are covered. The desktop suite passed with 401 tests
and 17 skips; typecheck, compatibility typecheck, lint, format check, production
build, and `runtime:chat-state:check` with 9 cases also passed. E3 added no
Renderer/Composer UI, Worker, new IPC namespace, capability registry, remote
upload, dependency, or OCaml type.

## E4: Composer Images, Thread Display, And Hydration

Type: bounded Renderer interaction and projection.

Status: completed at `b13d3b8`; independent review `RC-E4-CODE-02` passed.

Allowed files:

```text
apps/desktop/src/ui/chat/use-chat-session.ts
apps/desktop/src/ui/chat/chat-reducer.ts
apps/desktop/src/ui/chat/chat-types.ts
apps/desktop/src/ui/chat/chat-presenters.ts
apps/desktop/src/ui/chat/image-canonicalizer.worker.ts
apps/desktop/src/ui/chat/components/ChatWorkspace.tsx
apps/desktop/src/ui/chat/components/ChatComposer.tsx
apps/desktop/src/ui/chat/components/ChatThread.tsx
apps/desktop/src/ui/chat/components/ChatMessage.tsx
corresponding near-source tests and existing chat styles
```

Required:

- preserve the textarea and normalize picker/paste/drop images into one draft
  path; ordinary text paste/drop retains browser behavior
- use one lazy sandboxed Worker for `preparing -> ready | failed`; transfer
  source/canonical/preview buffers, discard stale results, and release every
  Worker, bitmap, buffer, and draft object URL on its terminal path
- support ordered preview/remove and image-only Send; Send is enabled only when
  all images are ready, and the captured draft remains visible and locked until
  the identity-only `chat:accepted`
- make accepted the reducer commit point: before it, failure retains draft,
  target, and existing Retry error; after it, clear only the captured draft and
  insert/update the turn. A streaming response may coexist with a new editable
  draft, but that draft cannot Send
- retain the original `File`/`Blob` only until Worker ready; failed drafts keep
  it for Retry/remove, while ready drafts release it and retain only the two
  outbound buffers plus preview URL. Do not retain bitmap/canvas/full DOM bytes
- keep image-only user entries in the text compatibility mapper so next-turn,
  Retry, and hydrated requests match main's durable history
- use E2 stable preview/full URLs for sent and hydrated images, never accepted
  or snapshot bytes and never a Renderer cache; render one native dialog with
  at most one full image, an unavailable placeholder, focus return, keyboard
  behavior, labels, and `aria-live` feedback

Do not add contenteditable/rich text, drag sorting, crop/annotation/OCR, a
global image cache, Worker pool/manager, third-party image/image-processing
dependency, unrelated Composer redesign, Renderer file paths/credentials/raw
Provider config, or durable Renderer ownership.

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
mise run desktop:build
```

Recorded result: picker, paste, and supported-image drop now share one bounded
draft path backed by one lazy sequential Worker. Image-only Send, ordered draft
previews, accepted-only reducer commit, pre-accepted draft retention, Retry,
stable sent/hydrated image URLs, unavailable placeholders, and one native full-
image dialog are implemented. Reset failure retains unsent text and every draft
resource; successful reset, accepted, remove, stale result, and unmount paths
release their owned resources. The desktop suite passed with 417 tests and 17
skips; typecheck, compatibility typecheck, lint, format check, and production
build also passed, including a separate Worker chunk. E4 added no new IPC,
dependency, Renderer cache, rich text, assistant image output, Provider policy,
or OCaml change.

## E4M: Worker Live-Set Repair Gate

Type: one bounded E4 owning-slice repair experiment.

Status: stopped. The v3.2 amendment passed `RC-E4M-PLAN-02`, but the first valid
4K repetition failed the fixed memory line and `RC-E4M-EVIDENCE-01` returned
`VALID_STOP`. Repetitions 2/3 and the ordinary matrix were not run; the
uncommitted Worker change was reversed.

Allowed product file:

```text
apps/desktop/src/ui/chat/image-canonicalizer.worker.ts
```

Required:

- preserve the exact current decode, canonical/preview bytes policy, parser,
  transfer, sequential Worker, safe error, and main-owned validation behavior
- clear the source after decode; draw both canvases while the bitmap is valid,
  then close it before encoding; release each canvas/context after its encode
  and each encoded Blob immediately after its buffer conversion; `finally`
  releases every remaining reference without adding a full-resolution copy
- add no helper, abstraction, dependency, cache, Worker/process, IPC, scheme,
  capacity, quality, or dimension change
- build the production Worker and run the exact reviewed 3840×2160 fixture
  through the packaged real E4 drop path in three fresh processes/profiles
- preserve the E5 timing lines and require every repetition's recursive whole-
  process peak delta to remain <=192 MiB; stop on the first failure
- after all 4K repetitions pass, rerun the four-ordinary-image packaged real E4
  import matrix in the new build and a fresh process/profile; do not reuse the
  pre-change evidence, and apply its existing timing and <=192 MiB lines
- bind source, build, `app.asar`, commands, process tree, samples, and result for
  independent code/evidence review

If all three repetitions pass, commit only after independent review and resume
E5 at its unrun remainder. If any fails, reverse the uncommitted Worker change,
record `VALID_STOP`, and require a new user decision. Do not try a second code
variant inside E4M.

## E4R: 2048-Edge Decoder Resize Gate

Type: one bounded E4 owning-slice product repair candidate.

Status: stopped. The user approved proportional downscale instead of full-4K
canonical support, and the revised plan passed `RC-E4R-PLAN-03`. The packaged
oversized EXIF-orientation gate then failed: Chromium independently decoded the
source as portrait, while the product persisted landscape full and preview
output. The ordinary matrix was not run and the uncommitted E4R product diff was
reversed. No E slice is executable pending a new user decision.

Allowed product files:

```text
apps/desktop/shared/chat/image-file.ts
apps/desktop/electron/main/current-thread/image-file.test.ts
apps/desktop/electron/main/current-thread/image-files.ts
apps/desktop/electron/main/current-thread/image-files.test.ts
apps/desktop/src/ui/chat/image-canonicalizer.worker.ts
apps/desktop/src/ui/chat/use-chat-session.ts
apps/desktop/src/ui/chat/use-chat-session.test.ts
```

Required:

- keep the existing 8192-edge / 8,294,400-pixel source preflight and historical
  durable reader so pre-E4R images remain valid for hydration, Provider build,
  and Retry
- add one fixed 2048-pixel canonical long-edge limit for new imports only;
  proportionally downscale without crop or upscale via `createImageBitmap`
  resize options before the full canonical canvas is allocated
- before allocating the full canvas, verify the oriented bitmap's long edge and
  aspect ratio; do not assume source SOF width/height has the same orientation
  as the bitmap after EXIF orientation
- preserve same-MIME canonical output, JPEG 0.95, 512-edge PNG preview, strict
  parser, sequential Worker, transferable buffers, and all existing owner and
  accepted/durable boundaries
- have Worker reject an over-limit output and Electron main independently
  enforce the new limit only while validating a newly written pair; do not apply
  the new limit in `readCanonical`
- add a boundary regression using one valid `>2048` canonical that remains under
  the historical source limits: new `writeNewImages` rejects it while historical
  `readCanonical` succeeds
- add no UI, setting, dependency, helper layer, Worker/process, IPC, schema,
  cache, original retention, format, Provider/Runtime behavior, or general Asset
  abstraction
- because the old OS-temp E5 fixture is no longer present, pre-bind the two-file
  generator at combined SHA-256 `d7595a...d6eaf`: Electron 41.7.2 / Chromium
  146 creates one 3840x2160 canvas; seed `0x4e595845` advances xorshift32 once
  per RGB pixel and writes its three state bytes with alpha 255; the sole encoder
  call is `canvas.toBlob("image/jpeg", 0.85)`
- after this amendment passes review, execute that exact generator command once
  in a separate unmeasured process; the first output must be a 3840x2160 JPEG
  under the existing 8 MiB source cap, otherwise Stop without changing seed,
  quality, algorithm, source, or command and without rerunning it; before counted
  runs bind bytes, SHA-256, size, type, metadata, source hash, command, and
  Electron/Chromium versions
- retain the three already recorded fresh-process packaged 4K observations as
  bounded engineering evidence: all produced 2048x1152 canonical and 512x288
  preview output, passed product timing lines, and observed 112,041,984 to
  114,753,536-byte recursive peak deltas; none is a strict memory proof because
  the sampler validity conditions did not all pass
- under the user-approved v3.4 evidence-policy amendment, stop iterating the
  sampler and do not require each `ps` call to return within 30 ms or all three
  observations to be formally countable; retain the 192 MiB product stop line,
  so any later observed peak above it still stops E4R
- use the same build to run one oversized EXIF 90° or
  270° production-Worker fixture and prove correct orientation, aspect ratio,
  no crop, and no stretch; if native resize cannot do this, Stop without an EXIF
  parser or dependency
- then run the four-ordinary-image packaged real E4 matrix once in another fresh
  process/profile and preserve its output/timing/memory observations; sampler
  execution duration is diagnostic rather than a product gate, while any
  observed peak above 192 MiB remains a Stop; bind source/build/`app.asar`/
  commands/process samples/results for independent code/evidence review

If all product checks pass, commit only after independent review and resume E5
at its unrun remainder. If product correctness, product timing, or an observed
memory peak fails, reverse the uncommitted E4R product diff, record the bounded
Stop, and require a new user decision. Do not try a second size, encoder,
transport, memory line, or sampler inside E4R.

Recorded outcome: the oversized EXIF orientation-6 source independently decoded
as 1800x3000, but the packaged product persisted a 2048x1229 full image and a
512x307 preview instead of the required 1229x2048 and 307x512 portrait outputs.
Ready was 263.8 ms, heartbeat max gap was 13.4 ms, main sync was 170.0 ms, and
the observed recursive peak delta was 88,850,432 bytes, so orientation was the
first product failure. The ordinary matrix was not run. The E4R product diff was
precisely reversed; this section is historical evidence, not implementation
permission.

## E5: Context Composer Lifecycle Acceptance And Docs

Type: acceptance verification and documentation sync.

Status: stopped. After policy A and `RC-E5-PLAN-A-02`, the fresh-process 4K
import measured +309.859 MiB against the fixed +192 MiB line. Independent review
`RC-E5-4K-MEMORY-01` returned `VALID_STOP`. E5 remains stopped while E4M is
stopped and E4R is also stopped. No E slice is executable.

Allowed files: E1-E4 production files only for fixes returned to their owning
slice, corresponding tests, and:

```text
AGENTS.md
apps/desktop/AGENTS.md
docs/next/agent-workbench-task-slices.md
docs/next/context-composer-experiment-runthrough.md
```

Required:

- prove text-only parity plus text+image, image-only, ordered multi-image,
  hydration, missing/corrupt placeholder and fail-closed Provider/Retry paths
- prove accepted ordering, failure-before-accept retention, Stop before/after
  commit, bind failure, restart/interrupted pending, stale events, New thread
  reset ordering, orphan reconcile, and every draft object-URL terminal path
- rerun the protocol canonical-alias/security/JS-read/cache/restart-revocation
  matrix and production Worker from the packaged app; evidence must bind the
  running app to the reviewed build. Raw port/case/fragment/credentials spelling
  erased before `protocol.handle` is the same canonical identity and carries no
  authority; any observable credentials, query, wrong host, unknown id,
  traversal, or non-GET request still fails closed
- through the real E4 import handler in that packaged product, run four ordinary
  images and one high-entropy 4K image across picker/paste/drop -> Worker -> main
  validation; record 4-image ready <=1.5 s, 4K ready <=1 s, heartbeat <=50 ms,
  single-image main sync <=250 ms, and each whole-process peak delta <=192 MiB.
  Use a fresh process and stop this import-phase sample after accepted/main-
  validation settle and before Provider build
- mount the real product grid at 12 refs/24,883,200 full pixels, open the max
  image in the single dialog, and build the 32 MiB Provider request concurrently;
  require open <=500 ms, heartbeat <=50 ms, main sync <=250 ms, whole-process
  peak delta <=192 MiB, and the E0F 16/8 MiB post-close plateau allowance
- complete one real target text+image and image-only run; use a second target for
  reject/switch/retry when available, and record exact redacted evidence without
  claiming unobserved behavior
- verify that disabling new image ingress still preserves v3 read/display,
  historical Provider reconstruction, Retry, safe errors, and reset/reconcile

Do not fix failed acceptance outside its owning E1-E4 boundary or broaden E into
documents/remote files, general assets/parts, capability policy, assistant rich
output, Markdown/HTML/Artifact/Generative UI, history, tools, agents, new IPC,
or new OCaml protocol.

Validation:

```sh
mise run desktop:test
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:build
mise run runtime:chat-state:check
mise run desktop:check
mise run check
mise run format-check
git diff --check
```
