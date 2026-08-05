# Nyx Thread-First Agent Workbench Direction

Status: First foundation, current-thread durability, and provider compatibility
core workstreams completed. Composer target-selection scope gate approved;
implementation slices remain pending.

This document defines the direction for explicitly requested
agent-workbench work. It does not replace the default repository scope for
ordinary tasks. Unless a user explicitly asks to execute the agent-workbench
workstream or one of its task slices, follow
[v1-min-chat-implementation-plan.md](../v1-min-chat-implementation-plan.md).

## Decision

Nyx will evolve from the completed `v1 min chat` baseline toward a local-first,
thread-first personal Agent workbench.

The user-facing model is:

```text
One thread.
One thing I want done.
One input box.
A visible execution flow when real execution exists.
Results I can use.
```

The user should not choose an Ask/Work mode, a specialist Agent, or
planner/executor/reviewer model routing in the primary UI.

## First Workstream (Completed)

The first agent-workbench workstream was deliberately narrow. It prepared the
product shell and provider configuration layer without pretending that real
tools or agent execution exist.

In scope for this first workstream:

- scope-gated documentation for the agent-workbench path
- Connections settings for OpenAI-compatible provider profiles
- encrypted local API key storage owned by Electron main
- default provider/model target resolution
- `.env` provider configuration as a development fallback
- redacted connection status in the main surface
- real provider test and model refresh utilities
- thread-first UI copy
- renderer-local thread item adapter over the existing chat state

Out of scope for this first workstream:

- Ask/Work toggle
- multi-Agent picker
- planner/executor/reviewer routing UI
- tools
- MCP
- terminal execution
- browser automation
- permission approval cards
- artifacts
- persistent thread history
- projects or file context
- details drawer
- thread IPC replacing chat IPC
- OCaml thread runtime domain or Electron wiring

## Second Workstream: Current Thread Durability

The second workstream gives the one current thread a durable local lifetime. It
does not introduce a thread collection or pretend that persistent history
exists.

In scope:

- one versioned current-thread record stored by Electron main
- plaintext local conversation data protected with owner-only file permissions
- a safe typed current-thread snapshot on the existing chat bridge
- renderer hydration from that snapshot as an in-memory projection
- main-derived provider context with compatibility validation
- lazy replay through the existing runtime chat reducer before the next turn
- interrupted-turn recovery and explicit New thread/Start fresh reset

Out of scope:

- Recent, thread lists, thread switching, search, archive, or hidden history
- full thread IPC replacing chat IPC
- OCaml Thread domain or new runtime protocol messages
- activity, approvals, artifacts, tools, MCP, terminal, or browser automation
- SQLite, JSONL, conversation encryption, or multi-window synchronization

## Third Workstream: Provider Compatibility Core (Completed)

The third workstream extracted the smallest proven compatibility boundary from
the existing OpenAI-compatible chat path. It does not create a general provider
platform.

In scope:

- preserve provider identity in an Electron-main-only resolved chat target
- keep the generic OpenAI-compatible request wire shape unchanged
- normalize text, reasoning activity, finish reasons, and provider stream errors
- make empty-final and output-length terminal behavior deterministic
- preserve failed partial assistant drafts for the existing Retry path
- cover generic, Ark, and GLM response shapes with redacted fixtures

Out of scope:

- provider-specific request parameters such as `thinking`,
  `reasoning_effort`, or output-token controls
- automatic adapter selection from provider hostnames or model names
- adapter registries, capability profiles, or persisted adapter selection
- Connections schema migration, Settings UI, or model picker UI
- new shared, preload, renderer, IPC, or OCaml provider contracts
- raw reasoning display, persistence, or reuse
- tools, usage, sources, files, structured output, or native protocol adapters

This workstream can detect and report a reasoning model exhausting its output
budget. It does not claim to prevent that exhaustion.

## Fourth Workstream: Composer Target Selection (Scope Gated)

The fourth workstream lets the user choose a configured provider/model target
from the existing Composer without turning the main surface into a routing
dashboard. It reuses Connections, the one durable current thread, and the
existing chat bridge.

In scope:

- a safe catalog of configured selectable targets and an explicit `.env`
  fallback option
- an in-memory Composer draft selection whose latest submitted value becomes
  sticky for the current thread
- a required safe target selection on each Send or Retry request
- Electron-main validation and resolution with no silent fallback
- versioned current-thread selection and actual-target attribution
- compact target selection in the Composer and compact attribution on assistant
  responses
- deterministic restart, New thread, active-generation, unavailable-target,
  and Retry behavior

Out of scope:

- changing the global Connections default from the Composer
- persisting an unsent Composer draft
- exposing credentials, resolved targets, full base URLs, raw provider
  configuration, or provider execution through D-added Composer, catalog, chat,
  snapshot, or attribution surfaces; the existing typed Connections Settings
  provider-detail editing contract remains unchanged
- migrating the Connections store, adding provider-specific request policy, or
  inferring behavior from provider hostnames or model ids
