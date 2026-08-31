# Product Scope

## Project Position

Nyx is currently a minimal desktop AI chat client for personal use.

The default product remains intentionally narrow. It is not a multi-agent
product, plugin platform, knowledge system, or general AI workspace.

## Source of Truth

- Ordinary baseline: [v1-min-chat-implementation-plan.md](../v1-min-chat-implementation-plan.md)
- Stable architecture: [architecture](../architecture)
- Named workstreams and current execution contracts:
  [agent-workbench-task-slices.md](../next/agent-workbench-task-slices.md)
- Human overview: [README.md](../../README.md)
- Background only: [PRD.md](../../PRD.md), [DESIGN.md](../../DESIGN.md), and
  [v0-technical-baseline.md](../v0-technical-baseline.md)

For ordinary work, follow the baseline and architecture notes. For an already
landed or explicitly named workstream, follow its routed current-status owner.

## Stable Boundaries

- Electron Main owns provider calls, credentials, persistence, file IO, and OS
  side effects.
- Renderer state is a rebuildable projection, not durable truth.
- Preload exposes narrow typed APIs; shared contracts define cross-process data.
- Existing Connections, target selection, Responses, attachment, and Thread
  behavior must be preserved inside their routed boundaries.
- No ordinary task may add tools, agents, MCP, plugins, artifacts, cloud sync,
  Projects, Folders, Tags, or an OCaml Thread domain.

## Scope Discipline

- Do not copy dynamic workstream status into this file.
- Reading a workstream contract to protect landed behavior does not authorize
  new work from it.
- Do not expand scope just because the architecture could support it.
