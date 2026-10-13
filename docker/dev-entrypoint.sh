#!/bin/sh
set -e
pnpm install --frozen-lockfile
pnpm db:migrate:deploy
exec pnpm dev --hostname 0.0.0.0
