#!/bin/sh
set -eu

# Agent instruction and skill files may contain upstream-relative links.
find . \
  \( -type d \( -name .git -o -name node_modules -o -name .next -o -name .turbo -o -name coverage -o -name .terraform -o -name generated -o -name dist -o -name build -o -path './.agents' -o -path './.gemini' \) -prune \) -o \
  \( -type f -name '*.md' ! -path './AGENTS.md' ! -path './CLAUDE.md' ! -path './GEMINI.md' -print0 \) |
  xargs -0 pnpm exec markdown-link-check --quiet --config .markdown-link-check.json
