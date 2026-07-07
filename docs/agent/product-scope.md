# Product Scope

## Project Position

Nyx is currently a minimal desktop AI chat client for personal use.

This phase is intentionally narrow. It is not trying to be a multi-agent product, a plugin platform, a knowledge system, or a full AI workspace.

## Source of Truth

- Primary source: [docs/v1-min-chat-implementation-plan.md](../v1-min-chat-implementation-plan.md)
- Background only: [README.md](../../README.md), [PRD.md](../../PRD.md), [docs/v0-technical-baseline.md](../v0-technical-baseline.md)

If those documents disagree, follow the min-chat implementation plan.

## In Scope Right Now

- Single-page desktop chat UI with a lightweight sidebar shell
- Plain-text messages only
- Real model traffic through an OpenAI-compatible relay
- Real streaming output
- Temporary multi-turn conversation during the current app session
- `Stop`
- `Retry`
- `New chat` / clear current thread
- Environment-based provider configuration
- Secret handling only in Electron `main`
- Electron-main-only runtime-backed chat state

## Explicitly Out of Scope

- Settings UI
- Model picker
- Conversation history
- Local persistence or restart recovery
- Markdown rendering or code highlighting
- Skills, agents, artifacts, tools, memory
- Team workflows, sync, cloud features
- Windows, Linux, MAS, x64, or universal packaging targets

## Scope Discipline

- If a change does not directly improve the current chat loop, default to deferring it.
- Do not expand scope just because the architecture could support it.
- If you touch a broader document, do not silently re-expand the product definition.
