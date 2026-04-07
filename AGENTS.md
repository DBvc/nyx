# AGENTS.md

Nyx is currently a minimal desktop AI chat client, not a general AI workbench.

## Start Here

- Current feature scope is defined by [docs/v1-min-chat-implementation-plan.md](/Users/sy/Code/github/nyx/docs/v1-min-chat-implementation-plan.md).
- If [README.md](/Users/sy/Code/github/nyx/README.md) or [PRD.md](/Users/sy/Code/github/nyx/PRD.md) conflicts with the min-chat plan, follow the min-chat plan.
- The most important rules are in this file. Task-specific detail lives under [docs/agent/](/Users/sy/Code/github/nyx/docs/agent/).

## Hard Rules

- Keep the app inside the current min-chat scope: single page, plain text, real streaming, no history, no persistence, no settings UI.
- Secrets and provider credentials must stay in `electron/main/` only.
- Renderer code must not read environment variables or call the provider directly.
- When changing bridge or IPC behavior, define or update the shared contract under `shared/` first.
- Run `pnpm format` after code edits. If formatter and personal style disagree, formatter wins.
- Do not add `husky` or `lint-staged` unless the team explicitly decides to replace `lefthook`.

## Commands

- `pnpm install`
- `pnpm dev`
- `pnpm build`
- `pnpm format`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm typecheck:compat`

## Task Routing

- Before changing product scope or deciding whether something belongs in this phase, read [docs/agent/product-scope.md](/Users/sy/Code/github/nyx/docs/agent/product-scope.md).
- Before changing `shared/`, `electron/main/`, `electron/preload/`, or provider/IPC flow, read [docs/agent/architecture.md](/Users/sy/Code/github/nyx/docs/agent/architecture.md).
- Before changing hooks, checks, or deciding what to run after edits, read [docs/agent/verification.md](/Users/sy/Code/github/nyx/docs/agent/verification.md).

## Automation

- `pre-commit` formats staged files and runs `oxlint` on staged JS/TS files.
- `pre-push` runs `pnpm typecheck` and `pnpm typecheck:compat`.
