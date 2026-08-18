# docs/next/AGENTS.md

This directory contains gated workstream contracts, reviewed technical plans,
and durable runthrough evidence.

## Document Roles

- `agent-workbench-task-slices.md` is the canonical execution gate and current
  workstream status owner until the reviewed split is completed.
- `*-task-slices.md` files may own current execution status only after the
  canonical split lands atomically.
- `*-technical-plan.md` files own reviewed design and architecture. They do not
  grant execution permission by themselves.
- `*-runthrough.md` files own evidence, experiments, and history. They do not
  grant execution permission.
- handoff and direction documents provide context only unless the canonical
  task contract explicitly binds them.

## Ownership Rules

- Each workstream has exactly one current-status owner.
- Each canonical contract id has exactly one definition owner.
- Historical references may repeat an id, but they must not look like canonical
  definitions or grant execution scope.
- Multi-Thread Library has one workstream status owner. E1R/NF1 material remains
  part of that workstream; a separate E1R contract file may own contract text,
  but never a second copy of MTL current status.
- Do not create a central `STATUS.md`. Current state belongs beside the
  canonical workstream contract.

## Current Structural Gate

Do not split or rewrite `agent-workbench-task-slices.md` while its active
exact-byte NF1 process lacks a canonical reviewed terminal state or an explicit
retirement decision. This rule does not authorize running or retiring NF1.

Before the split:

- keep `agent-workbench-task-slices.md` as the sole current-status owner
- allow AGENTS cleanup and checker work that does not change its bytes
- do not create partial workstream owners or temporary duplicate status files

When the prerequisite is satisfied, the split must:

- record the source file exact SHA-256 and a reviewed block migration manifest
- establish machine-readable workstream-status and contract-definition owners
- move each canonical block exactly once without simultaneous prose cleanup
- replace the old path with a compatible router in the same commit
- switch every owner atomically, with no dual-owner or ownerless intermediate
- remain recoverable by reverting that single structural commit

## Editing Rules

- Preserve exact-byte reviewed plans and active gate contracts unless the user
  explicitly authorizes the required amendment or slice.
- Do not change product behavior, execution authorization, dependency order,
  or stop conditions during structural documentation work.
- Keep dynamic status, review identities, commit hashes, and experiment history
  out of root and subproject AGENTS files.
- Use relative links. Do not add machine-local absolute paths.
- Run `mise run docs:check`, `mise run format-check`, and `git diff --check`
  after documentation structure changes.