- adapter registries, capability profiles, model roles, or automatic routing
- attempt history, persistent multi-thread history, tools, or new runtime
  protocol messages

Within the D-added Composer and chat surfaces, the renderer may hold safe
selection ids and labels only. The current-thread record owns committed
per-turn selection and attribution. Electron main remains the sole owner of
resolved targets and provider execution. The existing Connections Settings form
may continue to edit full provider configuration through its typed detail API.
OCaml continues to receive only the existing message-level runtime actions.

## Product Rules

### Single Primary Thread

The main surface remains one input box and one current thread. Simple questions
and task requests both happen in the same thread. Later runtime states may show
activity, approvals, or results only when backed by real implementation.

The completed second workstream lets that one current thread survive a complete
app restart. This does not authorize a Recent list or switching between
multiple threads.

### No Fake Capability Panels

Do not show tools, artifacts, history, file context, projects, commands,
approvals, or activity unless the data is real and the current slice explicitly
implements it.

### Connections Are Capability Setup

Settings and model configuration are allowed only for the explicit
agent-workbench workstream. They are capability setup, not a model-routing
dashboard.

Allowed first capability:

```text
OpenAI-compatible provider profiles
Manual model ids
Default target
Connection test
Model refresh
```

Still not allowed in the main surface:

```text
Planner model
Executor model
Reviewer model
Model routing
Agent profile
Capability graph
```

## Ownership Rules

Renderer may hold a newly typed API key only while the user edits a Settings
form and submits it to Electron main. Renderer must never retrieve stored
secrets, read environment variables, call model providers directly, spawn child
processes, talk to OCaml, or perform OS side effects.

Electron main owns provider profiles, model profiles, encrypted secrets,
provider target resolution, provider calls, cancellation, settings file IO, and
future OS-facing side effects. In the second workstream, it also owns the only
durable current-thread record, derives provider context from that record, and
exposes only a safe renderer snapshot.

OCaml remains a pure runtime semantics boundary. It must not read provider
configuration, hold provider credentials, call providers, access files, run
commands, own UI, or talk to renderer/preload.

The durable record is not stored in OCaml. A fresh runtime client may replay the
existing chat reducer actions only when the next real turn starts. Snapshot
loading must not spawn the runtime or add protocol messages.

## Current Thread Lifecycle

Electron main writes a pending turn before provider work and writes one terminal
record after the runtime transition. Completed and cancelled turns restore with
their final content. A normal provider failure restores its safe error and last
terminal draft so Retry can reuse stable message identity.

If the process exits while a turn is pending, the next store load normalizes it
to the existing `unknown`, retryable interrupted failure. Streaming deltas are
not persisted, so this does not promise recovery of a partial draft lost at
process exit.

New thread/Start fresh is a manager-global reset for the one current thread. It
aborts and settles active work, clears and closes runtime projections, removes
the durable record, and only then clears renderer state. Malformed or
schema-invalid storage is never overwritten automatically; the safe load error
remains blocked until this explicit reset succeeds.

## First Workstream Success Criteria

The first workstream is successful when:

- users can configure an OpenAI-compatible provider in Settings
- saved API keys are encrypted locally and never returned to renderer
- users can set a default provider/model target
- existing `.env` provider configuration still works when no persisted default
  exists
- the main surface can stream a response through the effective connection
- main UI language is thread-first
- existing stop, retry, reset/new thread, streaming, and runtime-backed chat
  state behavior remain intact
- no fake tools, fake artifacts, fake history, fake activity, or fake agent
  execution is shown

## Second Workstream Success Criteria

The current-thread durability workstream is successful when:

- completing a turn and restarting Nyx restores the one current thread
- the next turn uses main-derived prior context and a lazily replayed runtime
  state
- completed, cancelled, failed, retry, and New thread behavior remain intact
- a turn interrupted by process exit restores as a safe retryable failure
- malformed persisted data fails closed and is not automatically overwritten
- New thread/Start fresh explicitly clears the durable record and runtime state
- no Recent list, thread switching, hidden history, new Thread reducer, or fake
  agent capability is introduced

## Third Workstream Success Criteria

The provider compatibility core was accepted on 2026-07-30 after:

- persisted Connections and `.env` fallback both resolve to the same explicit
  main-only protocol target shape
- the generic request preserves the same represented fields and values
- generic text and GLM-style reasoning-then-text streams use one normalized
  decoder without exposing reasoning
- reasoning-only, output-length, provider-error, unknown-finish, and
  cancellation paths have deterministic tests
- any `finish_reason=length` result fails; a partial assistant draft remains
  durable and retryable through the existing Retry path
- existing Connections version-1 records remain usable without migration
- no registry, capability schema, UI, new public error code, or renderer/OCaml
  provider surface is introduced

The live and fixture-backed evidence boundary is recorded in
[llm-chat-runthrough.md](./llm-chat-runthrough.md). The completed compatibility
core handles output exhaustion safely; it does not prevent provider-side
exhaustion or optimize provider-specific request parameters.
