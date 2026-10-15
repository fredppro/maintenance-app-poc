#!/bin/sh
set -eu

./node_modules/.bin/prisma migrate deploy
./node_modules/.bin/tsx scripts/db/provision-runtime-role.ts
./node_modules/.bin/tsx scripts/db/verify-runtime-role.ts
