# Nyx Workspace Boundary

Nyx is split into two first-class subprojects:

- `apps/desktop`: the Electron desktop host.
- `runtime/ocaml`: the OCaml runtime core.

## Current Phase

The default desktop chat path remains owned by Electron main and does not use
OCaml. Electron main may communicate with OCaml only through explicit runtime
boundary code for local verification and the opt-in runtime-backed chat state
path behind `NYX_RUNTIME_CHAT_STATE=1`.

## Ownership

`apps/desktop` owns:

- Electron main/preload/renderer
- provider credentials
- environment variables
- current v1 min chat behavior
- desktop UI
- OS side effects
- runtime child process lifecycle for explicit main-only runtime boundary tasks

`runtime/ocaml` owns:

- runtime domain types
- runtime event model
- state transitions
- future tool scheduling semantics
- future policy/capability model
- replayable tests
- typed chat reducer semantics exposed through the local protocol

## Forbidden Coupling

- Renderer must not spawn OCaml processes.
- Renderer must not talk to OCaml directly.
- Renderer must not read secrets.
- OCaml must not read provider credentials.
- OCaml must not perform OS side effects in this phase.
- OCaml must not call model providers.
- Do not introduce FFI in this phase.

## Why apps/desktop

`desktop` names the product surface.
`Electron` names the current implementation technology.

If the desktop implementation changes later, the directory name can remain stable.
