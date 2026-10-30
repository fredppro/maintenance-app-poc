# Garage and VPS storage usage

The container and bucket names in the example are repository-recorded
staging identifiers, not a live inventory. Confirm the current container,
bucket, and host before running the read-only utility. See
[environment status](../reference/environment-status.md).

Use this read-only check to distinguish the size of uploaded objects from the
space actually used on the VPS. Garage's bucket total is the logical object
size; Docker volume and filesystem usage include storage overhead and other
data on the host.

## Run the utility

From the repository root on your Mac, copy the helper to the VPS:

```sh
scp scripts/ops/garage-storage-usage.sh ops@10.242.0.1:/home/ops/garage-storage-usage.sh
```

Then run it on the VPS. `sudo` is needed to inspect Docker and measure its
volume directories:

```sh
ssh -t ops@10.242.0.1 'sudo bash /home/ops/garage-storage-usage.sh garage-cor2rjs7kkkpwvyp6xtih5q9 maintenance-staging-files'
```

The report includes:

- Root filesystem capacity and free space (`df`).
- Docker's aggregate storage summary and the Garage container's writable layer.
- Each host-backed Garage mount's filesystem capacity and directory usage.
- Garage's object count and logical byte total for `maintenance-staging-files`.

The Garage mount directory is the best estimate of Garage's actual disk
footprint. The bucket total is useful for tracking uploaded image growth, but
does not represent all VPS usage or include every filesystem and storage
overhead. Use the mount's `df` line to see the free space on the filesystem
that holds it.

Run this periodically and before large uploads or deployments. If the mount
filesystem is approaching capacity, plan to expand storage or move data before
it becomes full; a full disk can affect Garage and other services on the VPS.
The utility does not delete data or change the server.

## Read-only orphan inventory

The application storage adapter can list object keys and metadata, but listing
is used only by the manual inventory command, not by application request paths.
Run from a protected operator environment with a migration connection that can
bypass row-level security and choose an age threshold explicitly. The command
checks the connected role and refuses to produce an incomplete cross-tenant
inventory:

```sh
pnpm ops:storage:inventory -- --older-than-hours 48
```

For S3-compatible storage, configure `S3_AUDIT_ACCESS_KEY_ID` and
`S3_AUDIT_SECRET_ACCESS_KEY` as a separate read-only credential with permission
to list the configured bucket. The command intentionally refuses to use the
application's object-write credential for this operation. Local development
uses the local storage directory and does not need S3 audit credentials.

The JSON report lists only objects older than the selected threshold that have
no matching stored-file metadata, export metadata, or deletion-outbox job. It
also reports counts for objects with missing size or modification-time
metadata. Use an application-specific bucket; a bucket shared with unrelated
writers can make their objects appear as candidates. The inventory is a
read-only point-in-time comparison; concurrent uploads/deletes can affect
results. A candidate is not proof that an object is safe to remove. This
command never deletes objects or queues deletion jobs. Review and verify
candidates before any separately approved cleanup.

## Garage portability validation (proposed; provider test not run)

The application storage interface supports object listing for inventory, but
does not provide a bulk-copy operation. The inventory command and this usage
utility do not prove that Garage data can be migrated or restored.

The focused local `src/lib/storage/storage.test.ts` suite passed 7 tests on
2026-10-29. Those tests cover local-file operations, storage backend selection,
credential validation, and image-type detection; they do not issue S3 requests
or validate Garage/provider portability.

For a future portability rehearsal, use synthetic files and disposable source
and destination buckets in an isolated environment. Inventory object keys
using the storage providers' administrative tooling, copy objects while
preserving keys and content types, compare object counts and total bytes, and
verify SHA-256 checksums for representative objects. Then exercise the
application's authenticated read path and export flow against the destination.
Do not delete the source or switch live traffic as part of this test. Any
production cutover requires a separately approved write-freeze or dual-write
plan, rollback criteria, and verified independent backups.
