# Verification

## Default Commands

- `pnpm format`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm typecheck:compat`

## Change-Based Validation

### Shared Contracts, Main, or Preload

Run at least:

- `pnpm format`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm typecheck:compat`
- `pnpm build`

### Renderer UI or Interaction State

Run at least:

- `pnpm format`
- `pnpm lint`
- `pnpm typecheck`

Run `pnpm build` too if the change affects routing, preload usage, or Electron-facing state.

### Hooks and Tooling

After changing formatter, lint, scripts, or git hooks, run:

- `pnpm format`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm typecheck:compat`

## Git Hooks

- `pre-commit`: formats staged files and runs `oxlint` on staged JS/TS files
- `pre-push`: runs `pnpm typecheck` and `pnpm typecheck:compat`

## Manual Runtime Checks

When changing the streaming chat loop, manually verify these if environment variables are available:

- Send a prompt and receive real streaming output
- Stop a running response
- Retry after a failure
- Start a new chat and confirm the current in-memory thread clears

## Decision Rule

If you are unsure which checks to run, choose the more complete set rather than the smaller one.
