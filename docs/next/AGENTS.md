# docs/next/AGENTS.md

This directory contains gated workstream contracts, reviewed technical plans,
and durable runthrough evidence.

## Document Roles

- `agent-workbench-task-slices.md` is the compatibility router and global-rule
  entry point. It owns no current workstream status.
- Each routed `*-task-slices.md` file is the sole current-status and execution
  contract owner for its named workstream.
- `multi-thread-library-e1r-contracts.md` owns preserved contract text only. It
  does not own Multi-Thread Library status or execution permission.
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

## Structural Migration Record

`agent-workbench-contract-migration.json` is a provenance record for the split.
It records the pre-split source identity, original line ownership, observed
self-reference replacements, and initial target hashes. It is not a reversible
migration recipe.

`mise run docs:check` validates only the current tree: routes, globally unique
owners and contract markers, current body hashes, links, and manifest shape.
It does not parse Markdown rendering or infer execution state from prose.
It does not require historical Git objects. `mise run docs:migration-check` is
the optional one-time audit for the recorded source commit, complete source line
disposition, and source range hashes.

The old entry path must remain a compatibility router. Future structural moves
must update router, owner markers, migration record, and links atomically; never
create a dual-owner or ownerless intermediate state.

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
