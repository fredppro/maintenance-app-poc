#!/bin/sh
set -eu

find . \
  \( -type d \( -name .git -o -name node_modules -o -name .next -o -name .turbo -o -name coverage -o -name .terraform -o -name generated -o -name dist -o -name build \) -prune \) -o \
  \( -type f -name '*.md' -print0 \) |
  xargs -0 pnpm exec markdown-link-check --quiet --config .markdown-link-check.json
