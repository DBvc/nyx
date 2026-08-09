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
  the failed v1.8 candidate's sealed metadata allowlist. No E slice is permitted
  until the user chooses and approves a revised feasibility direction; `E1`
  through `E5` remain blocked. No capacity limit is frozen. Evidence is recorded
  in [context-composer-experiment-runthrough.md](./context-composer-experiment-runthrough.md).
- The v1.8 PNG/JPEG/Worker design and E1-E5 slice/file details are failed
  historical candidate material, not an active workstream or implementation
  permission. Any revised gate may change those details. It still may not
  authorize product implementation or scope expansion before approval.

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

Status: E0 and E0B stopped on 2026-08-09. E1-E5 are blocked pending a new user decision.

There is currently no executable E entry gate. A request for
`context-composer-experiment` or a named E slice does not unblock E1-E5; a new
user-approved feasibility direction and independent review must pass first.
This document remains the higher-priority scope gate if a conflict appears.

The v1.8 Worker/JPEG/allowlist design, capacity values, stop lines, and all
E1-E5 file and requirement lists below are failed historical candidate material.
They are non-operative and are not implementation permission. A revised gate
may change input types, canonicalization executor, metadata policy, capacities,
and slice/file details. The only active E invariants are:

- E1-E5 remain blocked
- Electron main remains authoritative for validation, metadata policy, file IO,
  durable ownership, target resolution, Provider mapping, and safe errors
- no product implementation or scope expansion is authorized

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
matrix was not promoted after this Stop condition. E1-E5 stay blocked until the
user approves a revised gate, which may change input types, canonicalization
executor, metadata policy, capacities, and slice/file details.

## E1: Image Refs And Current-Thread V3

Type: shared chat contract and current-thread schema/migration only.

Status: blocked until the user approves a revised direction and its feasibility evidence and plan pass independent review.

The file list and requirements below are failed v1.8 historical candidate
material, non-operative, and not implementation permission.

Allowed files:

```text
apps/desktop/shared/chat/types.ts
apps/desktop/shared/chat/snapshot.ts
apps/desktop/shared/contracts/desktop.ts only for required type propagation
apps/desktop/electron/preload/index.ts only for required type propagation
apps/desktop/electron/main/current-thread/schemas.ts
apps/desktop/electron/main/current-thread/store.ts
apps/desktop/electron/main/current-thread/session-coordinator.ts
apps/desktop/electron/main/current-thread/snapshot.ts
corresponding near-source tests
```

Required: add ordered `imageRefs`, Worker-canonical new-image bytes, accepted
canonical bytes, image-only validation, stable Retry identity, and lazy v3
migration. Keep v1/v2 stable reads byte-stable; upgrade only on the first
image-bearing mutation; keep later text turns in v3; store no
bytes/Base64/paths/original filenames in JSON; fail closed on malformed or
unknown future records.

Do not implement file import, Provider mapping, Composer UI, a new bridge method
or IPC channel, Connections changes, OCaml types, or text-only behavior changes.

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
```

## E2: Main Image Import And Durable Acceptance

Type: Electron-main validation, canonical storage, and acceptance lifecycle.

Status: blocked until the user approves a revised direction and its feasibility evidence and plan pass independent review.

The file list and requirements below are failed v1.8 historical candidate
material, non-operative, and not implementation permission.

Allowed files:

```text
apps/desktop/electron/main/chat/session.ts
apps/desktop/electron/main/index.ts
apps/desktop/electron/main/current-thread/store.ts
apps/desktop/electron/main/current-thread/file-adapter.ts
apps/desktop/electron/main/current-thread/session-coordinator.ts
apps/desktop/electron/main/current-thread/snapshot.ts
one direct image helper under apps/desktop/electron/main/current-thread/
apps/desktop/shared/chat/image-file.ts
apps/desktop/shared/chat/events.ts
corresponding near-source tests
```

Required:

- validate request shape, UUID ids, byte budgets, PNG/JPEG magic, pre-decode
  dimensions/pixels, decoded size, and MIME agreement
- keep one stateless shared byte parser for Renderer preflight and independent
  main validation; do not add a validator service or mutable cache
- treat canonical payload as untrusted; use header parsing plus Electron
  `nativeImage` decode for MIME/dimension agreement, reject metadata-bearing
  PNG chunks, JPEG APP1-APP15/COM, and arbitrary/repeated/extended APP0;
  allow at most the exact minimal JFIF APP0 shape with no thumbnail or arbitrary
  payload only if production Worker fixtures prove it necessary, and do not
  synchronously re-encode
- write canonical files before the pending record and emit `chat:accepted` only
  from `ChatSessionManager` after record commit
- compose one current-thread image owner from `userData`; use it for coordinator
  prepare/reset/reconcile and snapshot bounded reads without a second Store
- keep snapshot hydration on the same bounded image read and return safe
  unavailable descriptions without failing unrelated text/images
- use one local write contract: `rename` resolve is committed; reject leaves the
  final path unchanged; do no fallible work after record rename before returning
- provide one main-only bounded image read that rejects symlinks, non-files,
  empty/truncated/mismatched/oversized files

Do not add fsync/power-loss claims, a second Store, transaction manager,
fresh-disk recovery, database, general Asset service, remote upload, another
IPC, a codec dependency, `utilityProcess`, or Runtime/Provider side effects
after failed prepare/bind.

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
```

