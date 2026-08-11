# Responses Protocol And Native Continuation Plan

Status: Active implementation source for the explicitly requested
`responses-protocol` workstream.

This plan supersedes the completed provider-compatibility core only for the
exact Responses additions and breaking development cutovers below. It does not
broaden ordinary `v1 min chat` work.

## Goal

Add OpenAI Responses as a first-class model-target protocol while preserving
the existing plain-text chat product, real streaming, one durable current
thread, Stop, Retry, New thread, images, extracted document text, target
selection, and Electron-main ownership.

For Responses targets using `store: false`, Nyx must preserve the complete
provider output items required for native multi-turn continuation instead of
reducing provider history to visible assistant text.

## Locked Decisions

### Protocol belongs to the model target

One gateway may expose models with different protocol support. Connections v2
therefore stores one explicit protocol configuration on every model:

```ts
type ModelProtocolConfig =
  | { protocol: 'openai-chat-completions' }
  | {
      protocol: 'openai-responses'
      reasoningContext: 'auto' | 'all_turns' | 'current_turn'
    }
```

The provider stores `defaultProtocolConfigForNewModels` only as the creation
default for manually added or newly discovered models. Runtime resolution reads
the selected model's explicit `protocolConfig`; there is no runtime inheritance,
hostname/model inference, probing, or fallback.

The Composer continues to select only provider/model ids. Protocol settings
remain in Connections and resolved execution remains Electron-main-only.

### Visible conversation and native continuation are separate data

The Electron-main-owned current-thread record remains the source of truth for
user-visible turns. A completed Responses assistant turn may additionally
reference one main-only continuation sidecar:

```ts
interface ProviderStateRef {
  protocol: 'openai-responses'
  stateId: string
  executionIdentity: string
  byteLength: number
  sha256: string
}
```

The sidecar contains only:

```ts
interface ResponsesContinuationStateV1 {
  version: 1
  protocol: 'openai-responses'
  effectiveReasoningContext: 'current_turn' | 'all_turns' | null
  outputItems: JsonValue[]
}
```

Do not persist the full Response, event stream, usage, error body, credentials,
base URL, or raw reasoning text. Preserve every validated output item needed as
future Responses input, including encrypted reasoning content. Top-level item
types are limited to reasoning and completed assistant messages while tools are
out of scope. Unknown top-level item types fail closed. Nested JSON remains
provider-compatible but is bounded by validated type, depth, collection,
string, and total-byte limits established by the G0 evidence gate.

Provider state never crosses shared chat contracts, preload, renderer, OCaml,
or logs. Renderer snapshots remain unchanged and redacted.

### Execution identity is exact and secret-free

The secret store moves directly to strict v2. Every credential write creates a
new random `credentialRevision` stored beside the encrypted secret in Electron
main.

Main hashes a field-named canonical JSON encoding of:

```text
providerId
normalizedBaseUrl
modelId
modelProtocolConfig
credentialRevision
```

The raw credential is never part of the persisted identity. Display-name edits
do not invalidate continuation. Endpoint, model, protocol configuration, or
credential changes do.

### Responses uses local stateless continuation

Every Responses request uses:

```json
{
  "model": "<resolved model>",
  "store": false,
  "stream": true,
  "instructions": "<system prompt>",
  "input": []
}
```

`reasoningContext=auto` omits `reasoning.context`; the other values send their
explicit value. Nyx does not use `previous_response_id`, remote conversations,
automatic protocol fallback, duplicate requests, tools, or unapproved
provider-specific parameters.

History is built from the durable turns in order:

1. map each user turn to Responses text/image input items;
2. insert the complete sidecar output items for completed turns with the exact
   current execution identity;
3. map all other eligible assistant turns from visible text;
4. exclude failed assistant drafts and include the Retry user turn once.

The preferred A -> B -> A behavior retains the entire visible conversation and
replays only A-native output items to A. G0 must prove this interleaving against
the actual relay before product code begins.

### Terminal and settlement semantics

