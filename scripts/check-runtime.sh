#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

if command -v mise >/dev/null 2>&1 && [ -f "$ROOT/mise.toml" ]; then
  mise run runtime:build
  mise run runtime:test
  mise run runtime:format-check
  mise run runtime:ping
else
  cd "$ROOT/runtime/ocaml"
  opam exec -- dune build
  opam exec -- dune runtest
  opam exec -- dune build @fmt
  opam exec -- dune exec nyx-runtime -- ping
fi