## E3: Provider Image Mapping And Runtime Projection

Type: existing OpenAI-compatible mapping, safe errors, and text-only Runtime
projection.

Status: blocked until the user approves a revised direction and its feasibility evidence and plan pass independent review.

The file list and requirements below are failed v1.8 historical candidate
material, non-operative, and not implementation permission.

Allowed files:

```text
apps/desktop/electron/main/chat/client.ts
apps/desktop/electron/main/chat/session.ts
apps/desktop/shared/chat/types.ts
apps/desktop/electron/main/current-thread/schemas.ts
apps/desktop/electron/main/current-thread/session-coordinator.ts
apps/desktop/electron/main/current-thread/runtime-replay.ts
corresponding near-source tests
```

Required: preserve exact text-only wire shape; map image-bearing turns to
text-first arrays and transient data URLs in `imageRefs` order; construct
historical context from durable files and fail closed on unavailable refs; map
image-bearing 400/413/415 to safe retryable `content_rejected`; switch target on
Retry without copying files; add `content_rejected` once to the shared chat
error code, v3 persisted safe-error schema/message, and coordinator settlement
without changing v1/v2 schemas; project only `userContent` to OCaml.

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

## E4: Composer Images, Thread Display, And Hydration

Type: bounded Renderer interaction and projection.

Status: blocked until the user approves a revised direction and its feasibility evidence and plan pass independent review.

The file list and requirements below are failed v1.8 historical candidate
material, non-operative, and not implementation permission.

Allowed files:

```text
apps/desktop/src/ui/chat/use-chat-session.ts
apps/desktop/src/ui/chat/chat-reducer.ts
apps/desktop/src/ui/chat/chat-types.ts
apps/desktop/src/ui/chat/chat-presenters.ts
apps/desktop/src/ui/chat/image-canonicalizer.worker.ts
apps/desktop/src/ui/chat/components/ChatWorkspace.tsx
apps/desktop/src/ui/chat/components/ChatComposer.tsx
apps/desktop/src/ui/chat/components/ChatMessage.tsx
corresponding near-source tests and existing chat styles
```

Required: preserve the textarea; normalize picker/paste/drop into one draft
path; use one lazy sandboxed Web Worker for `preparing → ready | failed`;
transfer source/canonical buffers; support ordered previews/remove/image-only;
allow Send only when all images are ready; retain the locked draft until
`chat:accepted`; use canonical accepted/hydrated bytes for the message grid;
discard stale Worker results; provide native dialog, missing placeholder,
keyboard/`aria-live` behavior; and release every Worker, bitmap, buffer, and
object URL on its terminal path. The historical candidate proposed testing the
real product message grid at limits that E0B never froze.

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

## E5: Context Composer Lifecycle Acceptance And Docs

Type: acceptance verification and documentation sync.

Status: blocked until the user approves a revised direction, its feasibility evidence and plan pass independent review, and E1-E4 are implemented.

The file list and requirements below are failed v1.8 historical candidate
material, non-operative, and not implementation permission.

Allowed files: E1-E4 production files only for fixes returned to their owning
slice, corresponding tests, and:

```text
AGENTS.md
apps/desktop/AGENTS.md
docs/next/agent-workbench-task-slices.md
docs/next/context-composer-experiment-runthrough.md
```

Required: prove text/image paths, Stop before/after commit, Retry/target switch,
bind failure, restart/interrupted pending, New thread, orphan reconcile,
missing/corrupt image, metadata removal, object URLs, text-only regression, and
v3 behavior after disabling new ingress. The historical candidate proposed
exercising the real product message grid at limits that E0B never froze.
Complete one real target text+image and image-only run, use a second target for
reject/switch/retry when available, and record exact redacted evidence without
claiming unobserved behavior.

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
