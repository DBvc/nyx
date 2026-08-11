# Responses Protocol Runthrough

Status: PASS. `responses-protocol/S0`, G0, the atomic C1+P1 cutover, D1, I1,
and A1 passed on 2026-08-11. The workstream is complete.

The active contract is
[responses-protocol-technical-plan.md](./responses-protocol-technical-plan.md).

## S0 Scope Lock

- User authorization: implement the approved long-term Responses plan without
  runtime compatibility for old development formats.
- Allowed result: documentation-only authorization for the named workstream.
- Product code changed: no.
- Verification: `mise run desktop:format-check` and `git diff --check` passed on
  2026-08-11.

## G0 Evidence Gate

Status: PASS on 2026-08-11 using an OS-temp Electron-main harness and synthetic
content only. Product TypeScript was unchanged.

The saved target model had disappeared from the relay catalog. The harness did
not rewrite Connections; it selected one currently catalogued Responses model
from the same configured provider for the gate. A separate configured Chat
Completions target supplied the B leg of A -> B -> A.

### Frozen request shape

```json
{
  "model": "<resolved model>",
  "store": false,
  "stream": true,
  "include": ["reasoning.encrypted_content"],
  "instructions": "<system prompt>",
  "input": ["<ordered items>"]
}
```

The passing target used `reasoningContext=auto`, so `reasoning.context` was
omitted. No `previous_response_id`, conversation id, tool, fallback request, or
Provider-private field was sent.

### Redacted results

| Case                       | Result                                                                                                                                                               |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reasoning seed             | one `response.completed`; output types `reasoning,message`; 1,607 output bytes; one 1,356-byte encrypted reasoning value; streamed text matched terminal text        |
| Fresh-process replay       | serialized seed output was accepted in a new Electron process; the semantic answer referenced the prior assistant result; one `response.completed`; 102 output bytes |
| A -> B -> A                | B returned one visible marker; A then reproduced that marker in order while A-native output remained interleaved; one `response.completed`; 118 output bytes         |
| PNG + extracted document   | a 6,047-byte synthetic PNG word and a separate text-envelope marker were both identified by one exact semantic assertion; one `response.completed`; 120 output bytes |
| Stop                       | local abort after the first text delta settled in 4 ms; no completed terminal was observed                                                                           |
| Rejection                  | one invalid-model Responses request returned HTTP 400; request count 1; fallback count 0                                                                             |
| Representative long output | one completed 19,684-byte visible answer produced 20,022 terminal output bytes; streamed text matched terminal text; Electron RSS delta was 32,964,608 bytes         |

Observed successful streams used semantic lifecycle events including
`response.created`, `response.in_progress`, `response.output_item.added`,
`response.content_part.added`, `response.output_text.delta`, item/content done
events when supplied by the relay, and exactly one `response.completed`.

The relay accepted explicit `all_turns` and `current_turn` request values but
did not report matching effective values consistently. Those modes therefore
do not pass Connection Test for this relay. `auto` remains usable and permits a
null effective value. Product code must validate explicit values strictly; it
must not normalize or silently fall back.

### Frozen continuation limits

G0 fixes one sidecar at 8,388,608 serialized bytes, 64 top-level output items,
depth 16, 4,096 entries per nested array, 256 keys per object, and 6,291,456
UTF-8 bytes per string. These are fail-closed validation limits, not a reason to
truncate Provider output.

No API key, Authorization header, base URL, host, personal prompt, response
text, encrypted reasoning payload, or local user-data path is recorded here.

## Product Slices

### C1+P1 Atomic Configuration And Wire Cutover

Status: PASS at `b3dd897` on 2026-08-11.

- Connections and encrypted secrets now accept only strict v2 records. Every
  model stores an explicit protocol configuration; provider defaults affect
  only new models unless the user explicitly applies them to all rows.
- Every credential write rotates a main-only revision. Resolved persisted
  targets bind a secret-free SHA-256 execution identity to provider, normalized
  endpoint, model, exact protocol configuration, and credential revision.
- The concrete wire switch preserves Chat Completions and adds exact stateless
  Responses request mapping, bounded full-output validation, fail-closed
  terminal settlement, and a two-request semantic Connection Test.
- Provider continuation output, execution identity, credential revision,
  endpoint, and secret remain absent from shared chat, preload, Renderer, and
  OCaml contracts.
- The three old Connections and secret records were byte-verified in a manual
  development backup and their v1 source files were deleted before product
  exercise. No legacy reader or migration exists. The G0 OS-temp harness and
  its transient continuation state were deleted after this commit passed.

Validation passed: desktop TypeScript and compatibility typecheck, lint, format
check, production build, `git diff --check`, and the full desktop suite with
498 passing tests and 17 intentional skips across 41 files.

