# Responses Protocol Runthrough

Status: `responses-protocol/S0` scope lock verified. G0 has not run. G0 becomes
the sole executable slice when this docs-only change is committed; C1 and later
remain blocked until G0 passes.

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

Status: not run.

Required evidence:

- redacted exact request shape;
- ordered stream event types and terminal shape;
- output item types, bytes, and effective reasoning context;
- serialization plus fresh-process replay;
- same-target second turn and A -> B -> A interleaving;
- image and extracted-document mapping;
- abort behavior;
- maximum representative output memory and sidecar capacity evidence.

No API key, Authorization header, private base URL, personal prompt, raw
conversation content, encrypted reasoning payload, or local user-data path may
be committed here.

## Product Slices

| Slice                   | Status        | Evidence |
| ----------------------- | ------------- | -------- |
| `responses-protocol/C1` | blocked on G0 | none     |
| `responses-protocol/P1` | blocked on C1 | none     |
| `responses-protocol/D1` | blocked on P1 | none     |
| `responses-protocol/I1` | blocked on D1 | none     |
| `responses-protocol/A1` | blocked on I1 | none     |
