# Object storage

Development setup and application behavior for uploaded files. Live provider and region are unverified; see the [environment status record](../reference/environment-status.md).

## File storage

Equipment photos are stored outside the database. Postgres keeps only a
`StoredFile` metadata row; the bytes live in object storage and are served
through the authenticated `/api/files/[id]` route.

- **Accepted uploads:** single-frame PNG, JPEG, and WebP images only. The
  source file is capped at 5 MiB; the multipart request allows an additional
  64 KiB for encoding overhead. The server decodes and re-encodes each image,
  rejects images over 16 megapixels or 8,192 pixels on either edge, applies
  EXIF orientation, strips embedded metadata, and limits stored dimensions to
  4,096 pixels per edge. The normalized output must also be at most 5 MiB.
  Generic documents and animated/multi-page images are not supported.
- **Default (development):** with no `S3_*` variables, files are written under
  `.storage/`. Nothing else to set up.
- **MinIO (S3-compatible, local):** start it and create the bucket with
  `docker compose --profile storage up -d minio minio-init`, then uncomment the
  `S3_*` block in `.env` and restart `pnpm dev`. The MinIO console is at
  [http://localhost:9001](http://localhost:9001) (`minioadmin` / `minioadmin`).
- **Production:** set `S3_BUCKET` and credentials for AWS S3, MinIO, R2 or any
  S3-compatible service. Without `S3_BUCKET`, production refuses to store files.

## Object deletion and retries

When an image is removed, the application writes a deletion job to PostgreSQL
before removing its file metadata. It attempts the object deletion immediately.
If the storage provider is unavailable, the job remains durable and is retried
with bounded exponential backoff; the authenticated file route no longer has a
metadata row to serve. A claim lease prevents concurrent maintenance runs from
continually processing the same job. Jobs survive organization deletion so a
tenant purge does not erase the only record of an object that failed to delete.

`pnpm ops:storage:cleanup` processes up to 100 due jobs using the migration
owner connection and the configured storage provider. The
`maintenance-jobs.yml` workflow invokes it as part of its daily maintenance
run. Image uploads that have not been linked to an equipment photo or
organization logo are also deleted after a seven-day grace period. Linking a
file clears its deadline in the same transaction that saves the record.

**Automated orphan cleanup depends on the maintenance workflow being configured
and running.** The workflow skips when `MIGRATION_DATABASE_URL` is missing; when
`S3_BUCKET` is configured, it also skips unless both `S3_CLEANUP_*` credentials
are present. The cleanup command needs the migration/owner database connection
and the configured storage provider credentials. Verify the workflow's
`production-maintenance` environment secrets and successful run history; the
workflow definition alone does not prove cleanup is active. If it is not
configured, run `pnpm ops:storage:cleanup` manually from an operator environment
with the required credentials.

The command exits unsuccessfully when provider errors remain or either batch
limit leaves more work. The first retry is scheduled one minute later, with
exponential backoff capped at 24 hours; a manual run processes jobs once their
retry time is due. Persistent queueing does not reconcile objects whose upload
failed before a deletion job could be written; that simultaneous
database/storage failure still requires operator investigation.

The manual `pnpm ops:storage:inventory -- --older-than-hours <hours>` command
compares aged bucket objects with file/export metadata and pending deletion
jobs. It requires a database role that can bypass tenant RLS and a separate
read-only bucket-list credential; it never deletes objects. Results are
candidates for operator review, not proof that an object is safe to remove. See the
[storage capacity and portability runbook](../operations/storage-capacity-and-portability.md)
for its limitations and usage.
