# Provider Compatibility And Adapter Direction

Status: Approved architecture direction. The bounded C0-C4 compatibility core
is completed. Any follow-up execution requires a new named slice in
[agent-workbench-task-slices.md](./agent-workbench-task-slices.md).

This document records the complete direction for expanding Nyx beyond its
bounded first `openai-compatible` connection path. Its approved implementation
boundary is split into the separately reviewed C slices.

The active product scope and workstream gates remain defined by
[agent-workbench-task-slices.md](./agent-workbench-task-slices.md). This document
does not authorize tools, agents, persistent thread history, provider calls from
the renderer, or provider integration in OCaml.

## Why A Follow-Up Is Needed

The first Connections workstream intentionally models every configured service
as one provider kind:

```text
openai-compatible
```

That is sufficient for base URL, bearer token, model id, basic connection
testing, model discovery, and ordinary `delta.content` streaming. It is not a
complete multi-provider abstraction.

Real services can share the OpenAI Chat Completions envelope while differing in:

- reasoning request parameters
- reasoning stream fields
- finish reasons and mid-stream errors
- model-list availability and response shape
- tool-call and structured-output behavior
- authentication and endpoint conventions
- output-token parameter names and accepted ranges

`OpenAI-compatible` therefore identifies a protocol family, not a provider,
gateway, model family, or complete capability contract.

## Current Compatibility Bridge

The current bounded bridge recognizes GLM-style `delta.reasoning_content` as
stream activity while continuing to expose and persist only `delta.content` as
assistant text. It also rejects an empty terminal response instead of recording
an empty completed message.

This bridge preserves the existing chat contract and fixes the immediate
failure mode, but it deliberately does not:

- send GLM-specific `thinking`, `reasoning_effort`, or output-token settings
- infer a provider from a model-name prefix
- expose reasoning text to renderer
- persist reasoning text in the current thread
- add provider-specific settings UI
- establish a general adapter registry

The completed C workstream extracted the proven stream behavior below. Future
work must not accumulate hostname checks and model-name conditionals in the
generic chat client, but it also must not introduce a registry before a second
real adapter needs runtime selection.

## Semantic Layers

Provider configuration must keep these concepts separate:

| Layer                  | Examples                                                    | Responsibility                                                 |
| ---------------------- | ----------------------------------------------------------- | -------------------------------------------------------------- |
| Connection or gateway  | Volcano Ark Coding Plan, OpenRouter, direct Zhipu           | Base URL, credentials, account boundary, endpoint availability |
| Protocol               | OpenAI Chat Completions, Anthropic Messages, Open Responses | Request and wire-envelope family                               |
| Compatibility behavior | Generic OpenAI, Ark Coding, Zhipu GLM                       | Documented request and response differences                    |
| Model capability       | reasoning, tools, vision, structured output                 | Observed behavior of a selected model                          |

Do not place values such as `volcano`, `glm`, and `openai-compatible` in one
flat enum. They describe different layers.

## First Extraction Boundary

Provider resolution should first preserve non-secret identity until request
construction without changing persisted Connections data:

```ts
interface ResolvedChatTarget {
  providerId: string | null
  baseUrl: string
  token: string
  modelId: string
  protocol: 'openai-chat-completions'
}
```

The token remains Electron-main-only. Renderer-facing status continues to use
redacted summaries.

The completed compatibility core uses pure main-only request and stream
functions from the current chat client:

```ts
buildOpenAiCompatibleChatRequest(input: NormalizedChatRequest): ProviderHttpRequest;
decodeOpenAiCompatibleStream(payload: unknown): ReadonlyArray<ProviderStreamEvent>;
normalizeOpenAiCompatibleFinishReason(reason: string | null): NormalizedFinishReason;
```

Do not wrap these functions in a one-implementation interface or registry.
Provider test and model discovery remain separate operations because a service
may support chat without supporting `/models`.

## Normalized Stream

Electron main should convert provider payloads into a small typed stream before
the chat session applies state transitions:

```ts
type ProviderStreamEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'reasoning-activity' }
  | { type: 'finish'; reason: NormalizedFinishReason; nativeReason: string | null }
  | { type: 'error'; diagnostic: 'provider_error' | 'invalid_payload' }
```

This is the complete event set for the first extraction. Usage, tools, sources,
files, and structured output must not be reserved in this contract before an
approved product slice needs them.

The decoder owns wire-payload recognition only. The existing
`streamChatCompletion` path remains the sole owner of content aggregation,
terminal policy, and mapping failures into the existing `ChatBridgeError`
contract. Do not introduce a second public or shared provider-error taxonomy.

Normalized finish reasons should include at least:

```text
stop
length
content_filter
tool_calls
error
unknown
```

Preserve the provider's native finish reason in main-owned diagnostic state,
while exposing only safe details through the existing chat error contract.

## Reasoning Policy

Reasoning and final answer text are different data classes.

Default policy:

- reasoning activity keeps the request active and cancellable
- reasoning text is not appended to assistant content
- reasoning text is not persisted in the current-thread record
- reasoning text is not sent to renderer
- reasoning text is not copied into the next provider turn
- an empty final answer is a failure, never a completed message

