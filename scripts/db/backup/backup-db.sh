#!/bin/sh
# Logical backup of the production database.
#   BACKUP_DATABASE_URL  read-only/owner URL (use the unpooled connection)
#   BACKUP_DIR           output directory (default ./backups)
#   BACKUP_S3_URI        optional s3://bucket/prefix — copy to an account/bucket the app cannot write to
# Uses the local pg_dump when present, otherwise the postgres:17 image.
set -eu
: "${BACKUP_DATABASE_URL:?BACKUP_DATABASE_URL is required}"
dir="${BACKUP_DIR:-./backups}"
file="maintenance-$(date -u +%Y%m%dT%H%M%SZ).dump"
mkdir -p "$dir"

if command -v pg_dump >/dev/null 2>&1; then
  pg_dump --format=custom --no-owner --file="$dir/$file" "$BACKUP_DATABASE_URL"
else
  docker run --rm -e URL="$BACKUP_DATABASE_URL" -v "$(cd "$dir" && pwd):/out" postgres:17-alpine \
    sh -c 'pg_dump --format=custom --no-owner --file="/out/'"$file"'" "$URL"'
fi
(cd "$dir" && shasum -a 256 "$file" > "$file.sha256")

if [ -n "${BACKUP_S3_URI:-}" ]; then
  aws s3 cp "$dir/$file" "${BACKUP_S3_URI%/}/$file" --only-show-errors
  aws s3 cp "$dir/$file.sha256" "${BACKUP_S3_URI%/}/$file.sha256" --only-show-errors
fi
echo "$dir/$file"
