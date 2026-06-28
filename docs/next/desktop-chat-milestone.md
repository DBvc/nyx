# Desktop Chat Milestone

Date: 2026-06-27

## Status

Nyx now has a verified Electron desktop `v1 min chat` loop. The product remains
a minimal single-page chat client, not a general AI workbench.

Implemented:

- single-page desktop chat shell
- plain-text user and assistant messages
- real provider traffic from Electron main
- streaming assistant responses
- temporary in-memory conversation state
- `Stop`
- `Retry`
- `New chat`
- redacted provider setup status in the renderer
- visible empty, provider missing, streaming, failed retry, and cancelled states

Still out of scope:

- persistent history
- settings UI
- model picker UI
- Markdown or code highlighting
- tools, agents, plugins, or artifacts
- cloud sync
- multimodal features

## Runthrough

The real provider runthrough is recorded in
[llm-chat-runthrough.md](./llm-chat-runthrough.md).

Summary:

- Provider host: `ark.cn-beijing.volces.com`
- Model: `glm-5.2`
- Missing config: pass
- Provider setup: pass
- Basic streaming: pass
- Stop: pass
- Retry: pass
- New chat: pass

No token values, full provider URLs, authorization headers, request logs, or
screenshots are committed.

## Code Entry Points

Desktop app:

- [apps/desktop/electron/main/index.ts](../../apps/desktop/electron/main/index.ts)
- [apps/desktop/electron/preload/index.ts](../../apps/desktop/electron/preload/index.ts)
- [apps/desktop/src/ui/App.tsx](../../apps/desktop/src/ui/App.tsx)

Shared contracts:

- [apps/desktop/shared/contracts/desktop.ts](../../apps/desktop/shared/contracts/desktop.ts)
- [apps/desktop/shared/chat/types.ts](../../apps/desktop/shared/chat/types.ts)
- [apps/desktop/shared/chat/events.ts](../../apps/desktop/shared/chat/events.ts)
- [apps/desktop/shared/provider/types.ts](../../apps/desktop/shared/provider/types.ts)

Electron main provider/chat boundary:

- [apps/desktop/electron/main/chat/env.ts](../../apps/desktop/electron/main/chat/env.ts)
- [apps/desktop/electron/main/chat/client.ts](../../apps/desktop/electron/main/chat/client.ts)
- [apps/desktop/electron/main/chat/session.ts](../../apps/desktop/electron/main/chat/session.ts)
- [apps/desktop/electron/main/chat/errors.ts](../../apps/desktop/electron/main/chat/errors.ts)

Renderer chat UI:

- [apps/desktop/src/ui/chat/use-chat-session.ts](../../apps/desktop/src/ui/chat/use-chat-session.ts)
- [apps/desktop/src/ui/chat/use-provider-status.ts](../../apps/desktop/src/ui/chat/use-provider-status.ts)
- [apps/desktop/src/ui/chat/use-auto-scroll.ts](../../apps/desktop/src/ui/chat/use-auto-scroll.ts)
- [apps/desktop/src/ui/chat/components](../../apps/desktop/src/ui/chat/components)

Tests:

- [apps/desktop/src/ui/chat/chat-reducer.test.ts](../../apps/desktop/src/ui/chat/chat-reducer.test.ts)
- [apps/desktop/src/ui/chat/chat-presenters.test.ts](../../apps/desktop/src/ui/chat/chat-presenters.test.ts)
- [apps/desktop/electron/main/chat/env.test.ts](../../apps/desktop/electron/main/chat/env.test.ts)
- [apps/desktop/electron/main/chat/client.test.ts](../../apps/desktop/electron/main/chat/client.test.ts)

## Security Boundary

- Renderer does not read `process.env`.
- Renderer does not receive provider tokens.
- Renderer does not receive the full provider base URL.
- Renderer does not receive raw provider config.
- Electron main reads provider env and owns provider calls.
- Electron main owns active cancellation handles.
- Provider setup status exposed to renderer is redacted to configured state,
  missing env names, hostname, and model only.

## Runtime Boundary

The OCaml runtime under [runtime/ocaml](../../runtime/ocaml) remains independent.
It is not imported, spawned, or called by the Electron desktop app.

Current runtime boundary docs:

- [../architecture/workspace-boundary.md](../architecture/workspace-boundary.md)
- [../architecture/runtime-protocol.md](../architecture/runtime-protocol.md)

## Verification

The milestone uses these checks:

```sh
mise run desktop:check
mise run runtime:check
mise run check
mise run desktop:build
```

For manual provider verification, configure a local root `.env` from
[.env.example](../../.env.example), then start the desktop app:

```sh
mise run desktop:dev
```

`mise run desktop:dev` loads the root `.env` automatically. The local `.env`
file must not be committed.