If future tool protocols require retained or signed reasoning state, that state
needs a separate explicit security, storage, replay, and redaction design. It
must not be smuggled into plain assistant text.

## Capability Profiles Need Evidence

Capabilities must not be guessed through scattered model-name checks. They also
must not become persisted configuration merely because providers may differ.

The first extraction should keep capability knowledge in tested request and
response mapping functions. Introduce an explicit capability profile only when
at least one of these is true:

- users must choose a provider-specific option
- two models on one gateway require different request behavior
- connection validation must report a capability separately
- a second adapter needs explicit runtime selection

At that point, define only the fields required by the observed cases. A built-in
preset may suggest a profile from a known base URL, but hostname detection must
not silently select runtime behavior.

Gateway and model capabilities remain separate. For example, one Ark connection
can expose GLM, Doubao, Kimi, and MiniMax models with different reasoning
semantics.

## Persistence And Migration

The first extraction requires no Connections store migration. If a later proven
case requires persisted adapter or capability selection, plan a versioned
migration in that task.

Migration rules:

- existing version-1 providers remain usable without rewriting their records
- no existing provider or encrypted secret is deleted
- remote model-list data cannot install executable adapter behavior
- credentials remain keyed by provider id and remain main-owned
- `.env` fallback keeps the current generic behavior

Do not change the persisted schema until a concrete selection requirement,
migration behavior, and rollback behavior are covered by deterministic tests.

## Adding A Provider

Use the smallest applicable integration path:

1. If the service follows the generic protocol behavior, add a
   connection preset only. No new chat code is needed.
2. If it uses the same protocol with documented extensions, add a reviewed
   request or stream mapping plus fixtures for those extensions.
3. If it uses a different native protocol, add a protocol adapter behind the
   same normalized stream contract.
4. Add provider-specific renderer controls only when users must choose an
   option that cannot be represented by a preset or capability default.

Create an adapter registry only when at least two concrete adapters must be
selected at runtime. The second implementation is the evidence for the registry,
not a hypothetical future provider.

Every provider integration must include captured, redacted fixtures. Fixtures
must not contain API keys, user prompts, private URLs, or raw personal
conversation content.

## Connection Validation

Future Connections UI should distinguish:

```text
Reachable and authenticated
Chat request accepted
Streaming text verified
Reasoning supported
Model discovery supported or manual-only
```

One green `Test connection` result must not imply that every optional capability
works. Compatibility-aware tests should use tiny requests, bounded timeouts,
safe errors, and no reasoning disclosure.

## Suggested Task Boundaries

The completed compatibility-core slices are:

1. `C0` locks scope, decisions, non-goals, validation, and stop conditions.
2. `C1` defines the minimal stream contract and immediately wires its pure
   decoder into the existing chat client.
3. `C2` preserves target identity and extracts the current generic request
   mapping without changing request fields.
4. `C3` adds redacted fixtures and hardens terminal semantics.
5. `C4` runs acceptance checks and synchronizes truthful documentation.

Registry, capability-profile, persisted selection, capability-aware connection
testing, and Settings controls require a later separately reviewed workstream.
They are not deferred tasks inside C0-C4.

Each step must keep the existing generic provider path usable. Do not combine a
parser extraction, storage migration, and Settings redesign in one commit.

## Dependency Decision

Do not add a general AI SDK only to fix one stream field. The current product can
support the proven compatibility path with small pure functions and existing
dependencies.

Re-evaluate a maintained provider SDK when at least one of these becomes true:

- Nyx supports several native protocols rather than compatible skins
- tool calling or structured output needs broad cross-provider normalization
- provider-specific maintenance exceeds the internal adapter boundary
- SDK behavior can be tested and packaged without weakening main-only secret
  ownership or Electron distribution

## Acceptance Matrix

The completed compatibility workstream covers:

- generic `delta.content` streaming
- reasoning followed by final text
- reasoning-only termination
- output-length termination with and without partial text
- provider mid-stream error envelopes
- cancellation during reasoning and during text
- unknown native finish reasons
- unsupported `/models` with manual model ids preserved
- existing version-1 Connections remain usable without rewriting their records
- no secrets or reasoning text crossing the renderer bridge
- retry, current-thread persistence, and runtime-backed chat state remaining
  behaviorally intact

For this workstream, `finish_reason=length` is always a retryable failure. When
text arrived first, the existing current-thread failure path must preserve that
latest assistant draft and expose the existing Retry action. This rule handles
output exhaustion safely; it does not prevent a reasoning model from exhausting
its provider-side output budget.

C4 acceptance used a live saved version-1 Ark connection with a GLM reasoning
model, plus isolated local fixtures for reasoning-only and output-length
terminal cases. The exact evidence boundary is recorded in
[llm-chat-runthrough.md](./llm-chat-runthrough.md). This is compatibility-core
evidence only, not provider-specific request optimization or proof of a general
adapter platform.

## Non-Goals

This direction does not authorize:

- tools, MCP, terminal, browser automation, or approvals
- model routing roles or a multi-Agent picker
- persistent multi-thread history
- raw reasoning display or persistence
- renderer-owned provider calls or credentials
- provider calls, credentials, or adapter execution in OCaml
- automatic installation of third-party adapter code
