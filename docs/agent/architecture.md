# Architecture

## Layer Responsibilities

- `shared/`: pure contracts, chat types, IPC event shapes, no privileged behavior
- `electron/main/`: environment access, real network calls, streaming control, cancellation, privileged logic
- `electron/preload/`: narrow bridge from renderer to main, no secret exposure
- `src/`: renderer UI, local interaction state, display logic only

## Security Boundary

- `NYX_API_BASE_URL`, `NYX_API_TOKEN`, and `NYX_MODEL` are read in `electron/main/` only.
- Renderer code must not access provider credentials, raw environment reads, or direct provider SDK calls.
- Preload should expose the smallest useful surface. Do not leak Node APIs, raw upstream objects, or secrets across the bridge.

## Change Order

When changing chat flow, keep this order:

1. Update shared contract under `shared/`
2. Update `electron/main/`
3. Update `electron/preload/`
4. Update renderer state and UI in `src/`

This reduces bridge drift and prevents each layer from inventing its own protocol.

## Current Architectural Bias

- Keep functions and modules explicit rather than overly abstract
- Prefer a thin provider adapter over speculative platform layers
- Keep only one active assistant generation at a time until the product scope expands
- Keep chat state in memory for this phase, do not introduce persistence without an explicit scope decision

## When Adding New Surface Area

- New IPC or bridge features must be typed in `shared/`
- New privileged work belongs in `electron/main/`
- If a change would require secrets or provider calls in renderer, stop and redesign it
