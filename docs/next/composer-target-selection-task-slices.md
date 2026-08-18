# Composer Target Selection Task Slices

<!-- nyx-workstream-status-owner: composer-target-selection -->

This file is the canonical current-status and contract owner for this
workstream. Historical review and commit identities remain inside the
migrated blocks; they are not permission to rerun completed slices.

## Migrated Source Block: composer-target-selection/status-summary

<!-- nyx-contract-start: composer-target-selection/status-summary sha256:32c4110b3cffb7f4d8e28c109b85c3dbc63780f4fceeefbadeabda7fbf5001ea -->

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
<!-- nyx-contract-end: composer-target-selection/status-summary -->

## Migrated Source Block: composer-target-selection/contracts

<!-- nyx-contract-start: composer-target-selection/contracts sha256:aff751900039bbbebc3cad0263887ae02a7abc74b5bf258db1c319840627a944 -->

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
docs/next/composer-target-selection-task-slices.md
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
docs/next/composer-target-selection-task-slices.md
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

<!-- nyx-contract-end: composer-target-selection/contracts -->
