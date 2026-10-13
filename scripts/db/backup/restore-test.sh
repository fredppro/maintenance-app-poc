#!/bin/sh
# Restores a dump into a throw-away database and checks it is usable.
#   restore-test.sh <dump-file>
#   RESTORE_DOCKER_CONTAINER  local postgres container to restore into
#                             (default: the docker-compose dev database)
# The scratch database is dropped afterwards. Never restore onto production.
set -eu
dump="${1:?usage: restore-test.sh <dump-file>}"
scratch="restore_test_$(date +%s)"
container="${RESTORE_DOCKER_CONTAINER:-maintenance-app-poc-postgres-1}"

run() { docker exec -i "$container" "$@"; }
trap 'run psql -U maintenance_app -d postgres -qc "DROP DATABASE IF EXISTS $scratch" >/dev/null 2>&1 || true' EXIT

run psql -U maintenance_app -d postgres -qc "CREATE DATABASE $scratch"
run pg_restore --no-owner --exit-on-error -U maintenance_app -d "$scratch" < "$dump"

orgs=$(run psql -U maintenance_app -d "$scratch" -Atc 'SELECT count(*) FROM "organization"')
migrations=$(run psql -U maintenance_app -d "$scratch" -Atc 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')
echo "restore ok: $orgs organizations, $migrations migrations applied"
[ "$migrations" -gt 0 ] || { echo "restore verification failed: no migrations" >&2; exit 1; }
