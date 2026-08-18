# Agent Workbench Task Slices

Status: compatibility router and global workstream rules.

<!-- nyx-contract-layout: split-v1 -->

This router preserves the historical entry path. It owns no current workstream
status and grants no implementation permission by itself. Follow the exact
workstream link below, then apply only a currently executable named slice.

These contracts supersede earlier external AGW-00..13 draft ordering. Ordinary
Nyx work remains governed by
[v1-min-chat-implementation-plan.md](../v1-min-chat-implementation-plan.md).

## Global Rules

Always follow:

```text
AGENTS.md
apps/desktop/AGENTS.md
runtime/ocaml/AGENTS.md when editing runtime/ocaml
```

Unless an exact slice explicitly says otherwise, do not implement Ask/Work or
multi-Agent selection, planner/executor/reviewer routing UI, tools, MCP,
terminal/browser automation, fake artifacts or file context, approval cards,
details drawer, renderer secret/provider/runtime access, OCaml provider calls,
or unrelated workbench behavior.

Multi-Thread Library is the sole routed exception for persistent Thread history,
switching, typed Thread Library IPC, and SQLite. Its exception applies only
inside a currently executable qualified slice and does not authorize Projects,
Folders, Tags, tools, agents, cloud sync, or a new OCaml Thread domain.

Use relative documentation links. Do not add machine-local absolute paths.

Reading a contract to protect already-landed behavior is not authorization to
execute a new slice.

## Workstream Routes

- [Foundation](./agent-workbench-foundation-task-slices.md)
- [Current Thread Durability](./current-thread-durability-task-slices.md)
- [Provider Compatibility Core](./provider-compatibility-core-task-slices.md)
- [Composer Target Selection](./composer-target-selection-task-slices.md)
- [Context Composer Experiment](./context-composer-experiment-task-slices.md)
- [Responses Protocol](./responses-protocol-task-slices.md)
- [Document Attachments](./document-attachments-task-slices.md)
- [Multi-Thread Library](./multi-thread-library-task-slices.md)
- [Multi-Thread Library E1R contract history](./multi-thread-library-e1r-contracts.md)

Each linked workstream file is the sole current-status owner for that
workstream. The E1R history file owns contract text only; MTL current status
remains solely in the Multi-Thread Library task-slices file.