Responses streaming recognizes semantic events. Visible deltas come from
`response.output_text.delta`; reasoning produces activity only; refusal text is
visible assistant text. Only one valid `response.completed` containing a full,
completed Response and non-empty visible output is success.

`response.incomplete`, `response.failed`, top-level `error`, EOF before a
terminal event, duplicate or out-of-order terminal events, terminal/delta text
mismatch, unsupported output items, and empty visible output are failures. They
never produce reusable provider state.

On success:

1. validate terminal visible text and provider output items;
2. write and verify the sidecar;
3. atomically settle the durable turn with completed text and the sidecar ref;
4. update the OCaml runtime projection;
5. emit Renderer completion.

If runtime projection update fails after the durable commit, the durable result
still completes for the user. Main discards the runtime client and rehydrates
before the next provider request. A failed rehydration blocks that later turn
before network execution; it does not rewrite the earlier durable result.

Cancelled, failed, and incomplete attempts may persist their existing visible
draft/error semantics but always have a null provider-state ref.

### Provider-state corruption is recoverable

Sidecars use the same prepare, verify, commit, rollback, orphan-reconcile, and
reset lifecycle as existing main-owned attachment sidecars. A missing, corrupt,
or newly out-of-bounds continuation sidecar must never be sent upstream.

Main performs one controlled durable repair that clears every provider-state
ref with the same execution identity, records only a safe content-free
diagnostic, and rebuilds the next request from the complete visible transcript.
The next completed Responses turn establishes a fresh native continuation.

## Breaking Development Cutover

This personal development project intentionally keeps no product compatibility
code for these formats:

- Connections v1;
- secret store v1;
- current-thread v1-v4.

The product accepts only Connections v2, secret store v2, and current-thread v5
after their slices land. Before each schema slice is exercised, back up and
delete the corresponding development user-data files and recreate configured
connections through the new UI. Do not add readers, upgraders, downgrade paths,
backup formats, feature flags, or legacy unions to product code.

## Workstream Order

```text
responses-protocol/S0
  -> responses-protocol/G0
  -> responses-protocol/C1
  -> responses-protocol/P1
  -> responses-protocol/D1
  -> responses-protocol/I1
  -> responses-protocol/A1
```

No later slice begins before the previous slice passes its checks and review.

## Validation Model

Automated coverage must include:

- strict schema rejection and redaction;
- exact Chat Completions and Responses request shapes;
- Responses delta, reasoning, refusal, completed, incomplete, failed, error,
  EOF, duplication, ordering, and mismatch fixtures;
- same-target continuation, A -> B -> A, target edit, credential rotation,
  Retry target switch, Stop, restart, and New thread;
- sidecar hash, corruption, repair, orphan, rollback, capacity, and reset;
- durable-first settlement and runtime failure injection;
- all existing Chat Completions, attachment, renderer snapshot, and runtime
  chat-state regressions.

Interactive acceptance must cover one real Chat Completions target and one real
Responses target, two-turn continuation, restart continuation, switching,
Stop/Retry, images, extracted documents, Connections Test, New thread, and one
packaged macOS run.

## Global Stop Conditions

Stop the active slice if:

- the actual relay does not return a complete terminal Response or does not
  accept replayed complete output items;
- `store: false` reasoning output lacks usable encrypted continuation for the
  configured reasoning target;
- A -> B -> A interleaving is rejected or changes visible conversation order;
- safe sidecar bounds cannot be established from evidence;
- raw provider state would cross Renderer, preload, shared chat, OCaml, or log
  boundaries;
- implementation would require protocol inference, silent fallback, tools, a
  general registry, multi-thread history, or a new IPC/runtime protocol;
- an active slice needs files or behavior outside its exact allowed scope.

## Non-Goals

- tools, MCP, structured output, usage, sources, remote file ids, or assistant
  rich output;
- reasoning text display or plaintext reasoning persistence;
- reasoning effort or unrelated model tuning;
- model routing roles, automatic protocol selection, or provider presets that
  silently change runtime behavior;
- persistent multi-thread history, new thread IPC, or new OCaml actions;
- a general adapter, capability, asset, or provider-state registry.
