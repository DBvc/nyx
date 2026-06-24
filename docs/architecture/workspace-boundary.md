# Nyx Workspace Boundary

Nyx is split into two first-class subprojects:

- `apps/desktop`: the Electron desktop host.
- `runtime/ocaml`: the OCaml runtime core.

## Current Phase

The current phase only establishes project structure. Electron and OCaml do not communicate yet.

## Ownership

`apps/desktop` owns:

- Electron main/preload/renderer
- provider credentials
- environment variables
- current v1 min chat behavior
- desktop UI
- OS side effects

`runtime/ocaml` owns:

- runtime domain types
- runtime event model
- state transitions
- future tool scheduling semantics
- future policy/capability model
- replayable tests

## Forbidden Coupling

- Renderer must not spawn OCaml processes.
- Renderer must not read secrets.
- OCaml must not read provider credentials.
- OCaml must not perform OS side effects in this phase.
- Do not introduce FFI in this phase.

## Why apps/desktop

`desktop` names the product surface.
`Electron` names the current implementation technology.

If the desktop implementation changes later, the directory name can remain stable.