### D1 Current-Thread v5 Continuation Durability

Status: PASS at `23077e5` on 2026-08-11.

- Current-thread persistence now accepts only strict v5 records; v1-v4 schemas,
  parsers, upgrades, and runtime guards were deleted.
- Completed Responses turns may reference a bounded main-only continuation
  sidecar with prepare, verify, commit, rollback, reconcile, reset, and
  same-execution-identity repair operations.
- Renderer snapshots and OCaml replay remain provider-state-free.
- Removing the obsolete current-thread version guards required an atomic
  compile-only cleanup in `chat/session.ts` and its test. This added no
  Responses history replay or settlement behavior; that remains I1.

Validation passed: desktop TypeScript and compatibility typecheck, lint, format
check, production build, `git diff --check`, 496 desktop tests with 17
intentional skips, and the runtime-backed chat-state integration check.

| Slice                      | Status    | Evidence                                         |
| -------------------------- | --------- | ------------------------------------------------ |
| `responses-protocol/C1+P1` | completed | `b3dd897`                                        |
| `responses-protocol/D1`    | completed | `23077e5`                                        |
| `responses-protocol/I1`    | completed | `0b8a542`                                        |
| `responses-protocol/A1`    | completed | `89e012e` plus the redacted product matrix below |

I1's original file list omitted the existing Responses `input` builder in
`chat/client.ts`. The executable I1 scope includes that file and its test only
for the main-only native-output-item mapping required by the already locked
exact-identity replay behavior; no protocol or product scope was added.

### I1 History Replay And Durable-First Integration

Status: PASS at `0b8a542` on 2026-08-11.

- Responses input now preserves validated native output items in durable turn
  order only for the exact current execution identity. Other targets receive
  the complete visible transcript, including A -> B -> A switching.
- Completed Responses text and its verified sidecar ref settle together before
  OCaml projection. A later runtime projection failure discards that runtime
  client without rewriting the durable user-visible result.
- Restart continuation, Stop, Retry target switching, New thread reset,
  same-identity corruption repair, sidecar rollback, and zero Provider calls
  after failed next-turn runtime rehydration have direct regression coverage.
- The old current-thread v2 development record was byte-verified in the manual
  cutover backup and deleted before product exercise. No compatibility reader
  or migration exists.

Validation passed: desktop TypeScript and compatibility typecheck, lint, format
check, production build, 503 desktop tests with 17 intentional skips, runtime
build/test/format/chat-state checks, both root runtime audit scripts, and
`git diff --check`.

### A1 Product Acceptance

Status: PASS on 2026-08-11.

The first real Responses Connection Test exposed one owning-slice parser bug:
the relay returned a completed assistant message without an item-level
`status`. The terminal Response itself was `completed`, and the official
Responses streaming example permits this output shape. C1+P1 validation was
repaired at `89e012e` to accept an omitted item status while still rejecting
every explicit status other than `completed`, tool output, raw reasoning, and
all previously sealed invalid shapes.

Redacted real-provider results:

| Case                      | Result                                                                                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responses Connection Test | the configured Responses target passed both semantic requests and native continuation replay                                                                     |
| Same-target continuation  | a clean product thread returned the first exact marker, then the first plus second marker                                                                        |
| Complete restart          | the same thread and target restored; a third turn returned all three markers in order                                                                            |
| A -> B -> A               | one Chat Completions turn was stopped, then the original Responses target completed successfully after switching back                                            |
| Stop                      | the active Chat Completions turn settled visibly as `Response stopped`                                                                                           |
| Retry                     | an intentionally unreachable saved endpoint produced a retryable network failure; after restoring the original endpoint, Retry returned the exact success marker |
| Image                     | a synthetic four-corner PNG was accepted and the Responses target identified all four colors                                                                     |
| Document                  | a synthetic strict-text attachment was accepted and its exact marker was recovered on the following Responses turn                                               |
| New thread                | reset removed the prior durable thread and selected the configured default target; later target selection remained explicit                                      |
| Chat Completions          | a separate configured Chat Completions target returned its exact success marker                                                                                  |

No API key, Authorization header, raw Provider payload, encrypted reasoning,
personal content, or local user-data path was recorded. The temporary invalid
endpoint was restored and byte-checked before acceptance closed.

After the repair, `mise run desktop:check` passed with 486 tests and 17
intentional skips across 42 files, both TypeScript checkers, lint, the
runtime-backed chat-state integration check, and the production build. The
macOS arm64 development app, DMG, and ZIP were rebuilt; package verification
passed eight checks, mounted the DMG, verified `app.asar`, and received `pong`
from the bundled OCaml runtime. The packaged app then loaded the restored
current thread from `app.asar` successfully.
