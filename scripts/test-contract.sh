#!/usr/bin/env bash
# Agent-policy unit tests (near-sdk mock VM, not a sandbox node).
# Needs Rust 1.85+ because near-sys 0.2.14 uses edition 2024.
set -euo pipefail
cd "$(dirname "$0")/.."
if command -v rustup >/dev/null 2>&1 && rustup toolchain list | grep -q '^stable'; then
  exec cargo +stable test --manifest-path contracts/agent-policy/Cargo.toml -- --test-threads=1
fi
exec cargo test --manifest-path contracts/agent-policy/Cargo.toml -- --test-threads=1
