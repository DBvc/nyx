#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
OCAML_DIR="$ROOT/runtime/ocaml"

fail() {
  printf 'audit failed: %s\n' "$1" >&2
  exit 1
}

warn() {
  printf 'audit warning: %s\n' "$1" >&2
}

[ -d "$OCAML_DIR" ] || fail "runtime/ocaml directory is missing"
[ -f "$OCAML_DIR/dune-project" ] || fail "runtime/ocaml/dune-project is missing"
[ -f "$OCAML_DIR/.ocamlformat" ] || fail "runtime/ocaml/.ocamlformat is missing"
[ -f "$OCAML_DIR/AGENTS.md" ] || fail "runtime/ocaml/AGENTS.md is missing"
[ -d "$OCAML_DIR/lib" ] || fail "runtime/ocaml/lib directory is missing"
[ -d "$OCAML_DIR/bin" ] || fail "runtime/ocaml/bin directory is missing"
[ -d "$OCAML_DIR/test" ] || fail "runtime/ocaml/test directory is missing"

grep_runtime_sources() {
  find "$OCAML_DIR/lib" "$OCAML_DIR/bin" "$OCAML_DIR/test" \
    -type f \( -name '*.ml' -o -name '*.mli' \) \
    -exec grep -InE "$1" {} +
}

if grep_runtime_sources 'Obj\.magic|Marshal\.from|assert false|failwith "TODO"|failwith "todo"|TODO:.*unsafe|Sys\.command|Unix\.system'; then
  fail "unsafe or placeholder pattern found in OCaml runtime sources"
fi

if grep_runtime_sources '\bopen[[:space:]]+(Base|Core|Async|Lwt|Eio)\b|\bopen![[:space:]]+(Base|Core)\b'; then
  fail "unexpected dependency style found; update AGENTS.md and opam before using it"
fi

if grep -InE '^type[[:space:]]+state[[:space:]]*=' "$OCAML_DIR/lib"/*.mli; then
  warn "public .mli exposes type state representation; a later hardening task should hide or justify this"
fi

printf 'audit passed: runtime OCaml structure and basic safety checks look OK\n'
