# Responses Protocol Runthrough

Status: `responses-protocol/S0` and G0 passed. The atomic C1+P1 cutover is the
sole executable checkpoint; D1 and later remain blocked.

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

| Slice                      | Status        | Evidence |
| -------------------------- | ------------- | -------- |
| `responses-protocol/C1+P1` | executable    | G0 PASS  |
| `responses-protocol/D1`    | blocked on P1 | none     |
| `responses-protocol/I1`    | blocked on D1 | none     |
| `responses-protocol/A1`    | blocked on I1 | none     |
