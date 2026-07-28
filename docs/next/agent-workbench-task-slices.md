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
- `C0` is the completed scope gate for the planned
  `provider-compatibility-core` workstream. `C1` through `C4` are not implemented
  and may run only as separately requested, sequential slices.
- The C workstream extracts one Electron-main-only OpenAI-compatible
  compatibility path. It does not authorize a general adapter platform,
  provider-specific request policy, schema/UI expansion, or a new renderer or
  OCaml provider boundary.

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
