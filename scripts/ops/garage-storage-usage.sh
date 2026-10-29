#!/usr/bin/env bash
set -Eeuo pipefail
export LC_ALL=C

if [[ "$#" -ne 2 ]]; then
  printf 'Usage: %s <garage-container> <bucket-name>\n' "$0" >&2
  exit 2
fi

container="$1"
bucket="$2"

if ! command -v docker >/dev/null 2>&1; then
  printf 'Error: docker is required and must be available on PATH.\n' >&2
  exit 1
fi

docker inspect "$container" >/dev/null

printf '== Host root filesystem ==\n'
df -hT /

printf '\n== Docker storage summary ==\n'
docker system df

printf '\n== Garage container writable layer ==\n'
container_id="$(docker inspect --format '{{.Id}}' "$container")"
docker container ls --size --filter "id=$container_id"

printf '\n== Garage container mount usage ==\n'
mounts="$(docker inspect --format '{{range .Mounts}}{{.Source}}{{"\t"}}{{.Destination}}{{"\n"}}{{end}}' "$container")"
found_mount=false
while IFS=$'\t' read -r source destination; do
  [[ -n "$source" ]] || continue
  found_mount=true
  printf '\n%s -> %s\n' "$source" "$destination"
  df -hT "$source"
  du -shx "$source"
done <<< "$mounts"

if [[ "$found_mount" == false ]]; then
  printf 'No host-backed mounts found for this container.\n'
fi

printf '\n== Garage bucket object usage ==\n'
docker exec "$container" /garage bucket info "$bucket"
